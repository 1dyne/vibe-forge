import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ownerHashFromRequest } from "../../../../lib/find/owner";
import { hasValidOrigin } from "../../../../lib/request-security";
import { forgeForOwner, setVisibility } from "../../../../lib/find/village-store";

const Body = z.object({ visibility: z.enum(["public", "link", "private"]) }).strict();

/** 내 대장간 공개 범위: 전체 공개 / 링크로만 / 비공개 (주인만) */
export async function PATCH(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const hash = ownerHashFromRequest(request);
  const forge = hash ? await forgeForOwner(hash) : null;
  if (!forge) return NextResponse.json({ error: "이 기기에서 만든 대장간이 아니야." }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  await setVisibility(forge.id, parsed.data.visibility!);
  return NextResponse.json({ ok: true, visibility: parsed.data.visibility });
}
