import type { Metadata } from "next";
import { cookies } from "next/headers";
import { OWNER_COOKIE, ownerTokenFrom } from "../../../lib/find/owner";
import { COUPON_TEXT, siteOrigin } from "../../../lib/find/site";
import { ALLEY_CAPACITY, ALLEY_THEMES, HALL_GOAL, STREETS, alleyName, hallProgress } from "../../../lib/find/village";
import { forgeFires, forgeForOwner, hashToken, latestNotices, listPlans, villageOverview, voteBudget } from "../../../lib/find/village-store";
import Mailbox from "../mailbox";
import "../fonts";
import VillageMap from "./village-map";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const origin = await siteOrigin();
  return { title: "손바닥 마을 · 달그락 대장간", description: "도깨비불들이 모여 사는 손바닥 마을. 큰길마다 관심사 골목이 있어.", metadataBase: new URL(origin), openGraph: { title: "손바닥 마을", description: "너만의 도깨비불을 찾고, 비슷한 아이디어 골목에 대장간을 지어봐.", images: [{ url: `${origin}/find/og.png?v=1`, width: 1200, height: 600 }] } };
}

// 마을 지도 (줌 1단계): 큰길 5개 + 광장 본관 + 마을 장작 게이지
export default async function Village() {
  const token = ownerTokenFrom((await cookies()).get(OWNER_COOKIE)?.value);
  const me = token ? await forgeForOwner(hashToken(token)) : null;
  const [overview, notices, plans, budget, myFires] = await Promise.all([
    villageOverview(), latestNotices(3), listPlans(me?.id ?? null), me ? voteBudget(me.id) : Promise.resolve(null), me ? forgeFires(me.id) : Promise.resolve([])
  ]);
  const streets = STREETS.map((s) => {
    const alleys = s.themes.flatMap((theme) => {
      const existing = overview.alleys.filter((a) => a.theme === theme);
      const list = existing.length ? existing : [{ theme, seq: 1, residents: 0 }];
      return list.map((a) => ({ theme, themeName: ALLEY_THEMES.find((t) => t.id === theme)!.name, seq: a.seq, name: alleyName(theme, a.seq), residents: a.residents }));
    });
    return { id: s.id, name: s.name, finger: s.finger, topics: s.topics, alleys };
  });
  const hall = { ...hallProgress(overview.totalFuel), totalFuel: overview.totalFuel, goal: HALL_GOAL };
  return (
    <main className="find">
      <header className="top"><a className="brand" href="/find">달그락 대장간</a><div className="step">마을 지도</div></header>
      <VillageMap streets={streets} capacity={ALLEY_CAPACITY} hall={hall} floating={overview.floating} totalForges={overview.totalForges} topWant={overview.topWant}
        notices={notices.map((n) => ({ id: n.id, title: n.title, body: n.body, publishedAt: n.publishedAt }))} plans={plans} budget={budget}
        me={me ? { forgeId: me.id, fire: myFires[0] ? { id: myFires[0].id, name: myFires[0].name } : null } : null} couponText={COUPON_TEXT} />
      <Mailbox screen="village" />
    </main>
  );
}
