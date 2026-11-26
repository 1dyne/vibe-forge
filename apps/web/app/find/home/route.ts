import { NextRequest, NextResponse } from "next/server";
import { newOwnerToken, ownerHashFromRequest, setOwnerCookie } from "../../../lib/find/owner";
import { publicUrl } from "../../../lib/request-security";
import { addOwnerAlias, forgeForOwner, forgeForUser, hashToken, linkForgeToUser } from "../../../lib/find/village-store";
import { getViewer } from "../../../lib/viewer";

// 내 집으로. 가입한 사람은 계정에 묶인 대장간으로 간다(기기를 바꿔도 같은 대장간).
//  - 이 기기에 대장간이 있고 계정이 있으면: 둘을 묶는다(마을 문도 열린다).
//  - 계정에는 대장간이 있는데 이 기기가 처음이면: 이 기기에 열쇠를 하나 달아 준다.
//  - 어디에도 없으면: 도깨비불 찾기부터.
export async function GET(request: NextRequest) {
  const hash = ownerHashFromRequest(request);
  const here = hash ? await forgeForOwner(hash) : null;
  const viewer = await getViewer(request).catch(() => null);
  const userId = viewer?.kind === "user" ? viewer.user.id : null;
  if (!userId) return NextResponse.redirect(publicUrl(request, here ? `/f/${here.id}` : "/find"), 307);
  const mine = await forgeForUser(userId);
  if (mine) {
    const response = NextResponse.redirect(publicUrl(request, `/f/${mine.id}`), 307);
    if (!here || here.id !== mine.id) { const token = newOwnerToken(); await addOwnerAlias(hashToken(token), mine.id); setOwnerCookie(response, token); }
    return response;
  }
  if (here) { await linkForgeToUser(here.id, userId); return NextResponse.redirect(publicUrl(request, `/f/${here.id}`), 307); }
  return NextResponse.redirect(publicUrl(request, "/find"), 307);
}
