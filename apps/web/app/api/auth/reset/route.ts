import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resetPassword } from "../../../../lib/account-service";
import { failure } from "../../../../lib/auth-http";
import { clientIp, exhausted, hit } from "../../../../lib/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";

const Reset = z.object({ token: z.string().max(100), password: z.string().max(200), recoveryCode: z.string().max(40).optional(), abandon: z.boolean().optional() }).strict();

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const ip = clientIp(request);
  if (exhausted("linkFailure", ip)) return NextResponse.json({ error: "시도가 너무 많아요. 잠시 후 다시 해주세요." }, { status: 429 });
  const parsed = Reset.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "입력값을 확인해주세요." }, { status: 400 });
  try {
    const { token, password, recoveryCode, abandon } = parsed.data;
    const result = await resetPassword({ token: token!, password: password!, recoveryCode, abandon });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    hit("linkFailure", ip);
    return failure(error, "비밀번호를 바꾸지 못했어요.");
  }
}
