import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ownerHashFromRequest } from "../../../../lib/find/owner";
import { hasValidOrigin } from "../../../../lib/request-security";
import { cleanDecor, ROOFS, SIGNS, YARD } from "../../../../lib/find/decor";
import { forgeForOwner, setDecor, setVisibility, socialState } from "../../../../lib/find/village-store";

const Body = z.object({
  visibility: z.enum(["public", "link", "private"]).optional(),
  decor: z.object({
    roof: z.enum(ROOFS.map((r) => r.id) as [string, ...string[]]).optional(),
    sign: z.enum(SIGNS.map((s) => s.id) as [string, ...string[]]).optional(),
    yard: z.array(z.enum(YARD.map((y) => y.id) as [string, ...string[]])).max(8).optional(),
    hidePresence: z.boolean().optional()
  }).strict().optional()
}).strict();

/** 내 대장간 설정 (주인만): 공개 범위(전체 공개 / 링크로만 / 비공개) · 꾸미기 */
export async function PATCH(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const hash = ownerHashFromRequest(request);
  const forge = hash ? await forgeForOwner(hash) : null;
  if (!forge) return NextResponse.json({ error: "이 기기에서 만든 대장간이 아니야." }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { visibility, decor } = parsed.data;
  if (visibility) await setVisibility(forge.id, visibility);
  if (decor) {
    const social = await socialState(forge.id, forge.id);
    const clean = cleanDecor(decor as Parameters<typeof cleanDecor>[0], { neighbors: social.neighbors, fuel: social.fuelTotal, wants: social.wants, notes: social.notes.length });
    await setDecor(forge.id, clean);
    return NextResponse.json({ ok: true, visibility: visibility ?? forge.visibility, decor: clean });
  }
  return NextResponse.json({ ok: true, visibility });
}
