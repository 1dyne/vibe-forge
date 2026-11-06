import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeFind } from "../../../../lib/find/classify";
import { IdeaSchema } from "../../../../lib/find/api-schema";
import { allow, clientKey } from "../../../../lib/find/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";

const Body = z.object({ idea: IdeaSchema, forceHardware: z.boolean().optional() }).strict();

// 첫 입력 한 번에 판별·안전·장작 트리를 돌려준다(HANDOFF §4). 지금은 규칙 기반이라 비용이 없다.
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("find-analyze", clientKey(request), 30)) return NextResponse.json({ error: "잠깐 쉬었다 다시 해줘." }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "두 글자 이상, 300자 이하로 적어줘." }, { status: 400 });
  return NextResponse.json(analyzeFind(parsed.data.idea, parsed.data.forceHardware));
}
