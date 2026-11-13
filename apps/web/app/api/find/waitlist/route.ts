import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getFire, joinWaitlist } from "../../../../lib/find/store";
import { allow, clientKey } from "../../../../lib/find/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";
import { setMeta } from "../../../../lib/find/village-store";

const Body = z.object({
  email: z.string().trim().email().max(254),
  fireId: z.string().regex(/^[A-Za-z0-9]{4,16}$/).nullable(),
  privacyConsent: z.literal(true),
  marketingConsent: z.boolean(),
  ref: z.string().regex(/^[A-Z0-9]{6}$/).nullable(),
  website: z.string().max(0).optional() // 봇 함정 칸
}).strict();

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("find-waitlist", clientKey(request), 6)) return NextResponse.json({ error: "잠깐 쉬었다 다시 해줘." }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const consent = parsed.error.issues.some((i) => i.path[0] === "privacyConsent");
    return NextResponse.json({ error: consent ? "개인정보 수집·이용에 동의해야 알려줄 수 있어." : "이메일 주소를 확인해줘." }, { status: 400 });
  }
  const d = parsed.data;
  try {
    const fire = d.fireId ? await getFire(d.fireId) : null;
    const standing = await joinWaitlist({
      email: d.email!, fireId: fire?.id ?? null, idea: fire?.idea ?? null, sentence: fire?.sentence ?? null, picked: fire?.picked ?? [],
      peakFire: fire?.peak ?? null, fireColor: fire?.color ?? null, referredBy: d.ref ?? null, marketingConsent: d.marketingConsent === true
    });
    // 이미 줄 선 메일로 새 대장간(새 기기·다시 시작)에서 남겨도 그 대장간의 마을 문은 열어준다 (줄 순서는 그대로)
    if (standing.alreadyJoined && fire?.forgeId) await setMeta(`village_open:${fire.forgeId}`, "1");
    return NextResponse.json({ standing }, { status: standing.alreadyJoined ? 200 : 201 });
  } catch (error) {
    console.error("find waitlist failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "지금은 신청을 못 받았어. 잠시 후 다시 해줘." }, { status: 500 });
  }
}
