import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import webpush from "web-push";
import { NextRequest } from "next/server";
import { addDeadline, addPushSubscription, checkDeadlines, clearDeadline, flushBatchesForTest, noticesBetween, notifyPerson, sentLog, setEmailNotices } from "../apps/web/lib/notify";
import { raiseConflict, upsertTask, askAboutTask, answerTaskQuestion } from "../apps/web/lib/coordination";
import { createUser } from "../apps/web/lib/users";
import { userSessionValue } from "../apps/web/lib/session";
import { GET as notifyGet, POST as notifyPost } from "../apps/web/app/api/notify/route";
import { POST as mcpPost } from "../apps/web/app/api/mcp/[token]/route";
import type { LocalProject } from "../apps/web/lib/project-types";

let folder: string;
const sub = { endpoint: "https://push.example/sub/1", keys: { p256dh: "BNcR", auth: "tB" } };
beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "forge-notify-test-"));
  vi.stubEnv("FORGE_TEST_NOTIFY_FILE", path.join(folder, "notify.json"));
  vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
  vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
  vi.stubEnv("SESSION_SECRET", "test-secret-for-notify-0123456789abcdef");
  vi.stubEnv("APP_BASE_URL", "https://forge.example");
  vi.stubEnv("APP_MODE", "mock");
  const keys = webpush.generateVAPIDKeys();
  vi.stubEnv("VAPID_PUBLIC_KEY", keys.publicKey); vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
});
afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });
beforeEach(() => { sentLog.length = 0; flushBatchesForTest(); });

function project(): LocalProject {
  return { id: "11111111-1111-4111-8111-111111111111", ownerId: "u", name: "저울", idea: "", oneLiner: "", stage: "spec", designRevision: 1, slots: [], tasks: [], messages: [], build: null, createdAt: "", updatedAt: "", lastAgentMode: "mock",
    workflow: { phase: "handoff", profile: { tools: [], toolsConfirmed: true, coreBehavior: "x", firmwareExperience: "guided" }, activeAgents: ["hw"], circuitApprovedAt: "x", mockupApprovedAt: "x", sharedUpdates: [], purchases: {}, evidence: [] } };
}

describe("what notifies the person", () => {
  it("covers new and changed requests, decisions and answers, but not agents' own work", () => {
    const before = project();
    const after = structuredClone(before);
    const { task } = upsertTask(after, { assignee: "human", kind: "measure", title: "5V 확인", plain: "전압" }, "hw");
    upsertTask(after, { assignee: "sw", kind: "code", title: "웹앱", plain: "화면" }, "chief");
    raiseConflict(after, { title: "무선 방식", detail: "d", source: "interface", refs: [], options: [{ label: "a", detail: "a", costDeltaKRW: 0, changes: [], affects: [] }, { label: "b", detail: "b", costDeltaKRW: 0, changes: [], affects: [] }] }, "chief");
    const notices = noticesBetween(before, after, "https://forge.example/");
    expect(notices.map((n) => n.title)).toEqual(["측정 요청: 5V 확인", "결정해 주세요: 무선 방식"]);
    expect(decodeURIComponent(notices[0].url)).toBe(`https://forge.example/?p=${after.id}&open=task:${task.id}`);

    const later = structuredClone(after);
    const q = askAboutTask(later, task.id, "어디요?");
    const answered = structuredClone(later);
    answerTaskQuestion(answered, task.id, q.id, "5V 핀이요", "hw");
    expect(noticesBetween(later, answered, "https://forge.example/").map((n) => n.title)).toEqual(["질문에 답이 왔어요: 5V 확인"]);
    expect(noticesBetween(answered, structuredClone(answered), "https://forge.example/")).toEqual([]);
  });
});

describe("delivery", () => {
  it("sends the first notice at once and folds the next ones in the same project into one", async () => {
    vi.useFakeTimers();
    await addPushSubscription("u1", sub);
    await notifyPerson("u1", "p", "저울", [{ title: "측정 요청: 5V", url: "https://forge.example/" }]);
    await notifyPerson("u1", "p", "저울", [{ title: "새 할 일: 재고", url: "https://forge.example/" }]);
    await notifyPerson("u1", "p", "저울", [{ title: "결정해 주세요: 무선", url: "https://forge.example/" }]);
    expect(sentLog.map((s) => s.title)).toEqual(["측정 요청: 5V"]);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 50));
    expect(sentLog.at(-1)).toMatchObject({ title: "저울: 확인할 것 2건", body: "새 할 일: 재고\n결정해 주세요: 무선" });
  });

  it("tells the person when a request to a coding agent got no response, unless a session took it", async () => {
    await addPushSubscription("u2", sub);
    await addDeadline({ userId: "u2", projectId: "p", taskId: "t1", dueAt: new Date(Date.now() - 1000).toISOString() });
    await addDeadline({ userId: "u2", projectId: "p", taskId: "t2", dueAt: new Date(Date.now() - 1000).toISOString() });
    await clearDeadline("t2");
    expect(await checkDeadlines()).toBe(1);
    expect(sentLog.filter((s) => s.userId === "u2").map((s) => s.title)).toEqual(["보낸 작업에 아직 응답이 없어요"]);
    expect(await checkDeadlines()).toBe(0);
  });
});

describe("settings and the connector", () => {
  it("lets a person subscribe, turn email on and get a notice when Claude asks them for something", async () => {
    const { token, user } = await createUser("알림 사용자", false);
    const cookie = "dalgeurak_session=" + userSessionValue(token);
    const call = (body: unknown) => notifyPost(new NextRequest("http://localhost:3000/api/notify", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie }, body: JSON.stringify(body) }));
    const status = await (await notifyGet(new NextRequest("http://localhost:3000/api/notify", { headers: { cookie } }))).json();
    expect(status).toMatchObject({ pushAvailable: true, pushDevices: 0 });
    expect((await call({ action: "subscribe", subscription: { endpoint: "http://insecure.example/x", keys: sub.keys } })).status).toBe(400);
    expect((await call({ action: "subscribe", subscription: sub })).status).toBe(200);
    expect((await call({ action: "email", on: true })).status).toBe(409);
    await setEmailNotices(user.id, false);

    let id = 0;
    const tool = async (name: string, args: Record<string, unknown>) => (await (await mcpPost(new NextRequest(`http://localhost:3000/api/mcp/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) }), { params: Promise.resolve({ token }) })).json()).result;
    const created = await tool("create_project", { idea: "무게로 수량을 세는 저울", plan: { projectName: "저울", oneLiner: "무게로 세는 저울", reply: "어떤 부품을 세나요?", slotUpdates: [{ key: "power", status: "assumed", valueText: null, assumption: "USB 5V", acknowledged: false }], tasks: [] } });
    if (!created.structuredContent) throw new Error(created.content[0].text);
    sentLog.length = 0;
    await tool("upsert_task", { projectId: created.structuredContent.id, by: "hw", assignee: "human", kind: "measure", title: "5V 확인", plain: "전압을 재주세요.", format: "measurement" });
    expect(sentLog).toHaveLength(1);
    expect(sentLog[0]).toMatchObject({ userId: user.id, channel: "push", title: "측정 요청: 5V 확인" });
    await tool("upsert_task", { projectId: created.structuredContent.id, by: "chief", assignee: "sw", kind: "code", title: "웹", plain: "화면" });
    expect(sentLog).toHaveLength(1);
  });
});
