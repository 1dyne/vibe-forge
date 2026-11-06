import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { unlockWithPassword } from "../../../../lib/account-service";
import { UNLOCK_COOKIE, clearCookie, failure, safeNext, setAccountCookie } from "../../../../lib/auth-http";
import { clientIp, hit, tooMany } from "../../../../lib/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";

// Second step for Google accounts that set a password.
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const limited = hit("passwordIp", clientIp(request));
  if (!limited.ok) return tooMany(limited.retryAfterSec);
  const parsed = z.object({ password: z.string().max(200), next: z.string().max(2000).optional() }).strict().safeParse(await request.json().catch(() => null));
  const token = request.cookies.get(UNLOCK_COOKIE)?.value ?? "";
  if (!parsed.success) return NextResponse.json({ error: "비밀번호를 입력해주세요." }, { status: 400 });
  try {
    const { secret, maxAgeMs } = await unlockWithPassword(token, parsed.data.password);
    return clearCookie(setAccountCookie(NextResponse.json({ next: safeNext(parsed.data.next) }), secret, maxAgeMs), UNLOCK_COOKIE);
  } catch (error) {
    return clearCookie(failure(error, "로그인하지 못했어요.") as NextResponse, UNLOCK_COOKIE);
  }
}
