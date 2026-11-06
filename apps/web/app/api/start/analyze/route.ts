import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeIdea } from "../../../../lib/onboarding/analyze";
import { allow, clientKey } from "../../../../lib/onboarding/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";

const Body = z.object({ idea: z.string().trim().min(3).max(500), kind: z.enum(["hardware", "software"]).optional() }).strict();

// 로그인 없이 쓰는 공개 API. 규칙 기반이라 외부 API 비용이 들지 않는다.
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("analyze", clientKey(request), 20)) return NextResponse.json({ error: "잠시 후 다시 시도해주세요." }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "만들고 싶은 것을 3자 이상 500자 이하로 적어주세요." }, { status: 400 });
  return NextResponse.json({ analysis: analyzeIdea(parsed.data.idea, parsed.data.kind) });
}
