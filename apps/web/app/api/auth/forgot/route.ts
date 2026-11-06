import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestReset } from "../../../../lib/account-service";
import { failure, origin } from "../../../../lib/auth-http";
import { clientIp, hit, tooMany } from "../../../../lib/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";
import { normalizeEmail } from "../../../../lib/users";

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const parsed = z.object({ email: z.string().trim().max(254) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "이메일을 확인해주세요." }, { status: 400 });
  const byIp = hit("mailIp", clientIp(request));
  const byEmail = hit("mailEmail", normalizeEmail(parsed.data.email));
  if (!byIp.ok || !byEmail.ok) return tooMany(Math.max(byIp.retryAfterSec, byEmail.retryAfterSec), "메일을 너무 자주 요청했어요. 잠시 후 다시 해주세요.");
  try {
    await requestReset(parsed.data.email, origin(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error, "메일을 보내지 못했어요.");
  }
}
