import { cookies } from "next/headers";
import { OWNER_COOKIE, ownerTokenFrom } from "../../../lib/find/owner";
import { dexOf, forgeForOwner, hashToken } from "../../../lib/find/village-store";
import Dokkaebi from "../dokkaebi";
import "../fonts";

export const dynamic = "force-dynamic";
export const metadata = { title: "도깨비 도감 · 달그락 대장간", robots: { index: false } };

const ATTRS = [["light", "빛 속성"], ["sound", "소리 속성"], ["move", "움직임 속성"], ["none", "고요 속성"]] as const;
const GRADE_ORDER: Record<string, number> = { 전설: 0, 희귀: 1, 흔함: 2 };

// 남의 집에 들를 때마다 그 집 도깨비불이 한 칸씩 채워지는 도감. 속성별·희귀도순으로 정리.
export default async function Dex() {
  const token = ownerTokenFrom((await cookies()).get(OWNER_COOKIE)?.value);
  const me = token ? await forgeForOwner(hashToken(token)) : null;
  const fires = me ? await dexOf(me.id) : [];
  return (
    <main className="find">
      <header className="top"><a className="brand" href="/find">달그락 대장간</a><div className="step">도감</div></header>
      <section className="screen">
        <h1 style={{ fontSize: 26 }}>도깨비 도감 <span className="muted" style={{ fontSize: 18 }}>{fires.length}칸</span></h1>
        {!me ? <div className="dex-empty">내 대장간이 생기면 도감이 열려. <a href="/find">도깨비불 찾기</a></div>
          : fires.length === 0 ? <div className="dex-empty">다른 사람의 대장간에 들르면 그 사람의 도깨비불이 여기 한 칸씩 채워져. <a href="/find/random">아무 집이나 가보기</a></div>
          : ATTRS.map(([kind, label]) => {
            const list = fires.filter((f) => f.reactKind === kind).sort((a, b) => (GRADE_ORDER[a.card?.grade ?? "흔함"] ?? 3) - (GRADE_ORDER[b.card?.grade ?? "흔함"] ?? 3));
            if (!list.length) return null;
            return (
              <div key={kind} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="display" style={{ fontSize: 18 }}>{label} <span className="muted small">{list.length}</span></div>
                <div className="dex-grid">
                  {list.map((f) => (
                    <a key={f.id} className="dex-card" href={`/f/${f.id}`} style={{ borderColor: f.color }}>
                      <Dokkaebi motion="idle" fire={f.peak} width={70} kind={f.reactKind as never} />
                      <b>{f.name}</b>
                      <small>{f.card?.grade ?? "흔함"} · {f.nickname}</small>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        <nav className="town-tabs" aria-label="마을 길"><a href="/find/home">내 대장간</a><a href="/find/neighbors">이웃</a><a href="/find/dex">도감</a><a href="/find/random">아무 대장간이나</a></nav>
      </section>
    </main>
  );
}
