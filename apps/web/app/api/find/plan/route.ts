import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ownerHashFromRequest } from "../../../../lib/find/owner";
import { allow, clientKey } from "../../../../lib/find/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";
import { forgeForOwner, listPlans, setPlanVote, voteBudget } from "../../../../lib/find/village-store";

// 공사 계획판: 다음에 지을 것에 내 장작으로 투표 (후보당 최대 N개)
const Body = z.object({ planId: z.number().int().positive(), fuel: z.number().int().min(0).max(10) }).strict();

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("find-plan", clientKey(request), 30)) return NextResponse.json({ error: "잠깐 쉬었다 해줘." }, { status: 429 });
  const hash = ownerHashFromRequest(request);
  const me = hash ? await forgeForOwner(hash) : null;
  if (!me) return NextResponse.json({ error: "need_forge", message: "내 대장간이 있어야 장작으로 투표할 수 있어." }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const result = await setPlanVote(parsed.data.planId!, me.id, parsed.data.fuel!);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ plans: await listPlans(me.id), budget: await voteBudget(me.id) });
}
