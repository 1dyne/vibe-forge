import type { NextRequest } from "next/server";

// 공개 페이지용 간단한 프로세스 메모리 제한. 서버가 여러 대가 되면 공유 저장소로 옮겨야 한다.
const buckets = new Map<string, number[]>();

export function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

export function allow(scope: string, key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const id = `${scope}:${key}`;
  const recent = (buckets.get(id) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(id, recent);
    return false;
  }
  recent.push(now);
  buckets.set(id, recent);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
  return true;
}

export function resetRateLimits() {
  buckets.clear();
}
