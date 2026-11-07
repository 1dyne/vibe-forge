import type { Metadata } from "next";
import { cookies } from "next/headers";
import { OWNER_COOKIE, ownerTokenFrom } from "../../../lib/find/owner";
import { siteOrigin } from "../../../lib/find/site";
import { STREETS, hallProgress } from "../../../lib/find/village";
import { forgeForOwner, hashToken, worldHouses } from "../../../lib/find/village-store";
import "../fonts";
import WorldView from "./world-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const origin = await siteOrigin();
  return { title: "손바닥 마을 걷기 · 달그락 대장간", description: "손바닥 마을을 직접 걸어 다니며 이웃 대장간에 들어가 봐.", metadataBase: new URL(origin), openGraph: { title: "손바닥 마을 걷기", images: [{ url: `${origin}/find/og.png?v=1`, width: 1200, height: 600 }] } };
}

// 걷는 마을 (3D 프로토타입). 기존 지도(/find/village)는 그대로 두고 따로 둔다.
export default async function World() {
  const token = ownerTokenFrom((await cookies()).get(OWNER_COOKIE)?.value);
  const [me, world] = await Promise.all([token ? forgeForOwner(hashToken(token)) : Promise.resolve(null), worldHouses()]);
  const hall = hallProgress(world.totalFuel);
  return (
    <main className="find world-page">
      <WorldView houses={world.houses} villages={STREETS.map((s) => ({ id: s.id, name: s.name, themes: s.themes }))} hallStage={hall.stage} hallPct={hall.pct} myForgeId={me?.id ?? null} />
    </main>
  );
}
