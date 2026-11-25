import { createPublicKey, verify } from "node:crypto";
import { challengeOf, listenOnce, openBrowser, random, withTimeout } from "./loopback.mjs";
import { hostId, read, remove, write } from "./store.mjs";

// Sign in with ChatGPT · ChatGPT 요금제 사용 (오픈소스·내 컴퓨터에서 도는 앱용 공개 흐름)
// https://developers.openai.com/siwc/token-sharing-open-source
//
// 클라이언트 시크릿도, 파트너 API 키도 없다. 처음 로그인할 때 사용자가 자기 계정에
// 이 앱을 등록하고(dynamic_agent_client), 그때 받은 client_id를 다음부터 다시 쓴다.
// 받은 토큰은 이 컴퓨터에만 두고, api.openai.com/v1 로만 보낸다.

export const ISSUER = "https://auth.openai.com";
const AUTHORIZE = `${ISSUER}/api/accounts/authorize`;
const TOKEN = `${ISSUER}/api/accounts/oauth/token`;
const JWKS = `${ISSUER}/.well-known/jwks.json`;
export const RESOURCE = "https://api.openai.com/v1";
const SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
export const PLAN_SCOPE = "chatgpt.tokens.use.direct";
export const AGENT_NAME = "Dalgrak Helper";
const FILE = "openai.json";
// 경로는 등록 때와 늘 같아야 한다. 포트만 바뀔 수 있다.
const CALLBACK_PATH = "/auth/callback";
const PORTS = [1455, 1456, 1457, 0];

export class AuthError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const form = (fields) => new URLSearchParams(Object.entries(fields).filter(([, value]) => value != null));

async function tokenRequest(fields) {
  const response = await fetch(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: form(fields) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new AuthError(body.error?.code ?? body.error ?? `http_${response.status}`, body.error_description ?? body.error?.message ?? "토큰을 받지 못했어요.");
  return body;
}

const decode = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

/** ID 토큰의 서명·발급자·대상·만료·nonce를 확인하고 내용을 돌려준다. */
export async function verifyIdToken(idToken, { clientId, nonce, jwks, now = Date.now() }) {
  const [h, p, s] = String(idToken).split(".");
  if (!h || !p || !s) throw new AuthError("id_token_invalid", "로그인 확인서 형식이 달라요.");
  const header = decode(h);
  const payload = decode(p);
  const keys = jwks ?? (await (await fetch(JWKS)).json()).keys;
  const jwk = keys.find((key) => key.kid === header.kid) ?? (keys.length === 1 ? keys[0] : null);
  if (!jwk) throw new AuthError("id_token_invalid", "로그인 확인서를 검증할 열쇠를 찾지 못했어요.");
  const algorithm = { RS256: ["RSA-SHA256", {}], ES256: ["SHA256", { dsaEncoding: "ieee-p1363" }] }[header.alg];
  if (!algorithm) throw new AuthError("id_token_invalid", `지원하지 않는 서명 방식이에요 (${header.alg}).`);
  const key = createPublicKey({ key: jwk, format: "jwk" });
  if (!verify(algorithm[0], Buffer.from(`${h}.${p}`), { key, ...algorithm[1] }, Buffer.from(s, "base64url"))) throw new AuthError("id_token_invalid", "로그인 확인서의 서명이 맞지 않아요.");
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== ISSUER) throw new AuthError("id_token_invalid", "발급자가 달라요.");
  if (!audience.includes(clientId)) throw new AuthError("id_token_invalid", "이 앱에 발급된 확인서가 아니에요.");
  if (typeof payload.exp !== "number" || payload.exp * 1000 < now - 60_000) throw new AuthError("id_token_invalid", "로그인 확인서가 만료됐어요.");
  if (nonce && payload.nonce !== nonce) throw new AuthError("id_token_invalid", "로그인 시도가 서로 달라요.");
  return payload;
}

function record(tokens, { clientId, identity, previous }) {
  return {
    email: identity?.email ?? previous?.email ?? null,
    issuer: ISSUER,
    subject: identity?.sub ?? previous?.subject,
    client_id: clientId,
    ext_agent_host_id: hostId(),
    id_token: tokens.id_token ?? previous?.id_token ?? null,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? previous?.refresh_token ?? null,
    token_type: tokens.token_type ?? "Bearer",
    expires_in: tokens.expires_in ?? 3600,
    scopes: String(tokens.scope ?? previous?.scopes?.join(" ") ?? "").split(/\s+/).filter(Boolean).sort(),
    saved_at: new Date().toISOString()
  };
}

export const account = () => read(FILE);
export const planEnabled = (saved = account()) => !!saved?.access_token && saved.scopes?.includes(PLAN_SCOPE);

/** 브라우저를 열어 ChatGPT로 로그인한다. 이미 등록한 계정이면 그 등록을 다시 쓴다. */
export async function login({ print = console.log } = {}) {
  const saved = account();
  const state = random();
  const nonce = random();
  const verifier = random(48);
  const listener = await listenOnce({ path: CALLBACK_PATH, ports: PORTS });
  const query = new URLSearchParams({
    client_id: saved?.client_id ?? "dynamic_agent_client",
    ext_agent_host_id: hostId(),
    response_type: "code",
    redirect_uri: listener.redirectUri,
    scope: SCOPE,
    resource: RESOURCE,
    state, nonce,
    code_challenge_method: "S256",
    code_challenge: challengeOf(verifier)
  });
  if (saved?.client_id) {
    if (saved.id_token) query.set("id_token_hint", saved.id_token);
    if (saved.email) query.set("login_hint", saved.email);
  } else query.set("agent_name_hint", AGENT_NAME);
  const url = `${AUTHORIZE}?${query}`;
  print("브라우저에서 ChatGPT 로그인 화면을 열었어요. 열리지 않으면 도우미를 다시 실행해주세요.");
  openBrowser(url);
  let params;
  try { params = await withTimeout(listener.result, 5 * 60_000, "로그인을 기다리다 시간이 지났어요. 다시 시도해주세요."); }
  finally { listener.close(); }
  if (params.get("state") !== state) throw new AuthError("state_mismatch", "로그인 시도가 서로 달라 멈췄어요. 다시 시도해주세요.");
  if (params.get("error")) throw new AuthError(params.get("error"), params.get("error") === "access_denied" ? "ChatGPT 요금제 사용을 허용하지 않아 연결하지 않았어요." : "ChatGPT 로그인이 끝나지 않았어요.");
  const returned = params.get("client_id");
  if (saved?.client_id && returned && returned !== saved.client_id) throw new AuthError("client_mismatch", "다른 등록 정보가 돌아와 멈췄어요. 로그아웃 후 다시 연결해주세요.");
  const clientId = saved?.client_id ?? returned;
  if (!clientId || clientId === "dynamic_agent_client") throw new AuthError("registration_incomplete", "앱 등록이 끝나지 않았어요. 다시 시도해주세요.");
  const code = params.get("code");
  if (!code) throw new AuthError("no_code", "로그인 결과를 받지 못했어요.");
  const tokens = await tokenRequest({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: verifier, redirect_uri: listener.redirectUri, resource: RESOURCE });
  const identity = await verifyIdToken(tokens.id_token, { clientId, nonce });
  if (saved?.subject && saved.subject !== identity.sub) throw new AuthError("account_mismatch", "저장된 계정과 다른 ChatGPT 계정이에요. 계정을 바꾸려면 먼저 로그아웃해주세요.");
  const next = record(tokens, { clientId, identity, previous: saved });
  write(FILE, next);
  return next;
}

let refreshing = null;
/** 만료가 가까우면 새 토큰으로 바꾼다. 동시에 두 번 바꾸지 않는다(리프레시 토큰은 한 번 쓰면 바뀐다). */
export async function accessToken({ force = false } = {}) {
  const saved = account();
  if (!saved?.access_token) throw new AuthError("signed_out", "ChatGPT에 연결돼 있지 않아요.");
  const expiresAt = new Date(saved.saved_at).getTime() + (saved.expires_in ?? 3600) * 1000;
  if (!force && Date.now() < expiresAt - 5 * 60_000) return saved.access_token;
  if (!saved.refresh_token) throw new AuthError("signed_out", "다시 로그인해주세요.");
  refreshing ??= (async () => {
    try {
      const tokens = await tokenRequest({ grant_type: "refresh_token", client_id: saved.client_id, refresh_token: saved.refresh_token, resource: RESOURCE });
      const next = record(tokens, { clientId: saved.client_id, previous: saved });
      write(FILE, next);
      return next.access_token;
    } catch (error) {
      const dead = ["invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired", "refresh_token_invalidated", "refresh_token_reused"];
      if (error instanceof AuthError && dead.includes(error.code)) {
        // 등록(client_id)은 남기고 쓸 수 없는 토큰만 지운다. 다음 로그인이 그 등록을 다시 쓴다.
        write(FILE, { ...saved, access_token: null, refresh_token: null });
        throw new AuthError("signed_out", "ChatGPT 연결이 만료됐어요. 도우미에서 다시 로그인해주세요.");
      }
      throw error;
    } finally { refreshing = null; }
  })();
  return refreshing;
}

export async function logout() {
  const saved = account();
  if (!saved) return { revoked: true };
  let revoked = !saved.refresh_token;
  if (saved.refresh_token) {
    try {
      const config = await (await fetch(`${ISSUER}/.well-known/openid-configuration`)).json();
      const response = await fetch(config.revocation_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ token: saved.refresh_token, token_type_hint: "refresh_token", client_id: saved.client_id }) });
      revoked = response.ok;
    } catch { revoked = false; }
  }
  // 계정과 등록의 짝(client_id)은 남겨 둔다. 다음에 같은 등록으로 다시 들어온다.
  write(FILE, { email: saved.email, issuer: ISSUER, subject: saved.subject, client_id: saved.client_id, ext_agent_host_id: saved.ext_agent_host_id, id_token: null, access_token: null, refresh_token: null, scopes: [], saved_at: new Date().toISOString() });
  return { revoked };
}

export const forget = () => remove(FILE);
