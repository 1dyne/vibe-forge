import { NextRequest, NextResponse } from "next/server";
import { signSession, timingSafeEqualText } from "../../../lib/session";
import { hasValidOrigin, publicUrl } from "../../../lib/request-security";
import { audit } from "../../../lib/audit";
import { clientIp, hit } from "../../../lib/rate-limit";

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const form = await request.formData();
  if (form.get("intent") === "logout") {
    const response = NextResponse.redirect(publicUrl(request, "/login"), 303);
    response.cookies.set("dalgeurak_session", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
    return response;
  }
  const password = process.env.APP_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!password || !secret) return NextResponse.json({ error: "authentication is not configured" }, { status: 503 });
  // Failed and successful attempts both count, so guessing is slow either way.
  if (!hit("login", clientIp(request)).ok) return NextResponse.redirect(publicUrl(request, "/login?error=slow"), 303);
  const submitted = String(form.get("password") ?? "");
  if (!timingSafeEqualText(submitted, password)) {
    await audit("operator_login_failed");
    return NextResponse.redirect(publicUrl(request, "/login?error=1"), 303);
  }
  await audit("operator_login");
  const expiresAt = Date.now() + 1000 * 60 * 60 * (form.get("remember") === "on" ? 24 * 30 : 12);
  const response = NextResponse.redirect(publicUrl(request, "/"), 303);
  response.cookies.set("dalgeurak_session", await signSession(expiresAt, secret), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(expiresAt) });
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set("dalgeurak_session", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
