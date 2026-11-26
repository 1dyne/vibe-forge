import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { makeSeed } from "../../../../lib/find/seed";
import { ownerHashFromRequest } from "../../../../lib/find/owner";
import { getFire } from "../../../../lib/find/store";
import { forgeForOwner } from "../../../../lib/find/village-store";
import { allow, clientKey } from "../../../../lib/find/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";

export const dynamic = "force-dynamic";
const Body = z.object({ idea: z.string().trim().min(2).max(300), kind: z.enum(["hardware", "software", "twin", "design"]), fireId: z.string().regex(/^[A-Za-z0-9]{4,16}$/).nullish() }).strict();

// 온보딩의 아이디어를 가입 뒤 대장간으로 들고 갈 쪽지를 만든다.
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("find-seed", clientKey(request), 30)) return NextResponse.json({ error: "잠깐 쉬었다 다시 해줘." }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "아이디어를 다시 적어줘." }, { status: 400 });
  const fire = parsed.data.fireId ? await getFire(parsed.data.fireId) : null;
  const owner = ownerHashFromRequest(request);
  const forge = owner ? await forgeForOwner(owner) : null;
  // 남의 도깨비불 번호를 넣어도 그 불의 내용은 실리지 않는다(내 대장간의 불일 때만).
  const mine = fire && forge && fire.forgeId === forge.id ? fire : null;
  return NextResponse.json({ seed: makeSeed({ idea: parsed.data.idea as string, kind: parsed.data.kind as never, sentence: mine?.sentence ?? "", fireId: mine?.id ?? null, fireName: mine?.name ?? null, forgeId: forge?.id ?? null }) });
}
