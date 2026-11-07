import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ownerHashFromRequest } from "../../../../lib/find/owner";
import { allow, clientKey } from "../../../../lib/find/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";
import { forgeForOwner, getForge, giveFuel, giveWant, leaveNote, PHRASES, setNeighbor, socialState } from "../../../../lib/find/village-store";

// 남의 대장간에서 할 수 있는 것. 행동은 내 도깨비불(대장간)이 있어야 가능하다.
const Body = z.object({
  host: z.string().regex(/^[A-Za-z0-9]{4,16}$/),
  action: z.enum(["fuel", "want", "note", "neighbor"]),
  phrase: z.enum(PHRASES).optional(),
  on: z.boolean().optional()
}).strict();

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("find-visit", clientKey(request), 40)) return NextResponse.json({ error: "잠깐 쉬었다 해줘." }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const hash = ownerHashFromRequest(request);
  const me = hash ? await forgeForOwner(hash) : null;
  if (!me) return NextResponse.json({ error: "need_forge", message: "너만의 도깨비불부터 찾아야 놀러 가서 장작을 넣을 수 있어." }, { status: 403 });
  const host = await getForge(parsed.data.host!);
  if (!host || (host.visibility === "private")) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (host.id === me.id) return NextResponse.json({ error: "내 대장간엔 못 넣어." }, { status: 400 });
  const { action } = parsed.data;
  let changed = false;
  if (action === "fuel") changed = await giveFuel(me.id, host.id);
  if (action === "want") changed = await giveWant(me.id, host.id);
  if (action === "note") changed = parsed.data.phrase ? await leaveNote(me.id, host.id, parsed.data.phrase) : false;
  if (action === "neighbor") { await setNeighbor(me.id, host.id, parsed.data.on !== false); changed = true; }
  return NextResponse.json({ changed, state: await socialState(host.id, me.id) });
}
