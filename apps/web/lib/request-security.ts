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

// 이 서비스가 직접 받는 주소들. 커넥터(OAuth) 메타데이터는 요청이 들어온 주소 그대로 답해야 한다:
// Claude 같은 MCP 클라이언트는 등록한 주소와 메타데이터의 resource가 같은지 확인하고, 다르면 연결을 멈춘다.
// (dalgrak.app 으로 옮기기 전에 Railway 주소로 등록한 커넥터가 그대로 동작하게)
function ownHosts(): Set<string> {
  const hosts = new Set<string>();
  const add = (h?: string | null) => { if (h) hosts.add(h.trim().toLowerCase()); };
  try { if (process.env.APP_BASE_URL) add(new URL(process.env.APP_BASE_URL).host); } catch { /* 무시 */ }
  for (const h of (process.env.FIND_HOSTS ?? "").split(",")) add(h);
  for (const h of (process.env.OWN_HOSTS ?? "").split(",")) add(h);
  add(process.env.RAILWAY_PUBLIC_DOMAIN);
  return hosts;
}

export function arrivedOrigin(request: NextRequest): string {
  const host = (request.headers.get("x-forwarded-host")?.split(",")[0].trim() ?? request.headers.get("host") ?? "").toLowerCase();
  if (host && (ownHosts().has(host) || host.endsWith(".up.railway.app"))) return `https://${host}`;
  return publicOrigin(request);
}

export function publicUrl(request: NextRequest, path: string): URL {
  return new URL(path, publicOrigin(request));
}

export function hasValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === publicOrigin(request) || origin === request.nextUrl.origin) return true;
  // Referrer-Policy: no-referrer 때문에 브라우저는 같은 사이트의 폼 전송에도 Origin: null 을 보낸다.
  // 이때는 브라우저가 붙이는 Sec-Fetch-Site(페이지 스크립트가 바꿀 수 없음)로 같은 출처인지 확인한다.
  if (origin === "null") return request.headers.get("sec-fetch-site") === "same-origin";
  // 한 서비스가 여러 주소로 열린다(대표 도메인, www, 온보딩 서브도메인, Railway 주소).
  // 요청이 들어온 그 주소에서 보낸 것이면 같은 출처로 본다. 다른 사이트에서 보낸 요청은 그대로 막힌다.
  let host: string;
  try { host = new URL(origin).host.toLowerCase(); } catch { return false; }
  const arrived = request.headers.get("x-forwarded-host")?.split(",")[0].trim().toLowerCase() ?? request.headers.get("host")?.toLowerCase();
  return Boolean(arrived) && host === arrived;
}
