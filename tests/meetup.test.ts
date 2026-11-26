import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST as mcpPost } from "../apps/web/app/api/mcp/[token]/route";
import { POST as workflowPost } from "../apps/web/app/api/projects/[id]/workflow/route";
import { POST as chatPost } from "../apps/web/app/api/helper/chat/route";
import { POST as finishPost } from "../apps/web/app/api/meetup/finish/route";
import { createUser } from "../apps/web/lib/users";
import { userSessionValue } from "../apps/web/lib/session";
import { MEETUP_FINISH, isMeetup, meetupPrompt } from "../apps/web/lib/meetup";
import type { LocalProject } from "../apps/web/lib/project-types";

// MEETUP: 2026-11-28 밋업 시연 모드. 밋업이 끝나 lib/meetup.ts를 지울 때 이 파일도 같이 지운다.
const SECRET = "test-secret-for-meetup-mode-0123456789abcdef";
let folder: string;

describe("밋업 시연 모드", () => {
  beforeAll(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "forge-meetup-"));
    vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
    vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("APP_BASE_URL", "https://forge.example");
  });
  afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });

  it("아이디어는 AI 없이 적히고, 설계는 잠기고, 완성을 누르면 편지가 온다", async () => {
    const { token } = await createUser("밋업 테스트", false);
    let n = 0;
    const tool = async (name: string, args: Record<string, unknown>) => (await (await mcpPost(new NextRequest(`http://localhost/api/mcp/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }) }), { params: Promise.resolve({ token }) })).json()).result as { content: Array<{ text: string }>; structuredContent?: Record<string, any>; isError?: boolean };
    const seed = JSON.parse(await readFile(path.join(__dirname, "..", "apps", "web", "lib", "bench", "sam-seed.json"), "utf8")) as { calls: Array<{ tool: string; args: Record<string, unknown> }> };
    let id = "";
    for (const call of seed.calls) {
      const result = await tool(call.tool, JSON.parse(JSON.stringify(call.args).replaceAll("$PROJECT", id)));
      expect(result.isError, `${call.tool}: ${result.content?.[0]?.text}`).toBeFalsy();
      if (call.tool === "create_project") id = result.structuredContent!.id as string;
    }

    // 다른 프로젝트는 시연 모드가 아니다
    const other = await tool("create_project", { idea: "창문이 열리면 알려주는 센서", plan: { projectName: "창문 알리미", oneLiner: "창문 센서", reply: "좋아요", slotUpdates: [], tasks: [] } });
    expect(isMeetup({ idea: "창문이 열리면 알려주는 센서" })).toBe(false);
    expect(other.isError).toBeFalsy();

    // 시드가 끝난 뒤에는 설계를 바꾸는 도구가 거절된다
    const circuit = seed.calls.find((c) => c.tool === "submit_circuit")!;
    const blocked = await tool("submit_circuit", JSON.parse(JSON.stringify(circuit.args).replaceAll("$PROJECT", id)));
    expect(blocked.isError).toBe(true);
    expect(blocked.content[0].text).toContain("밋업 시연용");
    expect((await tool("get_project", { projectId: id })).isError).toBeFalsy();

    const cookie = "dalgeurak_session=" + userSessionValue(token);
    const headers = { "content-type": "application/json", origin: "http://localhost:3000", cookie };
    const act = async (body: unknown) => (await workflowPost(new NextRequest(`http://localhost:3000/api/projects/${id}/workflow`, { method: "POST", headers, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })).json();
    for (const action of ["approve_circuit", "approve_mockup", "enter_workshop"]) expect((await act({ action })).error).toBeUndefined();

    // 연결 앱이 꺼져 있어도 아이디어는 바로 적힌다
    const say = async (text: string) => (await chatPost(new NextRequest("http://localhost:3000/api/helper/chat", { method: "POST", headers, body: JSON.stringify({ projectId: id, text, channel: "main" }) }))).json() as Promise<{ jobId: string | null; project: LocalProject; error?: string }>;
    const one = await say("배터리로 들고 다닐 수 있으면 좋겠어요");
    expect(one.error).toBeUndefined();
    expect(one.jobId).toBeNull();
    expect(one.project.messages.at(-1)!.text).toContain("1번째 현장 아이디어");
    const two = await say("앱에서 엑셀로 바로 내보내고 싶어요");
    expect(two.project.meetup!.ideas.map((i) => i.text)).toEqual(["배터리로 들고 다닐 수 있으면 좋겠어요", "앱에서 엑셀로 바로 내보내고 싶어요"]);
    expect(meetupPrompt(two.project)).toContain("2. 앱에서 엑셀로 바로 내보내고 싶어요");

    // 완성: 연결 앱이 없으면 정해진 기준의 편지가 바로 온다. 축하 → 편지 → 아이디어마다 조언
    const finish = async () => (await finishPost(new NextRequest("http://localhost:3000/api/meetup/finish", { method: "POST", headers, body: JSON.stringify({ projectId: id, channel: "main" }) }))).json() as Promise<{ jobId: string | null; project: LocalProject }>;
    const done = await finish();
    expect(done.jobId).toBeNull();
    const letter = done.project.messages.at(-1)!;
    expect(done.project.messages.at(-2)!.text).toBe(MEETUP_FINISH);
    expect(letter.agent).toBe("chief");
    expect(letter.text.indexOf("축하")).toBeLessThan(letter.text.indexOf("편지를 하나 준비했어요"));
    expect(letter.text).toContain("**1번째 아이디어** — 배터리로 들고 다닐 수 있으면 좋겠어요");
    expect(letter.text).toContain("전자회로 달그락");
    expect(letter.text).toContain("소프트웨어 달그락");
    // 한 번 더 눌러도 '완성했어요'가 겹쳐 쌓이지 않는다
    const again = await finish();
    expect(again.project.messages.filter((m) => m.text === MEETUP_FINISH)).toHaveLength(1);
    // 설계는 그대로다
    expect(again.project.build!.blueprint.components!.map((c) => c.ref)).toEqual(["U1", "HX1", "LC1"]);
  });
});
