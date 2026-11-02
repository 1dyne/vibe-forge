import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "./lib/session";
import { publicUrl } from "./lib/request-security";

const publicPaths = new Set(["/login", "/api/session", "/api/health", "/characters/idle.png", "/characters/thinking_1.png", "/characters/thinking_2.png", "/manifest.webmanifest", "/icon.png"]);
// The install prompt fetches the manifest and icons before anyone logs in.
// /api/mcp/ and /u/ authenticate with the invited user's token in the path.
const publicPrefixes = ["/icons/", "/demo/", "/api/mcp/", "/u/"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (publicPaths.has(pathname) || publicPrefixes.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next();
  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) {
    if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "로그인 설정이 필요합니다." }, { status: 503 });
    return NextResponse.redirect(publicUrl(request, "/login?setup=required"));
  }
  const valid = await verifySession(request.cookies.get("dalgeurak_session")?.value, process.env.SESSION_SECRET);
  if (valid) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "다시 로그인해주세요." }, { status: 401 });
  return NextResponse.redirect(publicUrl(request, "/login"));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
