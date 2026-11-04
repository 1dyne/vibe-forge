import { NextRequest, NextResponse } from "next/server";
import { sessionSecretFrom, userTokenFrom, verifySession } from "./lib/session";
import { publicUrl } from "./lib/request-security";

const publicPaths = new Set(["/login", "/join", "/terms", "/privacy", "/api/link", "/u", "/auth/verify", "/auth/reset", "/api/mcp", "/oauth/authorize", "/api/session", "/api/health", "/characters/idle.png", "/characters/thinking_1.png", "/characters/thinking_2.png", "/manifest.webmanifest", "/icon.png"]);
// The install prompt fetches the manifest and icons before anyone logs in.
// /api/mcp/ authenticates with the participant token in its path; /u/<token>
// is the older dashboard link form (new links use /u#<token>).
const publicPrefixes = ["/icons/", "/demo/", "/api/mcp/", "/u/", "/.well-known/", "/api/oauth/", "/api/auth/"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
