import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST as register } from "../apps/web/app/api/oauth/register/route";
import { POST as authorize } from "../apps/web/app/api/oauth/authorize/route";
import { POST as token } from "../apps/web/app/api/oauth/token/route";
import { POST as mcp } from "../apps/web/app/api/mcp/route";
import { POST as chat } from "../apps/web/app/api/helper/chat/route";
import { POST as poll } from "../apps/web/app/api/helper/poll/route";
import { GET as readJob, POST as reportJob } from "../apps/web/app/api/helper/jobs/[id]/route";
import { GET as statusRoute } from "../apps/web/app/api/helper/status/route";
import { GET as listRoute } from "../apps/web/app/api/projects/route";
import { GET as boardGet, POST as boardPost } from "../apps/web/app/api/projects/[id]/board/route";
import { resetHelperRelay } from "../apps/web/lib/helper-relay";
import { userSessionValue } from "../apps/web/lib/session";
import { resetRateLimits } from "../apps/web/lib/rate-limit";
import { createUser } from "../apps/web/lib/users";

// 화면 → 서버 → 도우미 → 서버 → 화면을 한 바퀴 돈다. 도우미 자리는 테스트가 대신 선다.
const ORIGIN = "https://forge.example";
const CALLBACK = "http://127.0.0.1:1466/callback";
let folder: string;

beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "forge-helper-test-"));
  vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
  vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
  vi.stubEnv("FORGE_TEST_OAUTH_FILE", path.join(folder, "oauth.json"));
  vi.stubEnv("FORGE_TEST_AUDIT_FILE", path.join(folder, "audit.jsonl"));
  vi.stubEnv("APP_MODE", "mock");
  vi.stubEnv("SESSION_SECRET", "test-secret-for-helper-routes-0123456789");
  vi.stubEnv("APP_BASE_URL", ORIGIN);
});
afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });
beforeEach(() => { resetRateLimits(); resetHelperRelay(); });

const post = (url: string, body: unknown, headers: Record<string, string> = {}) => new NextRequest(`${ORIGIN}${url}`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...headers }, body: JSON.stringify(body) });
const cookie = (linkToken: string) => ({ cookie: `dalgeurak_session=${userSessionValue(linkToken)}` });
const bearer = (access: string) => ({ authorization: `Bearer ${access}` });

async function person(name: string) {
  const { token: linkToken } = await createUser(name, false);
  const client = await (await register(post("/api/oauth/register", { client_name: "달그락 도우미", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" }))).json();
  const verifier = randomBytes(32).toString("base64url");
  const allowed = await (await authorize(post("/api/oauth/authorize", { client_id: client.client_id, redirect_uri: CALLBACK, code_challenge: createHash("sha256").update(verifier).digest("base64url"), state: "s", decision: "allow" }, cookie(linkToken)))).json();
  const code = new URL(allowed.redirect).searchParams.get("code")!;
  const tokens = await (await token(new NextRequest(`${ORIGIN}/api/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: client.client_id, code, redirect_uri: CALLBACK, code_verifier: verifier }).toString() }))).json();
  const created = await (await mcp(post("/api/mcp", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_project", arguments: { idea: "버튼을 누르면 불이 켜지는 책상 램프", plan: { projectName: "도우미 램프", oneLiner: "버튼 램프", reply: "좋아요", slotUpdates: [], tasks: [] } } } }, bearer(tokens.access_token)))).json();
  const projectId = created.result.structuredContent.id as string;
  return { linkToken, access: tokens.access_token as string, projectId };
}
const status = async (linkToken: string) => (await statusRoute(new NextRequest(`${ORIGIN}/api/helper/status`, { headers: cookie(linkToken) }))).json();
const jobParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe("도우미 대화 경로", () => {
  it("도우미가 꺼져 있으면 화면에서 보낼 수 없다", async () => {
    const a = await person("가");
    expect((await status(a.linkToken)).online).toBe(false);
    const response = await chat(post("/api/helper/chat", { projectId: a.projectId, text: "안녕" }, cookie(a.linkToken)));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("offline");
  });

  it("화면의 말이 도우미에게 가고, 도우미의 답이 화면과 기록에 남는다", async () => {
    const a = await person("나");
    // 도우미가 켜졌다고 알린다(할 일은 아직 없다).
    expect(await (await poll(post("/api/helper/poll", { model: "gpt-test", version: "0.1.0", wait: false }, bearer(a.access)))).json()).toEqual({ job: null });
    expect(await status(a.linkToken)).toMatchObject({ online: true, model: "gpt-test" });

    const sent = await (await chat(post("/api/helper/chat", { projectId: a.projectId, text: "납땜 없이 만들 수 있어?" }, cookie(a.linkToken)))).json();
    expect(sent.project.messages.at(-1)).toMatchObject({ role: "user", text: "납땜 없이 만들 수 있어?" });

    const { job } = await (await poll(post("/api/helper/poll", { wait: false }, bearer(a.access)))).json();
    expect(job).toMatchObject({ id: sent.jobId, projectId: a.projectId, text: "납땜 없이 만들 수 있어?", channel: "main" });
    // 방금 보낸 말은 text로 따로 가고, 기록에는 그 앞의 말만 담긴다.
    expect(job.history.every((m: { text: string }) => m.text !== "납땜 없이 만들 수 있어?")).toBe(true);

    await reportJob(post(`/api/helper/jobs/${job.id}`, { events: [{ type: "status", text: "프로젝트 읽기 기록 중" }, { type: "delta", text: "네, " }] }, bearer(a.access)), jobParams(job.id));
    const first = await (await readJob(new NextRequest(`${ORIGIN}/api/helper/jobs/${job.id}?from=0`, { headers: cookie(a.linkToken) }), jobParams(job.id))).json();
    expect(first).toMatchObject({ next: 2, finished: false });
    await reportJob(post(`/api/helper/jobs/${job.id}`, { events: [{ type: "delta", text: "브레드보드로 돼요." }, { type: "done", text: "네, 브레드보드로 돼요." }] }, bearer(a.access)), jobParams(job.id));
    const rest = await (await readJob(new NextRequest(`${ORIGIN}/api/helper/jobs/${job.id}?from=2`, { headers: cookie(a.linkToken) }), jobParams(job.id))).json();
    expect(rest.finished).toBe(true);
    expect(rest.events.at(-1)).toEqual({ type: "done", text: "네, 브레드보드로 돼요." });

    const listed = await (await listRoute(new NextRequest(`${ORIGIN}/api/projects`, { headers: cookie(a.linkToken) }))).json();
    const project = listed.projects.find((p: { id: string }) => p.id === a.projectId);
    expect(project.messages.slice(-2)).toMatchObject([{ role: "user", text: "납땜 없이 만들 수 있어?" }, { role: "assistant", agent: "chief", text: "네, 브레드보드로 돼요." }]);
  });

  it("다른 사람의 도우미는 내 말을 받지 못하고, 다른 사람은 내 답을 읽지 못한다", async () => {
    const a = await person("다"); const b = await person("라");
    await poll(post("/api/helper/poll", { wait: false }, bearer(a.access)));
    await poll(post("/api/helper/poll", { wait: false }, bearer(b.access)));
    const sent = await (await chat(post("/api/helper/chat", { projectId: a.projectId, text: "내 말" }, cookie(a.linkToken)))).json();
    expect(await (await poll(post("/api/helper/poll", { wait: false }, bearer(b.access)))).json()).toEqual({ job: null });
    expect((await reportJob(post(`/api/helper/jobs/${sent.jobId}`, { events: [{ type: "done", text: "가로채기" }] }, bearer(b.access)), jobParams(sent.jobId))).status).toBe(404);
    expect((await readJob(new NextRequest(`${ORIGIN}/api/helper/jobs/${sent.jobId}?from=0`, { headers: cookie(b.linkToken) }), jobParams(sent.jobId))).status).toBe(404);
    // 남의 프로젝트로는 보낼 수 없다.
    expect((await chat(post("/api/helper/chat", { projectId: a.projectId, text: "남의 것" }, cookie(b.linkToken)))).status).toBe(404);
  });

  it("달그락이 도구로 넘긴 차례가 사람 화면의 '지금 할 일'이 되고, 사람이 답하면 달그락 차례로 돌아간다", async () => {
    const a = await person("마");
    const call = async (name: string, args: Record<string, unknown>) => (await (await mcp(post("/api/mcp", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: { projectId: a.projectId, ...args } } }, bearer(a.access)))).json()).result;
    // 설계도 없이는 일을 나눌 수 없다
    const early = await call("set_work_board", { cards: [{ id: "c1", title: "회로", detail: "d", owner: "chief" }] });
    expect(early.isError).toBe(true);
    expect(early.content[0].text).toContain("set_build_plan");
    // 현실 기록은 회로가 없어도 된다
    const real = await call("record_real_world", { delivery: { label: "5kg 로드셀", status: "ordered", expectedAt: "2026-11-27" }, now: "책상 정리 중" });
    expect(real.isError).toBeFalsy();
    expect(real.content[0].text).toContain("[작업대]");
    expect(real.content[0].text).toContain("배송: 5kg 로드셀 주문함 · 도착 예정 2026-11-27");
    expect(real.structuredContent.board.real.now.text).toBe("책상 정리 중");
    // 사람이 화면에서 배송이 밀렸다고 고친다
    const params = { params: Promise.resolve({ id: a.projectId }) };
    const moved = await (await boardPost(post(`/api/projects/${a.projectId}/board`, { action: "delivery", label: "5kg 로드셀", status: "delayed", expectedAt: "2026-12-01" }, cookie(a.linkToken)), params)).json();
    expect(moved.board.real.deliveries[0]).toMatchObject({ status: "delayed", expectedAt: "2026-12-01" });
    const seen = await (await boardGet(new NextRequest(`${ORIGIN}/api/projects/${a.projectId}/board`, { headers: cookie(a.linkToken) }), params)).json();
    expect(seen.board.real.events.at(-1).text).toContain("2026-11-27 → 2026-12-01");
    // 남의 작업대는 볼 수 없다
    const b = await person("바");
    expect((await boardGet(new NextRequest(`${ORIGIN}/api/projects/${a.projectId}/board`, { headers: cookie(b.linkToken) }), params)).status).toBe(404);
  });

  it("자동 진행: 맡기기를 켜면 대장이 다음 일을 대장간에 넘기고, 사람이 답하면 그 답이 달그락에게 간다", async () => {
    const a = await person("사");
    const params = { params: Promise.resolve({ id: a.projectId }) };
    const board = (body: Record<string, unknown>) => boardPost(post(`/api/projects/${a.projectId}/board`, body, cookie(a.linkToken)), params);
    // 설계도와 카드는 도구를 거치지 않고 직접 채운다(설계도 입력이 길어서).
    const { withVault, vaultFor } = await import("../apps/web/lib/vault");
    const { mutateProject, getProject } = await import("../apps/web/lib/local-project-store");
    const { upsertCards, boardOf, emptyBoard } = await import("../apps/web/lib/board");
    const { findUserByToken } = await import("../apps/web/lib/users");
    const user = (await findUserByToken(a.linkToken))!;
    const vault = vaultFor(a.linkToken, user.id);
    await withVault(vault, () => mutateProject(a.projectId, (p) => {
      p.workflow = { ...(p.workflow as NonNullable<typeof p.workflow>), activeAgents: ["hw", "me"] };
      p.board = upsertCards(emptyBoard(), [{ id: "circuit", title: "1단계 회로", detail: "값 읽기", owner: "hw" }], ["hw", "me"], "chief");
    }));
    // 연결 앱이 켜진다. 맡기기 전에는 아무 일도 오지 않는다.
    expect(await (await poll(post("/api/helper/poll", { wait: false }, bearer(a.access)))).json()).toEqual({ job: null });
    // 맡기기를 켜면 대장의 지시가 하드웨어 대장간으로 간다.
    const on = await (await board({ action: "auto", on: true })).json();
    expect(on.auto.on).toBe(true);
    const first = (await (await poll(post("/api/helper/poll", { wait: false }, bearer(a.access)))).json()).job;
    expect(first).toMatchObject({ projectId: a.projectId, channel: "hw" });
    expect(first.text).toContain("[대장의 작업 지시] 「1단계 회로」");
    // 달그락이 요청을 넘기고 턴을 끝낸다.
    const call = async (name: string, args: Record<string, unknown>) => (await (await mcp(post("/api/mcp", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: { projectId: a.projectId, ...args } } }, bearer(a.access)))).json()).result;
    const asked = await call("update_work_card", { cardId: "circuit", by: "hw", turn: "person", ask: "로드셀이 도착했는지 알려주세요", prompt: { kind: "request", fields: [{ id: "arrived", label: "로드셀이 도착했나요", kind: "yes_no" }] } });
    expect(asked.isError).toBeFalsy();
    await reportJob(post(`/api/helper/jobs/${first.id}`, { events: [{ type: "done", text: "로드셀이 도착했는지 알려주세요." }] }, bearer(a.access)), jobParams(first.id));
    // 사람을 기다리는 동안에는 더 넘기지 않는다.
    expect(await (await poll(post("/api/helper/poll", { wait: false }, bearer(a.access)))).json()).toEqual({ job: null });
    const waiting = await (await boardGet(new NextRequest(`${ORIGIN}/api/projects/${a.projectId}/board`, { headers: cookie(a.linkToken) }), params)).json();
    expect(waiting.board.nextForPerson).toMatchObject({ cardId: "circuit", room: "hw" });
    // 잘못된 답은 받지 않고, 맞는 답은 달그락에게 전달된다.
    expect((await board({ action: "answer", cardId: "circuit", values: {} })).status).toBe(409);
    expect((await board({ action: "answer", cardId: "circuit", values: { arrived: true } })).status).toBe(200);
    const second = (await (await poll(post("/api/helper/poll", { wait: false }, bearer(a.access)))).json()).job;
    expect(second.channel).toBe("hw");
    expect(second.text).toContain("사람이 답했어요: 로드셀이 도착했나요: 예");
    // 대장의 전달은 그 대장간의 대화에 남는다.
    const saved = await withVault(vault, () => getProject(a.projectId));
    expect(saved!.messages.filter((m) => m.auto).map((m) => m.channel)).toEqual(["hw", "hw"]);
    expect(boardOf(saved!).auto!.count).toBe(2);
  });

  it("로그인 없이는 도우미 자리에도 화면 자리에도 설 수 없다", async () => {
    expect((await poll(post("/api/helper/poll", {}))).status).toBe(401);
    expect((await poll(post("/api/helper/poll", {}, bearer("wrong")))).status).toBe(401);
    expect((await chat(post("/api/helper/chat", { text: "안녕" }))).status).toBe(401);
  });
});
