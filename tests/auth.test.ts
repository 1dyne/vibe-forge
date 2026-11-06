import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST as signup } from "../apps/web/app/api/auth/signup/route";
import { POST as verify } from "../apps/web/app/api/auth/verify/route";
import { POST as login } from "../apps/web/app/api/auth/login/route";
import { POST as forgot } from "../apps/web/app/api/auth/forgot/route";
import { POST as reset } from "../apps/web/app/api/auth/reset/route";
import { POST as unlock } from "../apps/web/app/api/auth/unlock/route";
import { GET as googleStart } from "../apps/web/app/api/auth/google/start/route";
import { GET as googleCallback } from "../apps/web/app/api/auth/google/callback/route";
import { GET as me, POST as meAction } from "../apps/web/app/api/me/route";
import { GET as listRoute } from "../apps/web/app/api/projects/route";
import { POST as register } from "../apps/web/app/api/oauth/register/route";
import { POST as authorize } from "../apps/web/app/api/oauth/authorize/route";
import { POST as token } from "../apps/web/app/api/oauth/token/route";
import { POST as mcp } from "../apps/web/app/api/mcp/route";
import { POST as legacyMcp } from "../apps/web/app/api/mcp/[token]/route";
import { POST as sessionRoute } from "../apps/web/app/api/session/route";
import { outbox } from "../apps/web/lib/mailer";
import { resetRateLimits } from "../apps/web/lib/rate-limit";
import { createUser, listUsers } from "../apps/web/lib/users";

const ORIGIN = "https://forge.example";
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
let folder: string;

beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "forge-auth-test-"));
  for (const [name, file] of [["DATA", "projects.json"], ["USERS", "users.json"], ["OAUTH", "oauth.json"], ["AUTH", "auth.json"], ["AUDIT", "audit.jsonl"]]) vi.stubEnv(`FORGE_TEST_${name}_FILE`, path.join(folder, file));
  vi.stubEnv("APP_MODE", "mock");
  vi.stubEnv("SESSION_SECRET", "test-secret-for-auth-routes-0123456789");
  vi.stubEnv("VAULT_MASTER_KEY", "test-vault-master-key-0123456789abcdef");
  vi.stubEnv("APP_BASE_URL", ORIGIN);
  vi.stubEnv("SIGNUP_MODE", "open");
  vi.stubEnv("GOOGLE_CLIENT_ID", "google-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-secret");
});
afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });
beforeEach(() => { resetRateLimits(); outbox.length = 0; });
afterEach(() => vi.unstubAllGlobals());

const plan = { projectName: "잠긴 램프", oneLiner: "버튼 램프", reply: "좋아요", slotUpdates: [], tasks: [] };
const json = (url: string, body: unknown, headers: Record<string, string> = {}) => new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...headers }, body: JSON.stringify(body) });
const cookieOf = (response: Response, name = "dalgeurak_session") => response.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith(`${name}=`) && c.length > name.length + 1)!;
const linkFrom = (mail: { text: string }, page: string) => mail.text.match(new RegExp(`${page}#([A-Za-z0-9_-]+)`))![1];
const consent = { agreeTerms: true, agreePrivacy: true, age14: true };

async function signUpAndVerify(name: string, email: string, password: string) {
  const response = await signup(json(`${ORIGIN}/api/auth/signup`, { name, email, password, ...consent }));
  expect(response.status).toBe(201);
  const { recoveryCode } = await response.json();
  const mail = outbox.find((item) => item.to === email && item.subject.includes("인증"))!;
  expect((await verify(json(`${ORIGIN}/api/auth/verify`, { token: linkFrom(mail, "/auth/verify") }))).status).toBe(200);
  return recoveryCode as string;
}
async function signIn(email: string, password: string) {
  const response = await login(json(`${ORIGIN}/api/auth/login`, { email, password, remember: true }));
  return { status: response.status, body: await response.json(), cookie: response.status === 200 ? cookieOf(response) : "" };
}
async function connectorToken(cookie: string) {
  const client = await (await register(json(`${ORIGIN}/api/oauth/register`, { client_name: "Claude", redirect_uris: [CALLBACK] }))).json();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const allowed = await (await authorize(json(`${ORIGIN}/api/oauth/authorize`, { client_id: client.client_id, redirect_uri: CALLBACK, code_challenge: challenge, state: "", decision: "allow" }, { cookie }))).json();
  const code = new URL(allowed.redirect).searchParams.get("code")!;
  const form = new URLSearchParams({ grant_type: "authorization_code", code, client_id: client.client_id, redirect_uri: CALLBACK, code_verifier: verifier });
  return (await (await token(new NextRequest(`${ORIGIN}/api/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() }))).json()).access_token as string;
}
async function tool(bearer: string, name: string, args: Record<string, unknown>) {
  const response = await mcp(new NextRequest(`${ORIGIN}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }));
  return (await response.json()).result;
}
const projectsOf = async (cookie: string) => {
  const response = await listRoute(new NextRequest(`${ORIGIN}/api/projects`, { headers: { cookie } }));
  return response.status === 200 ? ((await response.json()).projects as Array<{ id: string; idea: string }>) : null;
};

describe("email accounts", () => {
  it("signs up, needs email verification, and locks records with the password", async () => {
    expect((await signup(json(`${ORIGIN}/api/auth/signup`, { name: "약한 비번", email: "weak@example.com", password: "short", ...consent }))).status).toBe(400);
    const response = await signup(json(`${ORIGIN}/api/auth/signup`, { name: "메일러", email: "Maker@Example.com", password: "correct horse battery", ...consent }));
    expect(response.status).toBe(201);
    const { recoveryCode } = await response.json();
    expect(recoveryCode).toMatch(/^([A-Z2-9]{4}-){4}[A-Z2-9]{4}$/);
    expect((await signup(json(`${ORIGIN}/api/auth/signup`, { name: "중복", email: "maker@example.com", password: "another long pass", ...consent }))).status).toBe(403);

    const before = await signIn("maker@example.com", "correct horse battery");
    expect(before).toMatchObject({ status: 403, body: { code: "unverified" } });
    const mail = outbox.find((item) => item.to === "maker@example.com")!;
    expect(mail.html).toContain(`${ORIGIN}/auth/verify#`);
    expect((await verify(json(`${ORIGIN}/api/auth/verify`, { token: linkFrom(mail, "/auth/verify") }))).status).toBe(200);
    expect((await signIn("maker@example.com", "wrong password!!")).status).toBe(401);

    const { cookie } = await signIn("maker@example.com", "correct horse battery");
    expect(cookie).toMatch(/^dalgeurak_session=s\./);
    const bearer = await connectorToken(cookie);
    const made = await tool(bearer, "create_project", { idea: "비밀번호로 잠긴 아이디어", plan });
    expect(made.isError).toBeFalsy();
    expect((await projectsOf(cookie))!.map((p) => p.idea)).toEqual(["비밀번호로 잠긴 아이디어"]);

    const raw = [await readFile(path.join(folder, "projects.json"), "utf8"), await readFile(path.join(folder, "users.json"), "utf8"), await readFile(path.join(folder, "auth.json"), "utf8")].join("\n");
    expect(raw).not.toContain("비밀번호로 잠긴");
    expect(raw).not.toContain("correct horse battery");
    expect(raw).not.toContain(recoveryCode);
    expect(raw).not.toContain(cookie.split("s.")[1]);

    const account = await (await me(new NextRequest(`${ORIGIN}/api/me`, { headers: { cookie } }))).json();
    expect(account).toMatchObject({ auth: "password", email: "maker@example.com", emailVerified: true, lock: "password", passwordSet: true });
    expect(account.dashboardUrl).toBeUndefined();

    // Logging out ends the server session.
    const form = new FormData(); form.set("intent", "logout");
    await sessionRoute(new NextRequest(`${ORIGIN}/api/session`, { method: "POST", headers: { origin: ORIGIN, cookie }, body: form }));
    expect(await projectsOf(cookie)).toBeNull();
  });

  it("resets the password with the recovery code and keeps the records", async () => {
    const recoveryCode = await signUpAndVerify("잊은 사람", "forgot@example.com", "first password 1");
    const first = await signIn("forgot@example.com", "first password 1");
    const bearer = await connectorToken(first.cookie);
    await tool(bearer, "create_project", { idea: "잊어도 남아야 할 아이디어", plan });

    outbox.length = 0;
    expect((await forgot(json(`${ORIGIN}/api/auth/forgot`, { email: "nobody@example.com" }))).status).toBe(200);
    expect(outbox).toHaveLength(0);
    await forgot(json(`${ORIGIN}/api/auth/forgot`, { email: "forgot@example.com" }));
    const resetToken = linkFrom(outbox.at(-1)!, "/auth/reset");
    const wrong = await reset(json(`${ORIGIN}/api/auth/reset`, { token: resetToken, password: "second password 2", recoveryCode: "AAAA-AAAA-AAAA-AAAA-AAAA" }));
    expect(wrong.status).toBe(400);
    // The failed attempt used the link up; ask again.
    await forgot(json(`${ORIGIN}/api/auth/forgot`, { email: "forgot@example.com" }));
    const ok = await reset(json(`${ORIGIN}/api/auth/reset`, { token: linkFrom(outbox.at(-1)!, "/auth/reset"), password: "second password 2", recoveryCode: recoveryCode.toLowerCase() }));
    expect(ok.status).toBe(200);
    const result = await ok.json();
    expect(result.keptRecords).toBe(true);
    expect(result.recoveryCode).not.toBe(recoveryCode);

    expect(await projectsOf(first.cookie)).toBeNull();
    expect((await tool(bearer, "list_projects", {}))).toBeUndefined();
    expect((await signIn("forgot@example.com", "first password 1")).status).toBe(401);
    const again = await signIn("forgot@example.com", "second password 2");
    expect((await projectsOf(again.cookie))!.map((p) => p.idea)).toEqual(["잊어도 남아야 할 아이디어"]);
  });

  it("can take the account back without the recovery code, erasing the records", async () => {
    await signUpAndVerify("코드 없음", "nocode@example.com", "first password 1");
    const first = await signIn("nocode@example.com", "first password 1");
    await tool(await connectorToken(first.cookie), "create_project", { idea: "지워질 아이디어", plan });
    await forgot(json(`${ORIGIN}/api/auth/forgot`, { email: "nocode@example.com" }));
    const result = await (await reset(json(`${ORIGIN}/api/auth/reset`, { token: linkFrom(outbox.at(-1)!, "/auth/reset"), password: "fresh password 3", abandon: true }))).json();
    expect(result.keptRecords).toBe(false);
    const again = await signIn("nocode@example.com", "fresh password 3");
    expect(await projectsOf(again.cookie)).toEqual([]);
  });

  it("changes the password and signs other devices out", async () => {
    await signUpAndVerify("바꾸는 사람", "change@example.com", "first password 1");
    const laptop = await signIn("change@example.com", "first password 1");
    const phone = await signIn("change@example.com", "first password 1");
    await tool(await connectorToken(laptop.cookie), "create_project", { idea: "비번 바꿔도 남는 아이디어", plan });
    expect((await meAction(json(`${ORIGIN}/api/me`, { action: "change_password", current: "nope nope nope", next: "second password 2" }, { cookie: laptop.cookie }))).status).toBe(401);
    expect((await meAction(json(`${ORIGIN}/api/me`, { action: "change_password", current: "first password 1", next: "second password 2" }, { cookie: laptop.cookie }))).status).toBe(200);
    expect(await projectsOf(phone.cookie)).toBeNull();
    expect((await projectsOf(laptop.cookie))!).toHaveLength(1);
    const fresh = await signIn("change@example.com", "second password 2");
    expect((await projectsOf(fresh.cookie))!.map((p) => p.idea)).toEqual(["비번 바꿔도 남는 아이디어"]);
  });
});

describe("Google accounts", () => {
  function mockGoogle(profile: { sub: string; email: string; name: string }) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "google-access" }), { status: 200 });
      if (url.startsWith("https://openidconnect.googleapis.com/v1/userinfo")) return new Response(JSON.stringify({ ...profile, email_verified: true }), { status: 200 });
      return new Response("unexpected", { status: 500 });
    }));
  }
  async function googleRound(query: string) {
    const start = googleStart(new NextRequest(`${ORIGIN}/api/auth/google/start?${query}`));
    const location = new URL(start.headers.get("location")!);
    if (location.origin !== "https://accounts.google.com") return { start: location, callback: null as Response | null };
    const stateCookie = cookieOf(start, "dalgeurak_google");
    const callback = await googleCallback(new NextRequest(`${ORIGIN}/api/auth/google/callback?code=abc&state=${location.searchParams.get("state")}`, { headers: { cookie: stateCookie } }));
    return { start: location, callback };
  }

  it("asks for the notice before sign-up and then keeps the key on the server", async () => {
    const noConsent = await googleRound("intent=signup");
    expect(noConsent.start.pathname + noConsent.start.search).toBe("/join?google=consent");
    mockGoogle({ sub: "g-1", email: "googler@example.com", name: "구글러" });
    const unknownLogin = await googleRound("intent=login");
    expect(new URL(unknownLogin.callback!.headers.get("location")!).search).toBe("?google=consent");

    const { start, callback } = await googleRound("intent=signup&agree=1&name=%EA%B5%AC%EA%B8%80%EB%9F%AC");
    expect(start.searchParams.get("code_challenge_method")).toBe("S256");
    const cookie = cookieOf(callback!);
    expect(cookie).toMatch(/^dalgeurak_session=s\./);
    const account = await (await me(new NextRequest(`${ORIGIN}/api/me`, { headers: { cookie } }))).json();
    expect(account).toMatchObject({ auth: "google", email: "googler@example.com", lock: "server", passwordSet: false, googleConsent: { version: expect.any(String) } });
    await tool(await connectorToken(cookie), "create_project", { idea: "구글 계정 아이디어", plan });
    expect(await readFile(path.join(folder, "projects.json"), "utf8")).not.toContain("구글 계정 아이디어");

    // A later Google login opens the same records without any password.
    const second = await googleRound("intent=login");
    expect((await projectsOf(cookieOf(second.callback!)))!.map((p) => p.idea)).toEqual(["구글 계정 아이디어"]);
  });

  it("upgrades to the password lock, after which Google sign-in asks for the password", async () => {
    mockGoogle({ sub: "g-2", email: "upgrade@example.com", name: "업그레이드" });
    const signed = await googleRound("intent=signup&agree=1");
    const cookie = cookieOf(signed.callback!);
    await tool(await connectorToken(cookie), "create_project", { idea: "잠금을 강화할 아이디어", plan });
    const set = await meAction(json(`${ORIGIN}/api/me`, { action: "set_password", password: "google upgrade pass" }, { cookie }));
    expect(set.status).toBe(200);
    expect((await set.json()).recoveryCode).toMatch(/-/);
    const users = await readFile(path.join(folder, "users.json"), "utf8");
    const record = JSON.parse(users).users.find((u: { email?: string }) => u.email === "upgrade@example.com");
    expect(record.keys.server).toBeUndefined();

    const next = await googleRound("intent=login");
    expect(next.callback!.headers.get("location")).toContain("/login?unlock=1");
    const unlockCookie = cookieOf(next.callback!, "dalgeurak_unlock");
    expect((await unlock(json(`${ORIGIN}/api/auth/unlock`, { password: "wrong password!" }, { cookie: unlockCookie }))).status).toBe(401);
    const again = await googleRound("intent=login");
    const opened = await unlock(json(`${ORIGIN}/api/auth/unlock`, { password: "google upgrade pass" }, { cookie: cookieOf(again.callback!, "dalgeurak_unlock") }));
    expect((await projectsOf(cookieOf(opened)))!.map((p) => p.idea)).toEqual(["잠금을 강화할 아이디어"]);
  });

  it("will not take over an email account with the same address", async () => {
    await signUpAndVerify("이메일 먼저", "both@example.com", "email first pass");
    mockGoogle({ sub: "g-3", email: "both@example.com", name: "같은 사람" });
    const { callback } = await googleRound("intent=signup&agree=1");
    expect(callback!.headers.get("location")).toContain("/login?error=google_taken");
  });
});

describe("old link accounts", () => {
  it("turn into email accounts, keep their records and stop the link", async () => {
    const { token: link } = await createUser("링크 사용자", false);
    const legacy = await legacyMcp(new NextRequest(`${ORIGIN}/api/mcp/${link}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_project", arguments: { idea: "링크 시절 아이디어", plan } } }) }), { params: Promise.resolve({ token: link }) });
    expect((await legacy.json()).result.isError).toBeFalsy();
    const converted = await meAction(json(`${ORIGIN}/api/me`, { action: "set_password", email: "linker@example.com", password: "converted password" }, { cookie: `dalgeurak_session=u.${link}` }));
    expect(converted.status).toBe(200);
    expect((await converted.json()).verificationSent).toBe(true);
    const sessionCookie = cookieOf(converted);
    expect((await projectsOf(sessionCookie))!.map((p) => p.idea)).toEqual(["링크 시절 아이디어"]);
    expect(await projectsOf(`dalgeurak_session=u.${link}`)).toBeNull();
    expect((await signIn("linker@example.com", "converted password")).status).toBe(403);
    await verify(json(`${ORIGIN}/api/auth/verify`, { token: linkFrom(outbox.at(-1)!, "/auth/verify") }));
    const later = await signIn("linker@example.com", "converted password");
    expect((await projectsOf(later.cookie))!.map((p) => p.idea)).toEqual(["링크 시절 아이디어"]);
    expect((await listUsers()).find((u) => u.email === "linker@example.com")).toMatchObject({ auth: "password", lock: "password" });
  });
});
