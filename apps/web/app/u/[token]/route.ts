import { NextRequest, NextResponse } from "next/server";
import { publicUrl } from "../../../lib/request-security";
import { signSession } from "../../../lib/session";
import { findUserByToken } from "../../../lib/users";

// Personal dashboard link: signs the invited user in for 30 days.
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const secret = process.env.SESSION_SECRET;
  const user = secret ? await findUserByToken(token) : null;
  if (!user || !secret) return NextResponse.redirect(publicUrl(request, "/login?error=link"), 303);
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30;
  // Carry a project and panel to open (e.g. the checklist link Claude hands out).
  const target = new URLSearchParams();
  const projectParam = request.nextUrl.searchParams.get("p");
  const openParam = request.nextUrl.searchParams.get("open");
  if (projectParam && /^[0-9a-f-]{36}$/.test(projectParam)) target.set("p", projectParam);
  if (openParam && ["profile", "claude", "dev"].includes(openParam)) target.set("open", openParam);
  const response = NextResponse.redirect(publicUrl(request, target.size ? `/?${target}` : "/"), 303);
  response.cookies.set("dalgeurak_session", await signSession(expiresAt, secret, user.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(expiresAt) });
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}
