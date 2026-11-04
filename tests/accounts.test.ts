import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST as join } from "../apps/web/app/api/join/route";
import { DELETE as leave, GET as me, POST as rotate } from "../apps/web/app/api/me/route";
import { GET as exportRoute } from "../apps/web/app/api/me/export/route";
import { POST as linkRoute } from "../apps/web/app/api/link/route";
import { POST as invitesPost } from "../apps/web/app/api/admin/invites/route";
import { POST as mcpPost } from "../apps/web/app/api/mcp/[token]/route";
import { POST as sessionPost } from "../apps/web/app/api/session/route";
import { signSession } from "../apps/web/lib/session";
import { resetRateLimits } from "../apps/web/lib/rate-limit";
import { listUsers } from "../apps/web/lib/users";

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
const consent = { agreeTerms: true, agreePrivacy: true, age14: true };
const cookieFrom = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];
const tokenFrom = (connectorUrl: string) => connectorUrl.split("/api/mcp/")[1];
async function call(token: string, name: string, args: Record<string, unknown>) {
  const response = await mcpPost(new NextRequest(`http://localhost/api/mcp/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), { params: Promise.resolve({ token }) });
  return { status: response.status, body: await response.json() };
}
const plan = { projectName: "계정 테스트 램프", oneLiner: "버튼 램프", reply: "좋아요", slotUpdates: [], tasks: [] };

describe("sign-up", () => {
  it("is closed unless SIGNUP_MODE allows it", async () => {
    vi.stubEnv("SIGNUP_MODE", "");
    expect((await join(json(`${ORIGIN}/api/join`, { name: "누군가", ...consent }))).status).toBe(403);
  });

  it("requires consent and age confirmation", async () => {
    vi.stubEnv("SIGNUP_MODE", "open");
    expect((await join(json(`${ORIGIN}/api/join`, { name: "누군가", agreeTerms: true, agreePrivacy: true, age14: false }))).status).toBe(400);
  });

  it("takes invite codes only while they are valid and records consent", async () => {
    vi.stubEnv("SIGNUP_MODE", "invite");
    const operator = `dalgeurak_session=${await signSession(Date.now() + 60_000, SECRET)}`;
    const made = await (await invitesPost(json(`${ORIGIN}/api/admin/invites`, { label: "강연", maxUses: 1, days: 7 }, operator))).json();
    expect(made.code).toMatch(/^[A-Z0-9]{10}$/);
    expect((await join(json(`${ORIGIN}/api/join`, { name: "코드없음", ...consent }))).status).toBe(400);
    expect((await join(json(`${ORIGIN}/api/join`, { name: "틀린코드", inviteCode: "WRONGCODE1", ...consent }))).status).toBe(403);
    const ok = await join(json(`${ORIGIN}/api/join`, { name: "강연 참여자", inviteCode: made.code.toLowerCase(), ...consent }));
    expect(ok.status).toBe(201);
    const issued = await ok.json();
    expect(issued.dashboardUrl).toMatch(/^https:\/\/forge\.example\/u#[A-Za-z0-9_-]{32}$/);
    expect(cookieFrom(ok)).toBe(`dalgeurak_session=u.${tokenFrom(issued.connectorUrl)}`);
    expect((await join(json(`${ORIGIN}/api/join`, { name: "두번째", inviteCode: made.code, ...consent }))).status).toBe(403);
    const user = (await listUsers()).find((item) => item.name === "강연 참여자")!;
    expect(user).toMatchObject({ source: "signup", webAi: false, consent: { ageConfirmed: true } });
    const auditLog = await readFile(path.join(folder, "audit.jsonl"), "utf8");
    expect(auditLog).toContain("user_signed_up");
    expect(auditLog).not.toContain(tokenFrom(issued.connectorUrl));
  });
});

describe("participant self-service", () => {
  it("rotates the link, keeps records readable and stops the old link", async () => {
    vi.stubEnv("SIGNUP_MODE", "open");
    const joined = await join(json(`${ORIGIN}/api/join`, { name: "링크 교체", ...consent }));
    const oldToken = tokenFrom((await joined.json()).connectorUrl);
    const made = await call(oldToken, "create_project", { idea: "링크를 바꿔도 남아야 하는 아이디어", plan });
    const id = made.body.result.structuredContent.id;
    const rotated = await rotate(json(`${ORIGIN}/api/me`, { action: "rotate_link" }, cookieFrom(joined)));
    expect(rotated.status).toBe(200);
    const newToken = tokenFrom((await rotated.json()).connectorUrl);
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
    vi.stubEnv("SIGNUP_MODE", "open");
    const joined = await join(json(`${ORIGIN}/api/join`, { name: "탈퇴 예정", ...consent }));
    const token = tokenFrom((await joined.json()).connectorUrl);
    await call(token, "create_project", { idea: "지워질 아이디어", plan });
    expect((await leave(json(`${ORIGIN}/api/me`, { confirm: "네" }, cookieFrom(joined), "DELETE"))).status).toBe(400);
    const gone = await leave(json(`${ORIGIN}/api/me`, { confirm: "탈퇴" }, cookieFrom(joined), "DELETE"));
    expect(await gone.json()).toEqual({ removedProjects: 1 });
    expect((await listUsers()).some((user) => user.name === "탈퇴 예정")).toBe(false);
    expect((await call(token, "ping", {})).status).toBe(404);
  });
});

describe("abuse limits", () => {
  it("signs in from a #token link and slows down link guessing from one address", async () => {
    vi.stubEnv("SIGNUP_MODE", "open");
    const joined = await join(json(`${ORIGIN}/api/join`, { name: "링크 로그인", ...consent }));
    const token = tokenFrom((await joined.json()).connectorUrl);
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
