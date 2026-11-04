import { NextRequest, NextResponse } from "next/server";
import { publicUrl } from "../../../lib/request-security";
import { userSessionValue } from "../../../lib/session";
import { findUserByToken } from "../../../lib/users";
import { clientIp, exhausted, hit } from "../../../lib/rate-limit";

// Personal dashboard link: signs the invited user in for 30 days. The cookie
// holds their own token, so their sealed records open only in their browser.
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const ip = clientIp(request);
  if (exhausted("linkFailure", ip)) return NextResponse.redirect(publicUrl(request, "/login?error=slow"), 303);
  const user = await findUserByToken(token);
  if (!user) hit("linkFailure", ip);
  if (!user) return NextResponse.redirect(publicUrl(request, "/login?error=link"), 303);
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30;
  // Carry a project and panel to open (e.g. the checklist link Claude hands out).
  const target = new URLSearchParams();
  const projectParam = request.nextUrl.searchParams.get("p");
  const openParam = request.nextUrl.searchParams.get("open");
  if (projectParam && /^[0-9a-f-]{36}$/.test(projectParam)) target.set("p", projectParam);
  if (openParam && ["profile", "claude", "dev"].includes(openParam)) target.set("open", openParam);
  const response = NextResponse.redirect(publicUrl(request, target.size ? `/?${target}` : "/"), 303);
  response.cookies.set("dalgeurak_session", userSessionValue(token), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(expiresAt) });
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("cache-control", "no-store");
  return response;
}
