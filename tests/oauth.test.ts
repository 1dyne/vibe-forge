import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { GET as resourceMetadata } from "../apps/web/app/.well-known/oauth-protected-resource/[[...path]]/route";
import { GET as serverMetadata } from "../apps/web/app/.well-known/oauth-authorization-server/[[...path]]/route";
import { POST as register } from "../apps/web/app/api/oauth/register/route";
import { POST as authorize } from "../apps/web/app/api/oauth/authorize/route";
import { POST as token } from "../apps/web/app/api/oauth/token/route";
import { POST as mcp } from "../apps/web/app/api/mcp/route";
import { DELETE as disconnect, GET as connections } from "../apps/web/app/api/me/connections/route";
import { POST as rotate } from "../apps/web/app/api/me/route";
import { GET as listRoute } from "../apps/web/app/api/projects/route";
import { DELETE as deleteProjectRoute } from "../apps/web/app/api/projects/[id]/route";
import { signSession, userSessionValue } from "../apps/web/lib/session";
import { resetRateLimits } from "../apps/web/lib/rate-limit";
import { createUser } from "../apps/web/lib/users";

const ORIGIN = "https://forge.example";
const SECRET = "test-secret-for-oauth-routes-0123456789";
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
let folder: string;

beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "forge-oauth-test-"));
  vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
  vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
  vi.stubEnv("FORGE_TEST_OAUTH_FILE", path.join(folder, "oauth.json"));
  vi.stubEnv("FORGE_TEST_AUDIT_FILE", path.join(folder, "audit.jsonl"));
  vi.stubEnv("APP_MODE", "mock");
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("APP_BASE_URL", ORIGIN);
});
afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });
beforeEach(() => resetRateLimits());

const plan = { projectName: "OAuth 램프", oneLiner: "버튼 램프", reply: "좋아요", slotUpdates: [], tasks: [] };
const json = (url: string, body: unknown, headers: Record<string, string> = {}, method = "POST") => new NextRequest(url, { method, headers: { "content-type": "application/json", origin: ORIGIN, ...headers }, body: JSON.stringify(body) });
const form = (body: Record<string, string>) => new NextRequest(`${ORIGIN}/api/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });
async function rpc(bearer: string | null, method: string, params?: Record<string, unknown>) {
  const response = await mcp(new NextRequest(`${ORIGIN}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
  return { status: response.status, headers: response.headers, body: await response.json() };
}

async function connect(linkToken: string) {
  const client = await (await register(json(`${ORIGIN}/api/oauth/register`, { client_name: "Claude", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" }))).json();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const allowed = await (await authorize(json(`${ORIGIN}/api/oauth/authorize`, { client_id: client.client_id, redirect_uri: CALLBACK, code_challenge: challenge, state: "xyz", decision: "allow" }, { cookie: `dalgeurak_session=${userSessionValue(linkToken)}` }))).json();
  const redirect = new URL(allowed.redirect);
  return { client, verifier, redirect, code: redirect.searchParams.get("code")! };
}

describe("MCP OAuth", () => {
  it("publishes discovery metadata and asks unauthenticated callers to log in", async () => {
    const resource = await (await resourceMetadata(new NextRequest(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`))).json();
    expect(resource).toMatchObject({ resource: `${ORIGIN}/api/mcp`, authorization_servers: [ORIGIN] });
    const server = await (await serverMetadata(new NextRequest(`${ORIGIN}/.well-known/oauth-authorization-server`))).json();
    expect(server).toMatchObject({ issuer: ORIGIN, authorization_endpoint: `${ORIGIN}/oauth/authorize`, token_endpoint: `${ORIGIN}/api/oauth/token`, registration_endpoint: `${ORIGIN}/api/oauth/register`, code_challenge_methods_supported: ["S256"] });
    const anonymous = await rpc(null, "tools/list");
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("www-authenticate")).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`);
  });

  it("answers discovery with the address the connector was added at", async () => {
    // dalgrak.app 으로 옮기기 전 Railway 주소로 등록한 커넥터: resource가 등록 주소와 같아야 Claude가 연결을 이어간다
    const at = (host: string, path: string) => new NextRequest(`${ORIGIN}${path}`, { headers: { "x-forwarded-host": host } });
    const railway = await (await resourceMetadata(at("web-production-x.up.railway.app", "/.well-known/oauth-protected-resource/api/mcp"))).json();
    expect(railway).toMatchObject({ resource: "https://web-production-x.up.railway.app/api/mcp", authorization_servers: ["https://web-production-x.up.railway.app"] });
    const server = await (await serverMetadata(at("web-production-x.up.railway.app", "/.well-known/oauth-authorization-server"))).json();
    expect(server.token_endpoint).toBe("https://web-production-x.up.railway.app/api/oauth/token");
    // 모르는 주소는 따라가지 않고 대표 주소로 답한다
    const stranger = await (await resourceMetadata(at("evil.example", "/.well-known/oauth-protected-resource/api/mcp"))).json();
    expect(stranger.resource).toBe(`${ORIGIN}/api/mcp`);
  });

  it("refuses redirect URIs that are not https or loopback", async () => {
    expect((await register(json(`${ORIGIN}/api/oauth/register`, { redirect_uris: ["http://evil.example/cb"] }))).status).toBe(400);
    expect((await register(json(`${ORIGIN}/api/oauth/register`, { redirect_uris: ["http://127.0.0.1:5555/callback"] }))).status).toBe(201);
  });

  it("connects with PKCE, opens only that person's records and rotates refresh tokens", async () => {
    const { user, token: link } = await createUser("OAuth 참여자", false);
    const { client, verifier, redirect, code } = await connect(link);
    expect(redirect.origin + redirect.pathname).toBe(CALLBACK);
    expect(redirect.searchParams.get("state")).toBe("xyz");

    const wrongVerifier = await token(form({ grant_type: "authorization_code", code, client_id: client.client_id, redirect_uri: CALLBACK, code_verifier: randomBytes(32).toString("base64url") }));
    expect((await wrongVerifier.json()).error).toBe("invalid_grant");
    // The code was burned by the failed attempt.
    const again = await connect(link);
    const issued = await (await token(form({ grant_type: "authorization_code", code: again.code, client_id: again.client.client_id, redirect_uri: CALLBACK, code_verifier: again.verifier }))).json();
    expect(issued).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
    expect((await token(form({ grant_type: "authorization_code", code: again.code, client_id: again.client.client_id, redirect_uri: CALLBACK, code_verifier: again.verifier }))).status).toBe(400);
    void verifier;

    const made = await rpc(issued.access_token, "tools/call", { name: "create_project", arguments: { idea: "OAuth로 만든 비밀 램프", plan } });
    const id = made.body.result.structuredContent.id as string;
    const mine = await (await listRoute(new NextRequest(`${ORIGIN}/api/projects`, { headers: { cookie: `dalgeurak_session=${userSessionValue(link)}` } }))).json();
    expect(mine.projects.map((p: { id: string }) => p.id)).toContain(id);
    const operator = await (await listRoute(new NextRequest(`${ORIGIN}/api/projects`, { headers: { cookie: `dalgeurak_session=${await signSession(Date.now() + 60_000, SECRET)}` } }))).json();
    expect(operator.projects).toEqual([]);
    expect(made.body.result.content[0].text).not.toContain(link);

    const stored = await readFile(path.join(folder, "oauth.json"), "utf8");
    expect(stored).not.toContain(issued.access_token);
    expect(stored).not.toContain(issued.refresh_token);
    expect(await readFile(path.join(folder, "projects.json"), "utf8")).not.toContain("비밀 램프");

    const refreshed = await (await token(form({ grant_type: "refresh_token", refresh_token: issued.refresh_token, client_id: again.client.client_id }))).json();
    expect(refreshed.access_token).not.toBe(issued.access_token);
    expect((await token(form({ grant_type: "refresh_token", refresh_token: issued.refresh_token, client_id: again.client.client_id }))).status).toBe(400);
    expect((await rpc(issued.access_token, "ping")).status).toBe(401);
    expect((await rpc(refreshed.access_token, "tools/call", { name: "get_project", arguments: { projectId: id } })).body.result.isError).toBeFalsy();

    const cookie = `dalgeurak_session=${userSessionValue(link)}`;
    const listed = await (await connections(new NextRequest(`${ORIGIN}/api/me/connections`, { headers: { cookie } }))).json();
    expect(listed.connections).toHaveLength(1);
    expect((await disconnect(json(`${ORIGIN}/api/me/connections`, { id: listed.connections[0].id }, { cookie }, "DELETE"))).status).toBe(200);
    expect((await rpc(refreshed.access_token, "ping")).status).toBe(401);
    void user;
  });

  it("refuses consent without the participant's own session and drops grants on a new link", async () => {
    const { token: link } = await createUser("링크 교체 OAuth", false);
    const client = await (await register(json(`${ORIGIN}/api/oauth/register`, { client_name: "Claude", redirect_uris: [CALLBACK] }))).json();
    const challenge = createHash("sha256").update("v".repeat(43)).digest("base64url");
    const operatorCookie = `dalgeurak_session=${await signSession(Date.now() + 60_000, SECRET)}`;
    expect((await authorize(json(`${ORIGIN}/api/oauth/authorize`, { client_id: client.client_id, redirect_uri: CALLBACK, code_challenge: challenge, state: "", decision: "allow" }, { cookie: operatorCookie }))).status).toBe(401);
    expect((await authorize(json(`${ORIGIN}/api/oauth/authorize`, { client_id: client.client_id, redirect_uri: "https://evil.example/cb", code_challenge: challenge, state: "", decision: "allow" }, { cookie: `dalgeurak_session=${userSessionValue(link)}` }))).status).toBe(400);

    const { client: c2, verifier, code } = await connect(link);
    const issued = await (await token(form({ grant_type: "authorization_code", code, client_id: c2.client_id, redirect_uri: CALLBACK, code_verifier: verifier }))).json();
    expect((await rpc(issued.access_token, "ping")).status).toBe(200);
    expect((await rotate(json(`${ORIGIN}/api/me`, { action: "rotate_link" }, { cookie: `dalgeurak_session=${userSessionValue(link)}` }))).status).toBe(200);
    expect((await rpc(issued.access_token, "ping")).status).toBe(401);
  });
});

describe("project deletion", () => {
  it("needs the project's name, stays within the owner and frees a slot", async () => {
    const owner = await createUser("삭제하는 사람", false);
    const other = await createUser("남의 사람", false);
    const { client, verifier, code } = await connect(owner.token);
    const issued = await (await token(form({ grant_type: "authorization_code", code, client_id: client.client_id, redirect_uri: CALLBACK, code_verifier: verifier }))).json();
    const made = await rpc(issued.access_token, "tools/call", { name: "create_project", arguments: { idea: "지울 아이디어", plan } });
    const id = made.body.result.structuredContent.id as string;
    const del = (cookie: string, confirmName: string) => deleteProjectRoute(json(`${ORIGIN}/api/projects/${id}`, { confirmName }, { cookie }, "DELETE"), { params: Promise.resolve({ id }) });
    const ownerCookie = `dalgeurak_session=${userSessionValue(owner.token)}`;
    expect((await del(ownerCookie, "다른 이름")).status).toBe(400);
    expect((await del(`dalgeurak_session=${userSessionValue(other.token)}`, "OAuth 램프")).status).toBe(404);
    expect((await del(`dalgeurak_session=${await signSession(Date.now() + 60_000, SECRET)}`, "OAuth 램프")).status).toBe(404);
    expect((await del(ownerCookie, "OAuth 램프")).status).toBe(200);
    const after = await (await listRoute(new NextRequest(`${ORIGIN}/api/projects`, { headers: { cookie: ownerCookie } }))).json();
    expect(after.projects).toEqual([]);
    expect(after.viewer.projectLimit).toBe(20);
    expect((await rpc(issued.access_token, "tools/call", { name: "get_project", arguments: { projectId: id } })).body.result.isError).toBe(true);
    const tools = (await rpc(issued.access_token, "tools/list")).body.result.tools as Array<{ name: string }>;
    expect(tools.some((tool) => /delete/.test(tool.name))).toBe(false);
  });
});
