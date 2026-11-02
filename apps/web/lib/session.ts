const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Payload is "<expiresAt>" for the operator or "<expiresAt>~<userId>" for an
// invited user.
export async function signSession(expiresAt: number, secret: string, userId?: string): Promise<string> {
  const payload = userId ? `${expiresAt}~${userId}` : String(expiresAt);
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function readSession(token: string | undefined, secret: string | undefined): Promise<{ userId: string | null } | null> {
  if (!token || !secret) return null;
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied) return null;
  const [expiresRaw, userId] = payload.split("~");
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  if (userId !== undefined && !/^[0-9a-f-]{36}$/.test(userId)) return null;
  const expected = await signSession(expiresAt, secret, userId);
  return timingSafeEqualText(expected, token) ? { userId: userId ?? null } : null;
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
