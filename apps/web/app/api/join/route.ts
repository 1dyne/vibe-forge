import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "../../../lib/audit";
import { PRIVACY_VERSION, TERMS_VERSION, signupMode } from "../../../lib/policies";
import { clientIp, hit, tooMany } from "../../../lib/rate-limit";
import { hasValidOrigin } from "../../../lib/request-security";
import { dashboardLink, mcpResource } from "../../../lib/links";
import { userSessionValue } from "../../../lib/session";
import { SignupError, createUser } from "../../../lib/users";

const Join = z.object({
  name: z.string().trim().min(1).max(30),
  inviteCode: z.string().trim().max(40).optional(),
  agreeTerms: z.literal(true),
  agreePrivacy: z.literal(true),
  age14: z.literal(true)
}).strict();

// Self sign-up. SIGNUP_MODE=closed (default) keeps the operator-invite flow
// only; invite asks for a code from /admin; open lets anyone join.
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const mode = signupMode();
  if (mode === "closed") return NextResponse.json({ error: "지금은 가입을 받지 않아요. 운영자에게 초대 링크를 받아주세요." }, { status: 403 });
  const limited = hit("signup", clientIp(request));
  if (!limited.ok) return tooMany(limited.retryAfterSec);
  const parsed = Join.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "별명을 1~30자로 쓰고, 만 14세 이상 확인과 약관·개인정보 동의에 모두 체크해주세요." }, { status: 400 });
  if (mode === "invite" && !parsed.data.inviteCode) return NextResponse.json({ error: "초대 코드를 입력해주세요." }, { status: 400 });
  try {
    const { user, token } = await createUser(parsed.data.name, false, {
      source: "signup",
      inviteCode: mode === "invite" ? parsed.data.inviteCode : undefined,
      consent: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, ageConfirmed: true, agreedAt: new Date().toISOString() }
    });
    await audit("user_signed_up", { userId: user.id, note: mode });
    const response = NextResponse.json({
      name: user.name,
      connectorUrl: mcpResource(request),
      dashboardUrl: dashboardLink(request, token)
    }, { status: 201, headers: { "cache-control": "no-store" } });
    response.cookies.set("dalgeurak_session", userSessionValue(token), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return response;
  } catch (error) {
    if (error instanceof SignupError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("signup failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "가입하지 못했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
