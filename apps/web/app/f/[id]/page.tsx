import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fireLabel } from "../../../lib/find/chips";
import { siteOrigin } from "../../../lib/find/site";
import { getFire } from "../../../lib/find/store";
import Dokkaebi from "../../find/dokkaebi";
import FireCardView, { Roast } from "../../find/fire-card";
import "../../find/fonts";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ref?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const fire = await getFire((await params).id);
  if (!fire) return { title: "내 도깨비불 찾기 · 달그락 대장간" };
  const origin = await siteOrigin();
  const title = `${fire.card ? `[${fire.card.grade}] ` : ""}${fire.name} · 화력 ${fire.peak}`;
  const description = fire.card ? `“${fire.card.roast.head}” — 도깨비 한 줄 평. 너의 도깨비불은?` : "친구가 찾은 도깨비불이야. 너의 도깨비불은? 만들고 싶은 거나 요즘 귀찮은 거 하나만 줘봐.";
  const image = `${origin}/f/${fire.id}/og.png`;
  return {
    title: `${title} · 달그락 대장간`,
    description,
    metadataBase: new URL(origin),
    openGraph: { title, description, url: `${origin}/f/${fire.id}`, siteName: "달그락 대장간", type: "website", locale: "ko_KR", images: [{ url: image, width: 1200, height: 600, alt: fire.name }] },
    twitter: { card: "summary_large_image", title, description, images: [image] }
  };
}

// 공유 링크로 들어온 사람: 친구의 도깨비불(아이디어 원문은 보여주지 않는다) + "나도 찾기"
export default async function SharedFire({ params, searchParams }: Props) {
  const fire = await getFire((await params).id);
  if (!fire) notFound();
  const ref = (await searchParams).ref?.toUpperCase();
  const start = `/find${ref && /^[A-Z0-9]{6}$/.test(ref) ? `?ref=${ref}` : ""}`;
  return (
    <main className="find" style={{ ["--fire" as string]: fire.color }}>
      <header className="top"><a className="brand" href="/find">달그락 대장간</a><div className="step">친구의 도깨비불</div></header>
      <section className="screen">
        <div className="muted small" style={{ textAlign: "center", letterSpacing: 2 }}>친구가 찾은 도깨비불</div>
        {fire.card ? (
          <>
            <FireCardView name={fire.name} peak={fire.peak} kind={fire.reactKind as never} card={fire.card} />
            <Roast head={fire.card.roast.head} body={fire.card.roast.body} kind={fire.reactKind as never} />
          </>
        ) : (
          <div className="shared-card">
            <Dokkaebi motion="blaze" fire={fire.peak} width={170} kind={fire.reactKind as never} />
            <div className="display" style={{ fontSize: 28 }}>{fire.name}</div>
            <div className="muted small">화력 <span className="display ink" style={{ fontSize: 22 }}>{fire.peak}</span> · {fireLabel(fire.peak)}</div>
            <div className="chips shared-chips">{fire.labels.slice(0, 6).map((l) => <span key={l}>{l}</span>)}</div>
          </div>
        )}
        <div className="note"><div className="tiny muted">도깨비가 받아 적은 설계 한 줄</div><div className="sentence">{fire.sentence}</div></div>
        <div className="spacer" />
        <h2 style={{ textAlign: "center" }}>너의 도깨비불은?</h2>
        <a className="btn btn-fire" href={start} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>나도 찾기</a>
      </section>
    </main>
  );
}
