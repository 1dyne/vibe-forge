import { NextRequest, NextResponse } from "next/server";
import { origin, safeNext } from "../../../../../lib/auth-http";
import { GOOGLE_COOKIE, googleConfigured, startGoogle } from "../../../../../lib/google";
import { signupMode } from "../../../../../lib/policies";
import { publicUrl } from "../../../../../lib/request-security";

// Leaves for Google. Sign-up choices (agreed to the notice and the terms,
// nickname, invite code) travel in a signed cookie and come back with the person.
export function GET(request: NextRequest) {
  if (!googleConfigured()) return NextResponse.redirect(publicUrl(request, "/login?error=google_off"), 303);
  const params = request.nextUrl.searchParams;
  const intent = params.get("intent") === "signup" ? "signup" : "login";
  if (intent === "signup" && signupMode() === "closed") return NextResponse.redirect(publicUrl(request, "/join"), 303);
  const agreed = intent === "signup" && params.get("agree") === "1";
  if (intent === "signup" && !agreed) return NextResponse.redirect(publicUrl(request, "/join?google=consent"), 303);
  const { url, cookie } = startGoogle(origin(request), {
    intent, agreed,
    name: params.get("name")?.slice(0, 30) || undefined,
    inviteCode: params.get("invite")?.slice(0, 40) || undefined,
    next: safeNext(params.get("next"))
  });
  const response = NextResponse.redirect(url, 303);
  response.cookies.set(GOOGLE_COOKIE, cookie, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/google", maxAge: 600 });
  return response;
}
