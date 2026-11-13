import type { Metadata } from "next";
import { COUPON_TEXT, siteOrigin } from "../../../lib/find/site";
import { REACT_HUE, type ReactKind } from "../../../lib/find/chips";
import { villageGate } from "../../../lib/find/village-gate";
import { forgeFires, touchForge } from "../../../lib/find/village-store";
import { forgeLanterns, lanternAllowance, publicLanternGroups } from "../../../lib/find/lantern";
import "../fonts";
import "./wish.css";
import VillageGate from "../village/gate";
import WishView from "./wish-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const origin = await siteOrigin();
  return { title: "소원 선착장 · 달그락 대장간", description: "밤 호수 위 소원 줄마다 걸린 한지 초롱. 같은 소원을 빈 도깨비들의 등불을 응원하고, 만들어보고, 내 등불도 걸어봐.", metadataBase: new URL(origin), openGraph: { title: "소원 선착장", images: [{ url: `${origin}/find/og.png?v=1`, width: 1200, height: 600 }] } };
}

// 소원 선착장: 마을 호숫가의 나무 선착장. 마을 문이 열린 사람만 들어온다 (문 앞 화면은 /find/village 와 같다).
export default async function Wish() {
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
  await touchForge(me.id).catch(() => undefined);
  const [fires, groups, mine] = await Promise.all([forgeFires(me.id), publicLanternGroups(me.id), forgeLanterns(me.id)]);
  // 마을과 같은 내 달그락 색 (가장 최근 도깨비불의 반응 색)
  const myKind = fires[0]?.reactKind as ReactKind | undefined;
  const myHue = myKind ? REACT_HUE[myKind] ?? 0 : 0;
  return (
    <main className="find world-page">
      <WishView groups={groups} hue={myHue} mine={{ lanterns: mine, allowance: lanternAllowance(fires.length), fires: fires.map((f) => ({ id: f.id, name: f.name })) }} />
    </main>
  );
}
