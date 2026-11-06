import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AccountError } from "./account-service";
import { MailNotConfigured } from "./mailer";
import { publicOrigin } from "./request-security";
import { accountSessionValue } from "./session";

export const UNLOCK_COOKIE = "dalgeurak_unlock";
export const origin = (request: NextRequest) => publicOrigin(request);
const secure = () => process.env.NODE_ENV === "production";

export function setAccountCookie(response: NextResponse, secret: string, maxAgeMs: number) {
  response.cookies.set("dalgeurak_session", accountSessionValue(secret), { httpOnly: true, sameSite: "lax", secure: secure(), path: "/", maxAge: Math.floor(maxAgeMs / 1000) });
  return response;
}

export function clearCookie(response: NextResponse, name: string) {
  response.cookies.set(name, "", { httpOnly: true, sameSite: "lax", secure: secure(), path: "/", maxAge: 0 });
  return response;
}

export function failure(error: unknown, fallback: string) {
  if (error instanceof AccountError) return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
  if (error instanceof MailNotConfigured) return NextResponse.json({ error: "메일 발송이 아직 준비되지 않았어요. 운영자에게 알려주세요." }, { status: 503 });
  console.error(fallback, error instanceof Error ? error.message : "unknown error");
  return NextResponse.json({ error: fallback }, { status: 500 });
}

// Only same-site relative paths, so "next" cannot send someone elsewhere.
export function safeNext(value: unknown): string {
  return typeof value === "string" && /^\/(?!\/)[\w\-./?=&%#]*$/.test(value) ? value : "/";
}
