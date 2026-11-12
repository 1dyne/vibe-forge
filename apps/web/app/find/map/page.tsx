import type { Metadata } from "next";
import { COUPON_TEXT, siteOrigin } from "../../../lib/find/site";
import { HALL_GOAL, hallProgress } from "../../../lib/find/village";
import { villageGate } from "../../../lib/find/village-gate";
import { forgeFires, touchForge, latestNotices, listPlans, villageOverview, voteBudget } from "../../../lib/find/village-store";
import Mailbox from "../mailbox";
import "../fonts";
import VillageGate from "../village/gate";
import VillageMap from "./village-map";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const origin = await siteOrigin();
  return { title: "본관 게시판 · 달그락 대장간", description: "도깨비불들이 대장간을 짓고 사는 다섯 마을.", metadataBase: new URL(origin), openGraph: { title: "달그락 마을", description: "너만의 도깨비불을 찾으면 마을에 네 대장간이 생겨.", images: [{ url: `${origin}/find/og.png?v=1`, width: 1200, height: 600 }] } };
}

// 본관 게시판: 공사 게이지·소식판·기와·공사 계획판. 마을 지도는 3D 마을 안의 지형도(위에서 내려다본 실제 마을)로 본다
export default async function VillageMapPage() {
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
  const [overview, notices, plans, budget, myFires] = await Promise.all([
    villageOverview(), latestNotices(3), listPlans(me?.id ?? null), me ? voteBudget(me.id) : Promise.resolve(null), me ? forgeFires(me.id) : Promise.resolve([])
  ]);
  const hall = { ...hallProgress(overview.totalFuel), totalFuel: overview.totalFuel, goal: HALL_GOAL };
  return (
    <main className="find">
      <header className="top"><a className="brand" href="/find">달그락 대장간</a><div className="step">본관 게시판</div></header>
      <VillageMap hall={hall} floating={overview.floating} totalForges={overview.totalForges} topWant={overview.topWant}
        notices={notices.map((n) => ({ id: n.id, title: n.title, body: n.body, publishedAt: n.publishedAt }))} plans={plans} budget={budget}
        me={me ? { forgeId: me.id, fire: myFires[0] ? { id: myFires[0].id, name: myFires[0].name } : null } : null} couponText={COUPON_TEXT} />
      <Mailbox screen="village" />
    </main>
  );
}
