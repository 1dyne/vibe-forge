import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { signUpWithEmail } from "../../../../lib/account-service";
import { failure, origin } from "../../../../lib/auth-http";
import { signupMode } from "../../../../lib/policies";
import { clientIp, hit, tooMany } from "../../../../lib/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";

const Signup = z.object({
  name: z.string().trim().min(1).max(30),
  email: z.string().trim().max(254),
  password: z.string().max(200),
  inviteCode: z.string().trim().max(40).optional(),
  agreeTerms: z.literal(true), agreePrivacy: z.literal(true), age14: z.literal(true)
}).strict();

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const mode = signupMode();
  if (mode === "closed") return NextResponse.json({ error: "지금은 가입을 받지 않아요." }, { status: 403 });
  const limited = hit("signup", clientIp(request));
  if (!limited.ok) return tooMany(limited.retryAfterSec);
  const parsed = Signup.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "별명, 이메일, 비밀번호를 채우고 만 14세 이상 확인과 약관·개인정보 동의에 체크해주세요." }, { status: 400 });
  if (mode === "invite" && !parsed.data.inviteCode) return NextResponse.json({ error: "초대 코드를 입력해주세요." }, { status: 400 });
  try {
    const { name, email, password, inviteCode } = parsed.data;
    const { user, recoveryCode } = await signUpWithEmail({ name: name!, email: email!, password: password!, inviteCode: mode === "invite" ? inviteCode : undefined, origin: origin(request) });
    return NextResponse.json({ name: user.name, email: user.email, recoveryCode }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error, "가입하지 못했어요. 잠시 후 다시 시도해주세요.");
  }
}
