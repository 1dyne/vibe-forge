import { NextRequest, NextResponse } from "next/server";
import { ownerHashFromRequest } from "../../../lib/find/owner";
import { publicUrl } from "../../../lib/request-security";
import { forgeForOwner } from "../../../lib/find/village-store";

// 내 집: 이 기기의 대장간으로. 아직 없으면 도깨비불 찾기부터.
export async function GET(request: NextRequest) {
  const hash = ownerHashFromRequest(request);
  const forge = hash ? await forgeForOwner(hash) : null;
  return NextResponse.redirect(publicUrl(request, forge ? `/f/${forge.id}` : "/find"), 307);
}
