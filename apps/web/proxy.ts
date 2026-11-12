import { NextRequest, NextResponse } from "next/server";
import { sessionSecretFrom, userTokenFrom, verifySession } from "./lib/session";
import { publicUrl } from "./lib/request-security";

const publicPaths = new Set(["/login", "/find", "/join", "/terms", "/privacy", "/api/link", "/u", "/auth/verify", "/auth/reset", "/api/mcp", "/oauth/authorize", "/api/session", "/api/health", "/characters/idle.png", "/characters/thinking_1.png", "/characters/thinking_2.png", "/manifest.webmanifest", "/icon.png"]);
// The install prompt fetches the manifest and icons before anyone logs in.
// /api/mcp/ authenticates with the participant token in its path; /u/<token>
// is the older dashboard link form (new links use /u#<token>).
const publicPrefixes = ["/icons/", "/demo/", "/api/mcp/", "/u/", "/.well-known/", "/api/oauth/", "/api/auth/", "/find/", "/f/", "/api/find/"];
// 온보딩 전용 도메인(쉼표로 여러 개). 이 도메인의 첫 화면은 바로 도깨비불 찾기(/find)다.
const landingHosts = () => (process.env.FIND_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  // www.<대표 도메인>은 대표 도메인으로 보낸다. 로그인 쿠키와 요청 출처 검사(APP_BASE_URL)가 한 주소여야 해서.
  const base = process.env.APP_BASE_URL ? new URL(process.env.APP_BASE_URL) : null;
  if (base && host === `www.${base.hostname}`) return NextResponse.redirect(new URL(`${pathname}${request.nextUrl.search}`, base.origin), 308);
  if (pathname === "/" && landingHosts().includes(host)) {
    const url = request.nextUrl.clone();
    url.pathname = "/find";
    return NextResponse.rewrite(url);
  }
  if (pathname === "/start") return NextResponse.redirect(publicUrl(request, "/find"), 308);
  if (publicPaths.has(pathname) || publicPrefixes.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next();
  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) {
    if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "로그인 설정이 필요합니다." }, { status: 503 });
    return NextResponse.redirect(publicUrl(request, "/login?setup=required"));
  }
  // Participant cookies are checked against the stored token hash by each route.
  const cookie = request.cookies.get("dalgeurak_session")?.value;
  const valid = userTokenFrom(cookie) !== null || sessionSecretFrom(cookie) !== null || await verifySession(cookie, process.env.SESSION_SECRET);
  if (valid) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "다시 로그인해주세요." }, { status: 401 });
  return NextResponse.redirect(publicUrl(request, "/login"));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
