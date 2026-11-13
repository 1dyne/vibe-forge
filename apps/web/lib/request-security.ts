import type { NextRequest } from "next/server";

// Behind a hosting proxy (Railway etc.) nextUrl carries the internal address,
// so the public origin comes from APP_BASE_URL or the forwarded headers.
export function publicOrigin(request: NextRequest): string {
  const configured = process.env.APP_BASE_URL;
  if (configured) return new URL(configured).origin;
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  if (host) return `${proto || "https"}://${host}`;
  return request.nextUrl.origin;
}

export function publicUrl(request: NextRequest, path: string): URL {
  return new URL(path, publicOrigin(request));
}

export function hasValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === publicOrigin(request) || origin === request.nextUrl.origin) return true;
  // 한 서비스가 여러 주소로 열린다(대표 도메인, www, 온보딩 서브도메인, Railway 주소).
  // 요청이 들어온 그 주소에서 보낸 것이면 같은 출처로 본다. 다른 사이트에서 보낸 요청은 그대로 막힌다.
  let host: string;
  try { host = new URL(origin).host.toLowerCase(); } catch { return false; }
  const arrived = request.headers.get("x-forwarded-host")?.split(",")[0].trim().toLowerCase() ?? request.headers.get("host")?.toLowerCase();
  return Boolean(arrived) && host === arrived;
}
