import { NextRequest, NextResponse } from "next/server";
import { signSession, timingSafeEqualText } from "../../../lib/session";
import { hasValidOrigin } from "../../../lib/request-security";

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const form = await request.formData();
  if (form.get("intent") === "logout") {
    const response = NextResponse.redirect(new URL("/login", request.url), 303);
    response.cookies.set("dalgeurak_session", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
    return response;
  }
  const password = process.env.APP_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!password || !secret) return NextResponse.json({ error: "authentication is not configured" }, { status: 503 });
  const submitted = String(form.get("password") ?? "");
  if (!timingSafeEqualText(submitted, password)) return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  const expiresAt = Date.now() + 1000 * 60 * 60 * (form.get("remember") === "on" ? 24 * 30 : 12);
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set("dalgeurak_session", await signSession(expiresAt, secret), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(expiresAt) });
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set("dalgeurak_session", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
