import { challengeOf, listenOnce, openBrowser, random, withTimeout } from "./loopback.mjs";
import { read, write, remove } from "./store.mjs";

// 달그락 대장간 쪽 연결. Claude 커넥터와 똑같은 OAuth와 똑같은 도구(MCP)를 쓴다.
// 달그락 서버가 받는 것은 이 로그인과 도구 호출, 그리고 화면에 보여줄 답뿐이다.
// ChatGPT 토큰은 여기로 가지 않는다.

const FILE = "dalgrak.json";
export const DEFAULT_SERVER = "https://dalgrak.app";
export const server = () => (process.env.DALGRAK_SERVER || read(FILE)?.server || DEFAULT_SERVER).replace(/\/+$/, "");
export const link = () => read(FILE);

export class DalgrakError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function json(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new DalgrakError(body.error ?? `http_${response.status}`, body.error_description ?? body.error ?? "달그락 대장간에 연결하지 못했어요.");
  return body;
}

export async function login({ print = console.log } = {}) {
  const base = server();
  const meta = await json(await fetch(`${base}/.well-known/oauth-authorization-server`));
  const listener = await listenOnce({ path: "/callback", ports: [1466, 1467, 0] });
  try {
    const client = await json(await fetch(meta.registration_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "달그락 도우미", redirect_uris: [listener.redirectUri], token_endpoint_auth_method: "none" }) }));
    const state = random();
    const verifier = random(32);
    const url = `${meta.authorization_endpoint}?${new URLSearchParams({ response_type: "code", client_id: client.client_id, redirect_uri: listener.redirectUri, code_challenge: challengeOf(verifier), code_challenge_method: "S256", state })}`;
    print("브라우저에서 달그락 대장간 로그인 화면을 열었어요.");
    openBrowser(url);
    const params = await withTimeout(listener.result, 5 * 60_000, "달그락 로그인을 기다리다 시간이 지났어요.");
    if (params.get("state") !== state) throw new DalgrakError("state_mismatch", "로그인 시도가 서로 달라 멈췄어요.");
    if (params.get("error") || !params.get("code")) throw new DalgrakError(params.get("error") ?? "no_code", "달그락 대장간 연결을 허용하지 않았어요.");
    const tokens = await json(await fetch(meta.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: client.client_id, code: params.get("code"), redirect_uri: listener.redirectUri, code_verifier: verifier }) }));
    const saved = { server: base, client_id: client.client_id, token_endpoint: meta.token_endpoint, access_token: tokens.access_token, refresh_token: tokens.refresh_token ?? null, expires_in: tokens.expires_in ?? 3600, saved_at: new Date().toISOString() };
    write(FILE, saved);
    return saved;
  } finally { listener.close(); }
}

let refreshing = null;
async function token({ force = false } = {}) {
  const saved = link();
  if (!saved?.access_token) throw new DalgrakError("signed_out", "달그락 대장간에 연결돼 있지 않아요.");
  const expiresAt = new Date(saved.saved_at).getTime() + saved.expires_in * 1000;
  if (!force && Date.now() < expiresAt - 5 * 60_000) return saved.access_token;
  if (!saved.refresh_token) throw new DalgrakError("signed_out", "달그락 대장간에 다시 로그인해주세요.");
  refreshing ??= (async () => {
    try {
      const response = await fetch(saved.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", client_id: saved.client_id, refresh_token: saved.refresh_token }) });
      if (response.status === 400 || response.status === 401) { write(FILE, { ...saved, access_token: null, refresh_token: null }); throw new DalgrakError("signed_out", "달그락 대장간 연결이 만료됐어요. 다시 로그인해주세요."); }
      const tokens = await json(response);
      write(FILE, { ...saved, access_token: tokens.access_token, refresh_token: tokens.refresh_token ?? saved.refresh_token, expires_in: tokens.expires_in ?? 3600, saved_at: new Date().toISOString() });
      return tokens.access_token;
    } finally { refreshing = null; }
  })();
  return refreshing;
}

/** 달그락 서버에 로그인한 채로 요청한다. 401이면 토큰을 한 번 바꿔 다시 한다. */
export async function call(path, body, { signal, timeoutMs = 40_000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${server()}${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await token({ force: attempt > 0 })}` }, body: JSON.stringify(body), signal: signal ?? AbortSignal.timeout(timeoutMs) });
    if (response.status === 401 && attempt === 0) continue;
    if (response.status === 401) throw new DalgrakError("signed_out", "달그락 대장간에 다시 로그인해주세요.");
    return response;
  }
}

let rpcId = 0;
async function rpc(method, params) {
  const response = await call("/api/mcp", { jsonrpc: "2.0", id: ++rpcId, method, params });
  const body = await response.json().catch(() => null);
  if (!body || body.error) throw new DalgrakError("mcp_error", body?.error?.message ?? `달그락 도구 요청이 실패했어요 (${response.status}).`);
  return body.result;
}

export const mcp = {
  initialize: (version) => rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "dalgrak-helper", version } }),
  listTools: async () => (await rpc("tools/list", {})).tools,
  /** 도구 결과를 모델에게 줄 글로 돌려준다. 실패도 글로 돌려줘 모델이 고쳐서 다시 부르게 한다. */
  callTool: async (name, args) => {
    try {
      const result = await rpc("tools/call", { name, arguments: args });
      const text = (result.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
      const data = result.structuredContent ? `\n${JSON.stringify(result.structuredContent)}` : "";
      return { ok: !result.isError, text: `${result.isError ? "[거절됨] " : ""}${text}${data}`.slice(0, 60_000) };
    } catch (error) {
      return { ok: false, text: `[도구 오류] ${error instanceof Error ? error.message : "알 수 없는 오류"}` };
    }
  }
};

export const logout = () => remove(FILE);
