import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { allow, clientKey } from "../../../../lib/onboarding/rate-limit";
import { BUDGET, EXPERIENCE, joinWaitlist, WANT_FIRST } from "../../../../lib/onboarding/waitlist-store";
import { hasValidOrigin } from "../../../../lib/request-security";

const Body = z.object({
  email: z.string().trim().email().max(254),
  experience: z.enum(EXPERIENCE).nullable(),
  wantFirst: z.array(z.enum(WANT_FIRST)).max(WANT_FIRST.length),
  budget: z.enum(BUDGET).nullable(),
  shareIdea: z.boolean(),
  idea: z.string().trim().max(500).nullable(),
  ideaKind: z.enum(["hardware", "software", "unclear"]).nullable(),
  topMatch: z.object({ repo: z.string().max(120), matchPercent: z.number().int().min(0).max(100) }).strict().nullable(),
  privacyConsent: z.literal(true),
  marketingConsent: z.boolean(),
  ref: z.string().regex(/^[A-Z0-9]{6}$/).nullable(),
  // 사람에게는 보이지 않는 칸. 채워져 있으면 봇으로 본다.
  website: z.string().max(0).optional()
}).strict();

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("waitlist", clientKey(request), 5)) return NextResponse.json({ error: "잠시 후 다시 시도해주세요." }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((i) => i.path[0] === "privacyConsent");
    return NextResponse.json({ error: consentMissing ? "개인정보 수집·이용에 동의해야 알림을 보낼 수 있어요." : "이메일 주소를 확인해주세요." }, { status: 400 });
  }
  const d = parsed.data;
  try {
    const standing = await joinWaitlist({
      email: d.email!, experience: d.experience ?? null, wantFirst: [...new Set(d.wantFirst ?? [])], budget: d.budget ?? null,
      shareIdea: d.shareIdea === true, idea: d.idea ?? null, ideaKind: d.ideaKind ?? null,
      topMatch: d.topMatch ? { repo: d.topMatch.repo!, matchPercent: d.topMatch.matchPercent! } : null,
      marketingConsent: d.marketingConsent === true, ref: d.ref ?? null
    });
    return NextResponse.json({ standing }, { status: standing.alreadyJoined ? 200 : 201 });
  } catch (error) {
    console.error("waitlist join failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "지금은 신청을 받지 못했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
