import { cookies } from "next/headers";
import { OWNER_COOKIE, ownerTokenFrom } from "../../../lib/find/owner";
import { alleyName } from "../../../lib/find/village";
import { forgeForOwner, hashToken, neighborsOf } from "../../../lib/find/village-store";
import "../fonts";

export const dynamic = "force-dynamic";
export const metadata = { title: "내 이웃 · 달그락 대장간", robots: { index: false } };

export default async function Neighbors() {
  const token = ownerTokenFrom((await cookies()).get(OWNER_COOKIE)?.value);
  const me = token ? await forgeForOwner(hashToken(token)) : null;
  const list = me ? await neighborsOf(me.id) : [];
  return (
    <main className="find">
      <header className="top"><a className="brand" href="/find">달그락 대장간</a><div className="step">이웃</div></header>
      <section className="screen">
        <h1 style={{ fontSize: 26 }}>내 이웃</h1>
        {!me ? <div className="dex-empty">내 대장간이 생기면 이웃을 맺을 수 있어. <a href="/find">도깨비불 찾기</a></div>
          : list.length === 0 ? <div className="dex-empty">아직 이웃이 없어. <a href="/find/random">아무 집이나</a> 놀러 가서 “이웃 맺기”를 눌러봐.</div>
          : list.map((f) => (
            <a key={f.id} className="shelf-row" href={`/f/${f.id}`}><i style={{ background: "var(--teal)" }} /><span>{f.nickname}의 대장간</span><small>{alleyName(f.theme)}</small></a>
          ))}
        <p className="fine-left">이웃의 소식(부품을 골랐대, 회로가 완성됐대)은 대장간이 문을 열면 여기로 와.</p>
        <nav className="town-tabs" aria-label="마을 길"><a href="/find/home">내 집</a><a href="/find/neighbors">이웃</a><a href="/find/dex">도감</a><a href="/find/random">아무 집이나</a></nav>
      </section>
    </main>
  );
}
