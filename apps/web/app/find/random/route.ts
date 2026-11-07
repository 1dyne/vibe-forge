import { NextRequest, NextResponse } from "next/server";
import { ownerHashFromRequest } from "../../../lib/find/owner";
import { publicUrl } from "../../../lib/request-security";
import { forgeForOwner, randomForge } from "../../../lib/find/village-store";

// 아무 집이나: 공개된 대장간 하나로 (내 집 빼고). 산사 법당 문 여는 느낌.
export async function GET(request: NextRequest) {
  const hash = ownerHashFromRequest(request);
  const me = hash ? await forgeForOwner(hash) : null;
  const forge = await randomForge(me?.id ?? null);
  return NextResponse.redirect(publicUrl(request, forge ? `/f/${forge.id}` : "/find"), 307);
}
