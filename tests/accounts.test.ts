import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { DELETE as leave, GET as me, POST as rotate } from "../apps/web/app/api/me/route";
import { GET as exportRoute } from "../apps/web/app/api/me/export/route";
import { POST as linkRoute } from "../apps/web/app/api/link/route";
import { POST as mcpPost } from "../apps/web/app/api/mcp/[token]/route";
import { POST as sessionPost } from "../apps/web/app/api/session/route";
import { signSession } from "../apps/web/lib/session";
import { resetRateLimits } from "../apps/web/lib/rate-limit";
import { createUser, listUsers } from "../apps/web/lib/users";

const SECRET = "test-secret-for-account-routes-0123456789";
const ORIGIN = "https://forge.example";
let folder: string;

beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "forge-accounts-test-"));
  vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
  vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
  vi.stubEnv("FORGE_TEST_AUDIT_FILE", path.join(folder, "audit.jsonl"));
  vi.stubEnv("APP_MODE", "mock");
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("APP_PASSWORD", "operator-password-for-tests");
  vi.stubEnv("APP_BASE_URL", ORIGIN);
});
afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });
beforeEach(() => resetRateLimits());

const json = (url: string, body: unknown, cookie?: string, method = "POST") => new NextRequest(url, { method, headers: { "content-type": "application/json", origin: ORIGIN, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieFrom = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];
const tokenFrom = (dashboardUrl: string) => dashboardUrl.split("#")[1];
async function call(token: string, name: string, args: Record<string, unknown>) {
  const response = await mcpPost(new NextRequest(`http://localhost/api/mcp/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), { params: Promise.resolve({ token }) });
  return { status: response.status, body: await response.json() };
}
async function linkAccount(name: string) {
  const { token } = await createUser(name, false);
  return { token, cookie: `dalgeurak_session=u.${token}` };
}
const plan = { projectName: "계정 테스트 램프", oneLiner: "버튼 램프", reply: "좋아요", slotUpdates: [], tasks: [] };

describe("participant self-service", () => {
  it("rotates the link, keeps records readable and stops the old link", async () => {
    const { token: oldToken, cookie: joinedCookie } = await linkAccount("링크 교체");
    const made = await call(oldToken, "create_project", { idea: "링크를 바꿔도 남아야 하는 아이디어", plan });
    const id = made.body.result.structuredContent.id;
    const rotated = await rotate(json(`${ORIGIN}/api/me`, { action: "rotate_link" }, joinedCookie));
    expect(rotated.status).toBe(200);
    const newToken = tokenFrom((await rotated.json()).dashboardUrl);
    expect(newToken).not.toBe(oldToken);
    expect((await call(oldToken, "list_projects", {})).status).toBe(404);
    expect((await call(newToken, "get_project", { projectId: id })).body.result.isError).toBeFalsy();
    const newCookie = cookieFrom(rotated);
    const meBody = await (await me(new NextRequest(`${ORIGIN}/api/me`, { headers: { cookie: newCookie } }))).json();
    expect(meBody.dashboardUrl).toBe(`${ORIGIN}/u#${newToken}`);
    const exported = await (await exportRoute(new NextRequest(`${ORIGIN}/api/me/export`, { headers: { cookie: newCookie } }))).json();
    expect(exported.projects.map((p: { idea: string }) => p.idea)).toEqual(["링크를 바꿔도 남아야 하는 아이디어"]);
  });

  it("leaves with everything erased after typing the confirmation", async () => {
    const { token, cookie: joinedCookie } = await linkAccount("탈퇴 예정");
    await call(token, "create_project", { idea: "지워질 아이디어", plan });
    expect((await leave(json(`${ORIGIN}/api/me`, { confirm: "네" }, joinedCookie, "DELETE"))).status).toBe(400);
    const gone = await leave(json(`${ORIGIN}/api/me`, { confirm: "탈퇴" }, joinedCookie, "DELETE"));
    expect(await gone.json()).toEqual({ removedProjects: 1 });
    expect((await listUsers()).some((user) => user.name === "탈퇴 예정")).toBe(false);
    expect((await call(token, "ping", {})).status).toBe(404);
  });
});

describe("abuse limits", () => {
  it("signs in from a #token link and slows down link guessing from one address", async () => {
    const { token } = await linkAccount("링크 로그인");
    const ok = await linkRoute(json(`${ORIGIN}/api/link`, { token, open: "account" }));
    expect(await ok.json()).toEqual({ next: "/?open=account" });
    for (let i = 0; i < 20; i += 1) expect((await linkRoute(json(`${ORIGIN}/api/link`, { token: `guess${"x".repeat(20)}${i}` }))).status).toBe(404);
    expect((await linkRoute(json(`${ORIGIN}/api/link`, { token }))).status).toBe(429);
  });

  it("limits operator password attempts", async () => {
    const attempt = () => { const form = new FormData(); form.set("password", "wrong"); return sessionPost(new NextRequest(`${ORIGIN}/api/session`, { method: "POST", headers: { origin: ORIGIN }, body: form })); };
    for (let i = 0; i < 8; i += 1) expect((await attempt()).headers.get("location")).toContain("error=1");
    expect((await attempt()).headers.get("location")).toContain("error=slow");
  });
});

describe("starting over", () => {
  it("renames and clears every project and the maker profile but keeps the link", async () => {
    const { token, cookie } = await linkAccount("가짜 이름");
    const made = await call(token, "create_project", { idea: "지우고 다시 할 아이디어", plan });
    const id = made.body.result.structuredContent.id;
    await call(token, "set_maker_profile", { projectId: id, coreBehavior: "가짜 정보", tools: [], toolsConfirmed: true, firmwareExperience: "none" });
    expect((await rotate(json(`${ORIGIN}/api/me`, { action: "reset_records", confirm: "네" }, cookie))).status).toBe(400);
    expect(await (await rotate(json(`${ORIGIN}/api/me`, { action: "reset_records", confirm: "초기화" }, cookie))).json()).toEqual({ removedProjects: 1 });
    expect((await rotate(json(`${ORIGIN}/api/me`, { action: "rename", name: "진짜 별명" }, cookie))).status).toBe(200);
    expect((await call(token, "list_projects", {})).body.result.structuredContent.projects).toEqual([]);
    const fresh = await call(token, "create_project", { idea: "새 아이디어", plan });
    expect(fresh.body.result.structuredContent.profileMissing ?? []).not.toContain("가짜 정보");
    expect((await listUsers()).find((u) => u.id && u.name === "진짜 별명")).toBeTruthy();
  });
});
