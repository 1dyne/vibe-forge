import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// In-memory fixed-window limiter. Enough for one web replica; with more
// replicas, move the counters to a shared store (Redis/Postgres).
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// A talk venue puts many people behind one IP, so per-IP limits count only
// what an attacker needs many of: failed links, failed logins, sign-ups.
export const RATE_LIMITS = {
  login: { limit: 8, windowMs: 15 * 60_000 },
  signup: { limit: Number(process.env.RATE_SIGNUP_PER_IP_HOUR ?? 40), windowMs: 60 * 60_000 },
  linkFailure: { limit: 20, windowMs: 15 * 60_000 },
  mcp: { limit: 180, windowMs: 60_000 },
  oauthRegister: { limit: 30, windowMs: 60 * 60_000 },
  account: { limit: 10, windowMs: 60 * 60_000 }
} as const;

export function hit(kind: keyof typeof RATE_LIMITS, key: string, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const { limit, windowMs } = RATE_LIMITS[kind];
  const id = `${kind}:${key}`;
  let bucket = buckets.get(id);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(id, bucket);
  }
  bucket.count += 1;
  if (buckets.size > 50_000) for (const [name, item] of buckets) if (item.resetAt <= now) buckets.delete(name);
  return { ok: bucket.count <= limit, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
}

// True when this key already used up its window (does not count a hit).
export function exhausted(kind: keyof typeof RATE_LIMITS, key: string, now = Date.now()): boolean {
  const bucket = buckets.get(`${kind}:${key}`);
  return Boolean(bucket && bucket.resetAt > now && bucket.count >= RATE_LIMITS[kind].limit);
}

export function resetRateLimits() {
  buckets.clear();
}

// Railway's edge sets X-Real-IP; the first X-Forwarded-For entry can be
// supplied by the client, so the last one (added by the nearest proxy) is used.
export function clientIp(request: NextRequest): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? "local";
}

export function tooMany(retryAfterSec: number, message = "요청이 너무 많아요. 잠시 후 다시 시도해주세요.") {
  return NextResponse.json({ error: message }, { status: 429, headers: { "retry-after": String(retryAfterSec) } });
}
