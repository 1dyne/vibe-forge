import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { approveContract, pickReferences, powerBudget, proposeBrief, proposeContract, addReferences, staleForContract } from "../apps/web/lib/agreements";
import { finalizeBlockers, recordPurchase, upsertTask } from "../apps/web/lib/coordination";
import { createUser } from "../apps/web/lib/users";
import { userSessionValue } from "../apps/web/lib/session";
import { POST as mcpPost } from "../apps/web/app/api/mcp/[token]/route";
import { POST as workflowPost } from "../apps/web/app/api/projects/[id]/workflow/route";
import type { LocalProject } from "../apps/web/lib/project-types";

let folder: string;
beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "forge-agreements-test-"));
  vi.stubEnv("FORGE_TEST_NOTIFY_FILE", path.join(folder, "notify.json"));
  vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
  vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
  vi.stubEnv("SESSION_SECRET", "test-secret-for-agreements-0123456789");
  vi.stubEnv("APP_BASE_URL", "https://forge.example");
  vi.stubEnv("APP_MODE", "mock");
});
afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });

function scale(): LocalProject {
  return {
    id: "p1", ownerId: "u", name: "재고 측정기", idea: "", oneLiner: "", stage: "spec", designRevision: 1, tasks: [], messages: [], createdAt: "", updatedAt: "", lastAgentMode: "mock",
    slots: [{ key: "wireless", label: "무선", status: "filled", valueText: "ESP가 웹페이지 직접 제공", assumption: null, acknowledged: true }, { key: "data_sink", label: "데이터 행선지", status: "assumed", valueText: "외부 서버 없음", assumption: "첫 버전", acknowledged: false }],
    buildPlan: { track: "both" } as LocalProject["buildPlan"],
    build: { status: "ready", createdAt: "", blueprint: { title: "", board: "", supplyVoltage: 5, components: [{ ref: "U1", type: "board", valueOrModel: "ATOMS3", reason: "" }], nets: [], enclosure: { widthMm: 1, depthMm: 1, heightMm: 1, wallMm: 1 }, firmware: { platform: "arduino", behavior: "", pinAssignments: [], loopSteps: [] }, assumptions: [], humanChecks: [] }, checks: [], evaluator: { summary: "", hw: { verdict: "unknown", findings: [], requiredMeasurements: [] }, sw: { verdict: "unknown", findings: [], requiredRuns: [] } }, artifacts: [] },
    workflow: { phase: "handoff", profile: { tools: [], toolsConfirmed: true, coreBehavior: "x", firmwareExperience: "guided" }, activeAgents: ["hw", "sw"], circuitApprovedAt: "x", mockupApprovedAt: "x", sharedUpdates: [], purchases: {}, evidence: [] }
  };
}
const serverRelay = { transport: "wifi_sta" as const, summary: "핫스팟으로 Cloudflare 서버에 확정값 전송", endpoints: ["POST https://scale.example/api/readings"], payload: [{ field: "grams", type: "number", unit: "g", example: "512.4" }], auth: "기기별 토큰", provisioning: "기기 자체 Wi-Fi로 첫 설정", reconnect: "30초마다 재시도", updates: "USB만", by: "sw" as const };

describe("the HW↔SW agreement", () => {
  it("holds finalising until approved, then rewrites the design slots from it", () => {
    const p = scale();
    recordPurchase(p, "U1", "available", "");
    expect(finalizeBlockers(p).join(" ")).toContain("연결 약속이 아직 없어요");
    proposeContract(p, serverRelay);
    expect(finalizeBlockers(p).join(" ")).toContain("v1을 결정 트리에서 승인");
    approveContract(p);
    expect(finalizeBlockers(p)).toEqual([]);
    // The two slots that disagreed with the plan now say what was agreed.
    expect(p.slots.find((s) => s.key === "wireless")!.valueText).toContain("공유기·핫스팟");
    expect(p.slots.find((s) => s.key === "data_sink")).toMatchObject({ status: "filled", valueText: "POST https://scale.example/api/readings (연결 약속 v1)" });
  });

  it("flags work made against an older version after a new one is approved", () => {
    const p = scale();
    proposeContract(p, serverRelay); approveContract(p);
    const { task } = upsertTask(p, { assignee: "sw", kind: "code", title: "웹앱", plain: "그램 표시" }, "chief");
    task.contractVersion = 1;
    proposeContract(p, { ...serverRelay, transport: "ble", ble: { service: "181D", characteristics: [{ uuid: "2A9D", name: "weight", props: "notify" }] }, endpoints: [] });
    expect(staleForContract(p)).toEqual([]);
    approveContract(p);
    expect(staleForContract(p)).toEqual([{ id: task.id, title: "웹앱", madeFor: 1, current: 2 }]);
    expect(() => proposeContract(p, { ...serverRelay, transport: "ble", endpoints: [] })).toThrow("UUID");
  });
});

describe("design direction and power", () => {
  it("needs the person's picks before a brief", () => {
    const p = scale();
    const refs = addReferences(p, [{ title: "둥근 저울", url: "https://example.com/a", takeaways: ["낮은 높이"], avoid: [] }, { title: "각진 저울", url: "https://example.com/b", takeaways: ["모서리 R2"], avoid: ["번쩍이는 마감"] }], "id", false);
    expect(() => addReferences(p, [{ title: "x", url: "javascript:1", takeaways: ["x"], avoid: [] }], "id", false)).toThrow("https");
    const brief = { keywords: ["낮고 넓게"], proportions: "150×110×32", cmf: "무광 PLA 베이지", must: ["USB-C 오른쪽"], never: [], approach: "parametric" as const, approachWhy: "치수가 중요한 받침" };
    expect(() => proposeBrief(p, brief, "id")).toThrow("레퍼런스를 고른 뒤");
    pickReferences(p, [refs[0].id]);
    expect(proposeBrief(p, brief, "id").approvedAt).toBeNull();
  });

  it("estimates battery days from modes and rejects more than 24 hours a day", () => {
    const budget = powerBudget({ source: "보조배터리", capacityMah: 5000, modes: [{ name: "측정", currentMa: 120, hoursPerDay: 1 }, { name: "대기", currentMa: 20, hoursPerDay: 7 }, { name: "깊은 절전", currentMa: 0.1, hoursPerDay: 16 }], measured: false });
    expect(budget.averageMa).toBeCloseTo((120 + 140 + 1.6) / 24, 1);
    expect(budget.estimatedDays).toBeCloseTo(5000 * 0.7 / 261.6, 1);
    expect(() => powerBudget({ source: "x", capacityMah: 1, modes: [{ name: "a", currentMa: 1, hoursPerDay: 20 }, { name: "b", currentMa: 1, hoursPerDay: 5 }], measured: false })).toThrow("24시간");
  });
});

describe("through the connector and the dashboard", () => {
  it("proposes, approves and asks about decisions", async () => {
    const { token } = await createUser("결정 사용자", false);
    const cookie = "dalgeurak_session=" + userSessionValue(token);
    let n = 0;
    const tool = async (name: string, args: Record<string, unknown>) => (await (await mcpPost(new NextRequest(`http://localhost:3000/api/mcp/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }) }), { params: Promise.resolve({ token }) })).json()).result;
    const created = await tool("create_project", { idea: "무게로 수량을 세는 저울", plan: { projectName: "저울", oneLiner: "저울", reply: "r", slotUpdates: [{ key: "wireless", status: "assumed", valueText: "AP 직접", assumption: "x", acknowledged: false }], tasks: [] } });
    const projectId = created.structuredContent.id as string;
    const act = async (body: unknown) => { const r = await workflowPost(new NextRequest(`http://localhost:3000/api/projects/${projectId}/workflow`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: projectId }) }); return { status: r.status, ...(await r.json()) }; };

    const proposed = await tool("propose_interface_contract", { projectId, ...serverRelay });
    expect(proposed.isError).toBeFalsy();
    expect(decodeURIComponent(proposed.structuredContent.openUrl)).toContain("open=decisions");
    const approved = await act({ action: "contract_approve" });
    expect(approved.project.workflow.contract.current.version).toBe(1);
    expect(approved.project.slots.find((s: { key: string }) => s.key === "wireless").valueText).toContain("v1");
    const task = await tool("upsert_task", { projectId, by: "chief", assignee: "sw", kind: "code", title: "웹앱", plain: "그램 표시" });
    expect((await tool("get_project", { projectId })).structuredContent.contract.current.version).toBe(1);
    expect(task.isError).toBeFalsy();

    const asked = await act({ action: "decision_question", topic: "board", label: "어떤 보드를 쓰나요", text: "왜 ESP32예요?" });
    const q = asked.project.tasks.find((t: { topic?: string }) => t.topic === "board");
    expect(q).toMatchObject({ assignee: "chief", createdBy: "human", title: "질문 · 어떤 보드를 쓰나요" });
    const answered = await tool("update_task", { projectId, by: "chief", taskId: q.id, status: "completed", note: "와이파이가 필요해서예요." });
    expect(answered.isError).toBeFalsy();

    const refs = await tool("add_design_references", { projectId, by: "id", refs: [{ title: "둥근 저울", url: "https://example.com/a", takeaways: ["낮은 높이"], avoid: [] }] });
    expect(refs.isError).toBeFalsy();
    expect((await tool("set_design_brief", { projectId, by: "id", keywords: ["낮게"], proportions: "p", cmf: "c", must: [], never: [], approach: "parametric", approachWhy: "w" })).isError).toBe(true);
    const read = await tool("get_project", { projectId });
    const picked = await act({ action: "design_pick", refIds: [read.structuredContent.design.refs[0].id] });
    expect(picked.project.workflow.design.chosen).toHaveLength(1);
    expect((await tool("set_design_brief", { projectId, by: "id", keywords: ["낮게"], proportions: "p", cmf: "c", must: [], never: [], approach: "parametric", approachWhy: "w" })).isError).toBeFalsy();
    expect((await act({ action: "brief_approve" })).project.workflow.design.brief.approvedAt).toBeTruthy();
  });
});
