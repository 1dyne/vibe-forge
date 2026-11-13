import { NextRequest, NextResponse } from "next/server";
import { OWNER_COOKIE } from "../../../../lib/find/owner";
import { hasValidOrigin } from "../../../../lib/request-security";

// 이 기기에서 처음부터: 대장간 기기 토큰 쿠키만 지운다. 저장된 대장간·불·메일은 그대로 남는다(테스트·기기 정리용).
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OWNER_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return res;
}
