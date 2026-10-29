import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "./lib/session";

const publicPaths = new Set(["/login", "/api/session", "/api/health", "/characters/idle.png", "/characters/thinking_1.png", "/characters/thinking_2.png"]);

export async function proxy(request: NextRequest) {
  if (publicPaths.has(request.nextUrl.pathname)) return NextResponse.next();
  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) {
    if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "로그인 설정이 필요합니다." }, { status: 503 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("setup", "required");
    return NextResponse.redirect(url);
  }
  const valid = await verifySession(request.cookies.get("dalgeurak_session")?.value, process.env.SESSION_SECRET);
  if (valid) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "다시 로그인해주세요." }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
