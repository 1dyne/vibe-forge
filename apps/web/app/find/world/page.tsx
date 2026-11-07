import type { Metadata } from "next";
import { cookies } from "next/headers";
import { OWNER_COOKIE, ownerTokenFrom } from "../../../lib/find/owner";
import { siteOrigin } from "../../../lib/find/site";
import { ALLEY_THEMES, VILLAGES, hallProgress } from "../../../lib/find/village";
import { forgeForOwner, hashToken, touchForge, worldHouses } from "../../../lib/find/village-store";
import "../fonts";
import WorldView from "./world-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const origin = await siteOrigin();
  return { title: "도깨비 마을 걷기 · 달그락 대장간", description: "다섯 마을을 직접 걸어 다니며 이웃 대장간에 들어가 봐.", metadataBase: new URL(origin), openGraph: { title: "도깨비 마을 걷기", images: [{ url: `${origin}/find/og.png?v=1`, width: 1200, height: 600 }] } };
}

// 걷는 도깨비 마을 (3D 프로토타입). 2D 지도(/find/village)는 3D가 안 되는 기기용으로 남긴다.
export default async function World() {
  const token = ownerTokenFrom((await cookies()).get(OWNER_COOKIE)?.value);
  const [me, world] = await Promise.all([token ? forgeForOwner(hashToken(token)) : Promise.resolve(null), worldHouses()]);
  if (me) await touchForge(me.id).catch(() => undefined);
  const hall = hallProgress(world.totalFuel);
  const alleyNames = Object.fromEntries(ALLEY_THEMES.map((t) => [t.id, `${t.name} 골목`]));
  return (
    <main className="find world-page">
      <WorldView houses={world.houses} villages={VILLAGES.map((v) => ({ id: v.id, name: v.name, topics: v.topics, mood: v.mood, themes: v.themes }))} alleyNames={alleyNames} hallStage={hall.stage} hallPct={hall.pct} myForgeId={me?.id ?? null} />
    </main>
  );
}
