import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST as mcpPost } from "../apps/web/app/api/mcp/[token]/route";
import { POST as workflowPost } from "../apps/web/app/api/projects/[id]/workflow/route";
import { createUser } from "../apps/web/lib/users";
import { userSessionValue } from "../apps/web/lib/session";
import { guideToKit } from "../apps/web/lib/bench/from-guide";
import { findCard } from "../apps/web/lib/parts/catalog";
import type { LocalProject } from "../apps/web/lib/project-types";

// 밋업 시연용 '사만다 재고 저울' 시드(apps/web/lib/bench/sam-seed.json)가 지금 도구 규칙으로 그대로 들어가는지,
// 그리고 3D 작업대에서 보드 소켓과 HX711 헤더가 같은 자리에서 만나는지 본다.
const SECRET = "test-secret-for-sam-seed-0123456789abcdef";
let folder: string;

describe("SAM 시드", () => {
  beforeAll(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "forge-sam-seed-"));
    vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
    vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("APP_BASE_URL", "https://forge.example");
  });
  afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });

  it("부품 카드 3개가 있고 핀 이름이 실물과 같다", () => {
    expect(findCard("m5stack-atoms3-lite")!.pins.map((p) => p.name)).toEqual(["3V3", "G5", "G6", "G7", "G8", "G39", "G38", "5V", "GND", "G2", "G1"]);
    expect(findCard("hx711-module")!.pins.map((p) => p.name)).toEqual(["E+", "E-", "A-", "A+", "B-", "B+", "GND", "DT", "SCK", "VCC"]);
    expect(findCard("loadcell-bar-5kg")!.pins.map((p) => p.name)).toEqual(["RED", "BLK", "WHT", "GRN"]);
  });

  it("시드가 순서대로 다 들어가고, 승인 뒤 3D 작업대 키트가 된다", async () => {
    const { token } = await createUser("시드 테스트", false);
    let n = 0;
    const tool = async (name: string, args: Record<string, unknown>) => (await (await mcpPost(new NextRequest(`http://localhost/api/mcp/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }) }), { params: Promise.resolve({ token }) })).json()).result as { content: Array<{ text: string }>; structuredContent?: Record<string, any>; isError?: boolean };
    const seed = JSON.parse(await readFile(path.join(__dirname, "..", "apps", "web", "lib", "bench", "sam-seed.json"), "utf8")) as { calls: Array<{ tool: string; args: Record<string, unknown> }> };
    let id = "";
    const notes: string[] = [];
    for (const call of seed.calls) {
      const args = JSON.parse(JSON.stringify(call.args).replaceAll("$PROJECT", id));
      const result = await tool(call.tool, args);
      expect(result.isError, `${call.tool}: ${result.content?.[0]?.text}`).toBeFalsy();
      notes.push(`${call.tool}: ${result.content[0].text.slice(0, 400)}`);
      if (call.tool === "create_project") id = result.structuredContent!.id as string;
      if (call.tool === "submit_circuit") expect(result.structuredContent!.blockedChecks).toEqual([]);
    }
    if (process.env.SAM_SEED_VERBOSE) console.log(notes.join("\n\n"));

    // 사람의 승인 세 번: 회로 → 3D → 대장간 입장
    const cookie = "dalgeurak_session=" + userSessionValue(token);
    const act = async (body: unknown) => (await workflowPost(new NextRequest(`http://localhost:3000/api/projects/${id}/workflow`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })).json();
    let last: { project?: LocalProject; error?: string } = {};
    for (const action of ["approve_circuit", "approve_mockup", "enter_workshop"]) { last = await act({ action }); expect(last.error, `${action}: ${last.error}`).toBeUndefined(); }
    const project = last.project!;
    expect(project.workflow!.phase).toBe("workshop");

    const kit = guideToKit(project)!;
    expect(kit.parts.filter((p) => p.kind === "module").map((p) => p.ref)).toEqual(["LC1", "HX1", "U1"]);
    // 꽂는 자리: HX711 헤더 핀과 보드 소켓 구멍이 위에서 볼 때 같은 점이어야 한다
    const pin = (ref: string, name: string) => kit.parts.find((p) => p.ref === ref)!.spec!.pinXY!.find((p) => p.name === name)!;
    for (const [hx, atom] of [["VCC", "3V3"], ["SCK", "G5"], ["DT", "G6"], ["GND", "G7"]]) {
      expect(pin("HX1", hx).x).toBeCloseTo(pin("U1", atom).x, 1);
      expect(pin("HX1", hx).y).toBeCloseTo(pin("U1", atom).y, 1);
    }
    expect(kit.parts.find((p) => p.ref === "U1")!.spec!.foot!.lift).toBe(6.8);
    expect(kit.steps.slice(0, 5).map((s) => !!s.prepared)).toEqual([true, true, false, false, false]);
    expect(kit.steps.some((s) => s.ops.some((o) => o.op === "enclose"))).toBe(true);
  });
});
