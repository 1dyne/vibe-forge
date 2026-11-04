import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AccountError, logIn } from "../../../../lib/account-service";
import { audit } from "../../../../lib/audit";
import { failure, safeNext, setAccountCookie } from "../../../../lib/auth-http";
import { clientIp, hit, tooMany } from "../../../../lib/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";
import { normalizeEmail } from "../../../../lib/users";

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const parsed = z.object({ email: z.string().trim().max(254), password: z.string().max(200), remember: z.boolean().default(false), next: z.string().max(2000).optional() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "이메일과 비밀번호를 입력해주세요." }, { status: 400 });
  const byIp = hit("passwordIp", clientIp(request));
  const byEmail = hit("passwordEmail", normalizeEmail(parsed.data.email));
  if (!byIp.ok || !byEmail.ok) return tooMany(Math.max(byIp.retryAfterSec, byEmail.retryAfterSec), "로그인 시도가 너무 많아요. 15분 뒤 다시 해주세요.");
  try {
    const { user, secret, maxAgeMs } = await logIn(parsed.data.email, parsed.data.password, parsed.data.remember);
    await audit("login", { userId: user.id, note: "password" });
    return setAccountCookie(NextResponse.json({ next: safeNext(parsed.data.next) }, { headers: { "cache-control": "no-store" } }), secret, maxAgeMs);
  } catch (error) {
    if (error instanceof AccountError && error.status === 401) await audit("login_failed");
    return failure(error, "로그인하지 못했어요.");
  }
}
