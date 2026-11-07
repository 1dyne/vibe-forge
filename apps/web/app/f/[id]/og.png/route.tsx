import { NextResponse } from "next/server";
import { fireOg, forgeOg } from "../../../../lib/find/og-render";
import { siteOrigin } from "../../../../lib/find/site";
import { getFire } from "../../../../lib/find/store";
import { alleyName } from "../../../../lib/find/village";
import { forgeFires, getForge } from "../../../../lib/find/village-store";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const host = new URL(await siteOrigin()).host;
  const forge = await getForge(id);
  if (forge) {
    if (forge.visibility === "private") return NextResponse.json({ error: "not found" }, { status: 404 });
    const fires = await forgeFires(forge.id);
    return forgeOg({ nickname: forge.nickname, alley: alleyName(forge.theme, forge.alleySeq), plotNo: forge.plotNo, fires: fires.length, color: fires[0]?.color ?? "#4FB3A6", reactKind: fires[0]?.reactKind ?? "none" }, host);
  }
  const fire = await getFire(id);
  if (!fire) return NextResponse.json({ error: "not found" }, { status: 404 });
  return fireOg(fire, host);
}
