import { randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { hashToken } from "./village-store";

// 로그인 없이 "내 대장간"을 알아보는 기기 토큰. 원문은 쿠키에만, DB에는 해시만 둔다.
export const OWNER_COOKIE = "find_owner";
const TWO_YEARS = 60 * 60 * 24 * 365 * 2;

export function ownerTokenFrom(value: string | undefined | null): string | null {
  return value && /^[A-Za-z0-9_-]{32,64}$/.test(value) ? value : null;
}

export function ownerHashFromRequest(request: NextRequest): string | null {
  const token = ownerTokenFrom(request.cookies.get(OWNER_COOKIE)?.value);
  return token ? hashToken(token) : null;
}

export function newOwnerToken() {
  return randomBytes(24).toString("base64url");
}

export function setOwnerCookie(response: NextResponse, token: string) {
  response.cookies.set(OWNER_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TWO_YEARS });
}
