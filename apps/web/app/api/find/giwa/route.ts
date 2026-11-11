import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { carveGiwa, giwaProblem, listGiwa, myGiwa } from "../../../../lib/find/giwa";
import { ownerHashFromRequest } from "../../../../lib/find/owner";
import { allow, clientKey } from "../../../../lib/find/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";
import { forgeForOwner } from "../../../../lib/find/village-store";

async function owner(request: NextRequest) { const h = ownerHashFromRequest(request); return h ? forgeForOwner(h) : null; }

export async function GET(request: NextRequest) {
  const forge = await owner(request);
  const [all, mine] = await Promise.all([listGiwa(), forge ? myGiwa(forge.id) : Promise.resolve(null)]);
  return NextResponse.json({ ...all, mine, canCarve: Boolean(forge) && !mine }, { headers: { "cache-control": "no-store" } });
}

const Carve = z.object({ wish: z.string().max(60) }).strict();
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("find-giwa", clientKey(request), 10)) return NextResponse.json({ error: "잠깐 쉬었다 해줘." }, { status: 429 });
  const forge = await owner(request);
  if (!forge) return NextResponse.json({ error: "내 대장간이 있어야 기와를 새길 수 있어." }, { status: 403 });
  const parsed = Carve.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const wish = parsed.data.wish!.trim();
  const problem = giwaProblem(wish);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (!(await carveGiwa(forge.id, wish))) return NextResponse.json({ error: "기와는 대장간마다 한 장만 새길 수 있어." }, { status: 409 });
  return NextResponse.json({ ok: true, giwa: { nickname: forge.nickname, wish } }, { status: 201 });
}
