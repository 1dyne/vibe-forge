import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { fireLabel } from "../../../lib/find/chips";
import { OWNER_COOKIE, ownerTokenFrom } from "../../../lib/find/owner";
import { COUPON_TEXT, siteOrigin } from "../../../lib/find/site";
import { getFire } from "../../../lib/find/store";
import { alleyName } from "../../../lib/find/village";
import { forgeFires, getForge, hashToken, type ForgeRecord } from "../../../lib/find/village-store";
import Dokkaebi from "../../find/dokkaebi";
import FireCardView, { Roast } from "../../find/fire-card";
import ForgeView from "../../find/forge-view";
import Mailbox from "../../find/mailbox";
import VillageNews from "../../find/village-news";
import "../../find/fonts";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ref?: string }> };

async function isOwnerOf(forge: ForgeRecord) {
  const token = ownerTokenFrom((await cookies()).get(OWNER_COOKIE)?.value);
  return Boolean(token && hashToken(token) === forge.ownerHash);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = (await params).id;
  const origin = await siteOrigin();
  const forge = await getForge(id);
  if (forge) {
    if (forge.visibility === "private") return { title: "달그락 대장간", robots: { index: false } };
    const title = `${forge.nickname}의 대장간 · ${alleyName(forge.theme, forge.alleySeq)} ${forge.plotNo}번 터`;
    const description = "도깨비 마을에 놀러 와. 너만의 도깨비불도 찾아볼래?";
    const image = `${origin}/f/${forge.id}/og.png`;
    return {
      title: `${title} · 달그락 대장간`, description, metadataBase: new URL(origin),
      robots: forge.visibility === "link" ? { index: false } : undefined,
      openGraph: { title, description, url: `${origin}/f/${forge.id}`, siteName: "달그락 대장간", type: "website", locale: "ko_KR", images: [{ url: image, width: 1200, height: 600, alt: title }] },
      twitter: { card: "summary_large_image", title, description, images: [image] }
    };
  }
  const fire = await getFire(id);
  if (!fire) return { title: "내 도깨비불 찾기 · 달그락 대장간" };
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

// /f/:id 는 대장간(주민의 집) 또는 도깨비불 한 개. 처음 쓴 문장(아이디어 원문)은 어디에도 공개하지 않는다.
export default async function SharedPage({ params, searchParams }: Props) {
  const id = (await params).id;
  const forge = await getForge(id);
  if (forge) {
    const owner = await isOwnerOf(forge);
    if (forge.visibility === "private" && !owner) notFound();
    const fires = (await forgeFires(forge.id)).map((f) => ({ id: f.id, name: f.name, color: f.color, reactKind: f.reactKind, peak: f.peak, sentence: f.sentence, card: f.card }));
    return (
      <main className="find" style={{ ["--fire" as string]: fires[0]?.color ?? "#4FB3A6" }}>
        <header className="top"><a className="brand" href="/find">달그락 대장간</a><div className="step">{owner ? "내 대장간" : "놀러 온 대장간"}</div></header>
        {owner && <div style={{ padding: "0 20px" }}><VillageNews /></div>}
        <ForgeView forge={{ id: forge.id, nickname: forge.nickname, alley: alleyName(forge.theme, forge.alleySeq), plotNo: forge.plotNo, visibility: forge.visibility, theme: forge.theme }} fires={fires} isOwner={owner} couponText={COUPON_TEXT} />
        <Mailbox screen={`forge:${forge.id}`} />
      </main>
    );
  }

  const fire = await getFire(id);
  if (!fire) notFound();
  const ref = (await searchParams).ref?.toUpperCase();
  const start = `/find${ref && /^[A-Z0-9]{6}$/.test(ref) ? `?ref=${ref}` : ""}`;
  const home = fire.forgeId ? await getForge(fire.forgeId) : null;
  return (
    <main className="find" style={{ ["--fire" as string]: fire.color }}>
      <header className="top"><a className="brand" href="/find">달그락 대장간</a><div className="step">친구의 도깨비불</div></header>
      <section className="screen">
        <div className="muted small" style={{ textAlign: "center", letterSpacing: 2 }}>친구가 찾은 도깨비불</div>
        {fire.card ? (
          <>
            <FireCardView name={fire.name} owner={fire.nickname} peak={fire.peak} kind={fire.reactKind as never} card={fire.card} />
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
        {home && home.visibility !== "private" && (
          <a className="btn btn-ghost" href={`/f/${home.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>이 불이 사는 {home.nickname}의 대장간 구경하기</a>
        )}
        <div className="spacer" />
        <h2 style={{ textAlign: "center" }}>너의 도깨비불은?</h2>
        <a className="btn btn-fire" href={start} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>나도 찾기</a>
      </section>
      <Mailbox screen={`fire:${fire.id}`} />
    </main>
  );
}
