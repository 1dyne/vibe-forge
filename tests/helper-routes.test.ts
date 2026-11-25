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

  it("로그인 없이는 도우미 자리에도 화면 자리에도 설 수 없다", async () => {
    expect((await poll(post("/api/helper/poll", {}))).status).toBe(401);
    expect((await poll(post("/api/helper/poll", {}, bearer("wrong")))).status).toBe(401);
    expect((await chat(post("/api/helper/chat", { text: "안녕" }))).status).toBe(401);
  });
});
