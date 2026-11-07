import { NextRequest, NextResponse } from "next/server";
import { ownerHashFromRequest } from "../../../../lib/find/owner";
import { allow, clientKey } from "../../../../lib/find/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";
import { activeForgeIds, forgeForOwner, touchForge } from "../../../../lib/find/village-store";

/**
 * 마을의 기척. 걷는 마을 화면이 1분 반쯤마다 부른다.
 * 내 대장간이 있으면 '지금 마을에 있음'으로 기록하고, 지금 기척이 있는 집 id들을 돌려준다(누구인지는 보여주지 않고 집에 연기·불빛으로만 쓴다).
 */
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("presence", clientKey(request), 6)) return NextResponse.json({ error: "too many" }, { status: 429 });
  const hash = ownerHashFromRequest(request);
  const forge = hash ? await forgeForOwner(hash) : null;
  if (forge) await touchForge(forge.id);
  return NextResponse.json({ active: await activeForgeIds() }, { headers: { "cache-control": "no-store" } });
}
