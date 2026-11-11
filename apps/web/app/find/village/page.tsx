import type { Metadata } from "next";
import { COUPON_TEXT, siteOrigin } from "../../../lib/find/site";
import { VILLAGES, hallProgress } from "../../../lib/find/village";
import { REACT_HUE, type ReactKind } from "../../../lib/find/chips";
import { villageGate } from "../../../lib/find/village-gate";
import { forgeFires, touchForge, worldHouses } from "../../../lib/find/village-store";
import { publicLanternGroups } from "../../../lib/find/lantern";
import "../fonts";
import WorldView from "../world/world-view";
import VillageGate from "./gate";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const origin = await siteOrigin();
  return { title: "도깨비 마을 · 달그락 대장간", description: "도깨비불들이 대장간을 짓고 사는 다섯 마을. 너만의 도깨비불을 찾으면 마을에 네 대장간이 생겨.", metadataBase: new URL(origin), openGraph: { title: "도깨비 마을", images: [{ url: `${origin}/find/og.png?v=1`, width: 1200, height: 600 }] } };
}

// 걷는 도깨비 마을. 내 도깨비불을 찾고 대장간 오픈 알림(이메일)을 남긴 사람에게 문이 열린다.
// 2D 지도(/find/map)는 3D가 안 되는 기기용.
export default async function Village() {
  const gate = await villageGate();
  if (gate.state !== "open") {
    return (
      <main className="find">
        <header className="top"><a className="brand" href="/find">달그락 대장간</a><div className="step">마을 문 앞</div></header>
        <VillageGate state={gate.state} fire={gate.state === "locked" ? gate.fire : null} forgeId={gate.state === "locked" ? gate.forge.id : null} couponText={COUPON_TEXT} />
      </main>
    );
  }
  const me = gate.forge;
  const world = await worldHouses(me?.id ?? null);
  if (me) await touchForge(me.id).catch(() => undefined);
  // 온보딩에서 받은 내 달그락 색 그대로 마을을 걷는다 (가장 최근 도깨비불의 반응 색)
  const myKind = (me ? (await forgeFires(me.id))[0]?.reactKind : undefined) as ReactKind | undefined;
  const myHue = myKind ? REACT_HUE[myKind] ?? 0 : 0;
  const hall = hallProgress(world.totalFuel);
  return (
    <main className="find world-page">
      <WorldView houses={world.houses} villages={VILLAGES.map((v) => ({ id: v.id, name: v.name, topics: v.topics, mood: v.mood, themes: v.themes }))} hallStage={hall.stage} hallPct={hall.pct} myForgeId={me?.id ?? null} myHue={myHue} lanterns={await publicLanternGroups(me.id)} />
    </main>
  );
}
