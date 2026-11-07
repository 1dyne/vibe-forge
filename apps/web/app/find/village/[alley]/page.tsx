import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OWNER_COOKIE, ownerTokenFrom } from "../../../../lib/find/owner";
import { ALLEY_CAPACITY, ALLEY_THEMES, FLAG_WANTS, STREETS, alleyName, chimneyLevel } from "../../../../lib/find/village";
import { alleyHouses, forgeForOwner, hashToken } from "../../../../lib/find/village-store";
import Mailbox from "../../mailbox";
import "../../fonts";
import AlleyMap from "./alley-map";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ alley: string }> };

export async function generateMetadata({ params }: Props) {
  const m = (await params).alley.match(/^([a-z]+)-(\d{1,3})$/);
  const theme = m && ALLEY_THEMES.find((t) => t.id === m[1]);
  return { title: theme ? `${alleyName(theme.id, Number(m![2]))} · 손바닥 마을` : "손바닥 마을" };
}

// 골목 (줌 2단계): 등축 집들이 줄지어 있고, 내 집은 표식, 이웃은 끈으로 이어진다
export default async function Alley({ params }: Props) {
  const m = (await params).alley.match(/^([a-z]+)-(\d{1,3})$/);
  const theme = m ? ALLEY_THEMES.find((t) => t.id === m[1]) : null;
  if (!m || !theme) notFound();
  const seq = Number(m[2]);
  const token = ownerTokenFrom((await cookies()).get(OWNER_COOKIE)?.value);
  const me = token ? await forgeForOwner(hashToken(token)) : null;
  const { houses, strings } = await alleyHouses(theme.id, seq);
  const street = STREETS.find((s) => s.themes.includes(theme.id));
  return (
    <main className="find">
      <header className="top"><a className="brand" href="/find/village">← 마을 지도</a><div className="step">{street?.name ?? ""}</div></header>
      <section className="screen">
        <div className="village-head">
          <h1 style={{ fontSize: 26 }}>{alleyName(theme.id, seq)}</h1>
          <div className="muted small">주민 {houses.length}/{ALLEY_CAPACITY}{ALLEY_CAPACITY - houses.length <= 10 && houses.length < ALLEY_CAPACITY ? ` · 마지막 ${ALLEY_CAPACITY - houses.length}터 남았어` : houses.length >= ALLEY_CAPACITY ? " · 완공!" : ""}</div>
        </div>
        <AlleyMap
          houses={houses.map((h) => ({ ...h, chimney: chimneyLevel(h.peak, h.fuel), lit: h.visits7 > 0, flag: h.wants >= FLAG_WANTS, mine: Boolean(me && h.forgeId === me.id) }))}
          strings={strings} capacity={ALLEY_CAPACITY} myForgeId={me?.id ?? null} />
        <div className="legend small muted">굴뚝 불 = 화력과 받은 장작 · 창문 불 = 이번 주 손님 · 깃발 = 나도 갖고 싶어 {FLAG_WANTS}개 이상</div>
        {houses.length >= ALLEY_CAPACITY && <a className="btn btn-ghost" href={`/find/village/${theme.id}-${seq + 1}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>{alleyName(theme.id, seq + 1)} 가보기</a>}
        <nav className="town-tabs" aria-label="마을 길"><a href="/find/home">내 집</a><a href="/find/neighbors">이웃</a><a href="/find/dex">도감</a><a href="/find/random">아무 집이나</a></nav>
      </section>
      <Mailbox screen={`alley:${theme.id}-${seq}`} />
    </main>
  );
}
