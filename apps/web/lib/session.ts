const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Operator sessions: "<expiresAt>.<hmac>" signed with SESSION_SECRET.
export async function signSession(expiresAt: number, secret: string): Promise<string> {
  const payload = String(expiresAt);
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

// Participant sessions carry the participant's own link token ("u.<token>"),
// checked against its stored hash on every request. They are not signed with
// SESSION_SECRET on purpose: whoever holds that secret must not be able to
// mint a participant session, and the token is what opens their sealed records.
const USER_COOKIE = /^u\.([A-Za-z0-9_-]{20,100})$/;
export const userSessionValue = (token: string) => `u.${token}`;
export function userTokenFrom(cookie: string | undefined): string | null {
  return cookie?.match(USER_COOKIE)?.[1] ?? null;
}

export async function readSession(token: string | undefined, secret: string | undefined): Promise<{ operator: true } | null> {
  if (!token || !secret) return null;
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied || !/^\d+$/.test(payload)) return null;
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  const expected = await signSession(expiresAt, secret);
  return timingSafeEqualText(expected, token) ? { operator: true } : null;
}

export async function verifySession(token: string | undefined, secret: string | undefined): Promise<boolean> {
  return (await readSession(token, secret)) !== null;
}

export function timingSafeEqualText(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}
