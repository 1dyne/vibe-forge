import { createHash, createHmac, randomBytes } from "node:crypto";
import type { GoogleProfile } from "./account-service";
import { timingSafeEqualText } from "./session";

// Google sign-in (OpenID Connect, authorization code + PKCE). The state, PKCE
// verifier and the sign-up choices made before leaving for Google ride in a
// short signed cookie, so nothing is stored server-side for an abandoned try.
export const GOOGLE_COOKIE = "dalgeurak_google";
export type GoogleState = { state: string; verifier: string; intent: "login" | "signup"; agreed: boolean; name?: string; inviteCode?: string; next?: string; expiresAt: number };

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

const sign = (payload: string) => createHmac("sha256", `google-state:${process.env.SESSION_SECRET ?? ""}`).update(payload).digest("base64url");

export function packState(state: GoogleState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function unpackState(cookie: string | undefined): GoogleState | null {
  const [payload, mac] = (cookie ?? "").split(".");
  if (!payload || !mac || !timingSafeEqualText(sign(payload), mac)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GoogleState;
    return state.expiresAt > Date.now() ? state : null;
  } catch {
    return null;
  }
}

export function startGoogle(origin: string, choices: Omit<GoogleState, "state" | "verifier" | "expiresAt">): { url: string; cookie: string } {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", `${origin}/api/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return { url: url.toString(), cookie: packState({ ...choices, state, verifier, expiresAt: Date.now() + 10 * 60_000 }) };
}

export async function finishGoogle(origin: string, code: string, verifier: string): Promise<GoogleProfile> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", redirect_uri: `${origin}/api/auth/google/callback`, grant_type: "authorization_code", code_verifier: verifier })
  });
  if (!tokenResponse.ok) throw new Error(`google token ${tokenResponse.status}`);
  const { access_token: accessToken } = await tokenResponse.json() as { access_token?: string };
  if (!accessToken) throw new Error("google token missing");
  // The userinfo endpoint answers only for a valid token, so no JWT checking is needed here.
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${accessToken}` } });
  if (!profileResponse.ok) throw new Error(`google userinfo ${profileResponse.status}`);
  const profile = await profileResponse.json() as { sub?: string; email?: string; email_verified?: boolean; name?: string; given_name?: string };
  if (!profile.sub || !profile.email) throw new Error("google profile incomplete");
  return { sub: profile.sub, email: profile.email, emailVerified: profile.email_verified === true, name: profile.given_name || profile.name || "" };
}
