"use client";
import { useState } from "react";
import type { FireCard } from "../../lib/find/card";
import type { ReactKind } from "../../lib/find/chips";
import Dokkaebi from "./dokkaebi";
import FireCardView, { Roast } from "./fire-card";
import { MailSheet } from "./mailbox";
import { track } from "./track";
import ForgeSignup from "./waitlist";

export type ForgeFire = { id: string; name: string; color: string; reactKind: string; peak: number; sentence: string; card: FireCard | null };
type Props = {
  forge: { id: string; nickname: string; alley: string; plotNo: number; visibility: "public" | "link" | "private"; theme: string };
  fires: ForgeFire[];
  isOwner: boolean;
  couponText: string | null;
};
type Obj = "hearth" | "blueprint" | "shelf" | "invention" | "mailbox";

// 골목 테마별 방 색 (다인의 방 그림이 오기 전 임시)
const ROOM_TINT: Record<string, [string, string, string]> = {
  cat: ["#FBE3EA", "#F6D3DE", "#F1C2D0"], dog: ["#FCE8D6", "#F7DCC3", "#F0CDAE"], water: ["#E2F0FA", "#D3E7F6", "#C2DCF0"],
  sleep: ["#E5E4F4", "#D8D6EE", "#C9C6E6"], plant: ["#E3F2E3", "#D4EAD3", "#C3E0C2"], desk: ["#F4EEE2", "#ECE3D2", "#E2D6BF"],
  door: ["#EFE6DD", "#E6D9CC", "#DACBBB"], kitchen: ["#FBF3D9", "#F6EAC4", "#EFDEAB"]
};
const VIS_LABEL = { public: "전체 공개", link: "링크로만", private: "비공개" } as const;

export default function ForgeView({ forge, fires, isOwner, couponText }: Props) {
  const [open, setOpen] = useState<Obj | null>(null);
  const [visibility, setVis] = useState(forge.visibility);
  const [copied, setCopied] = useState(false);
  const latest = fires[0] ?? null;
  const kind = (latest?.reactKind ?? "none") as ReactKind;
  const [wall, wall2, floor] = ROOM_TINT[forge.theme] ?? ROOM_TINT.desk;
  const roles = (latest?.card?.build.parts ?? []).map((p) => (typeof p === "string" ? p : p.role));

  function show(o: Obj) { setOpen(o); track("object_open", { object: o }); }
  async function share() {
    const url = `${window.location.origin}/f/${forge.id}`;
    const text = `${forge.nickname}의 대장간에 놀러 와. ${forge.alley} ${forge.plotNo}번 터야.`;
    try {
      if (navigator.share) await navigator.share({ title: `${forge.nickname}의 대장간`, text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); setCopied(true); setTimeout(() => setCopied(false), 1600); }
      track("forge_shared");
    } catch { /* 공유 창 닫음 */ }
  }
  async function changeVisibility(v: typeof visibility) {
    setVis(v);
    await fetch("/api/find/forge", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ visibility: v }) }).catch(() => undefined);
    track("visibility_set", { visibility: v });
  }

  return (
    <section className="screen forge-screen" style={{ ["--fire" as string]: latest?.color ?? "#4FB3A6" }}>
      <div className="forge-head">
        <div className="tiny muted">{forge.alley} · {forge.plotNo}번 터</div>
        <h1 style={{ fontSize: 27 }}>{forge.nickname}의 대장간</h1>
        <div className="muted small">도깨비불 {fires.length}개가 머무는 중</div>
      </div>

      <div className="room" style={{ ["--wall" as string]: wall, ["--wall2" as string]: wall2, ["--floor" as string]: floor }}>
        <svg className="room-bg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <polygon points="4,64 4,24 50,4 50,44" fill="var(--wall)" stroke="#232323" strokeWidth=".6" />
          <polygon points="50,44 50,4 96,24 96,64" fill="var(--wall2)" stroke="#232323" strokeWidth=".6" />
          <polygon points="50,44 96,64 50,92 4,64" fill="var(--floor)" stroke="#232323" strokeWidth=".6" />
        </svg>
        <button type="button" className="obj obj-blueprint" onClick={() => show("blueprint")} aria-label="설계도 보기">
          <span className="bp-paper">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i === 0 ? "on" : ""} />)}</span>
          <em>설계도</em>
        </button>
        <button type="button" className="obj obj-shelf" onClick={() => show("shelf")} aria-label="도깨비불 선반 보기">
          <span className="shelf-board">{fires.slice(0, 8).map((f) => <i key={f.id} style={{ background: f.color }} />)}{fires.length > 8 && <b>+{fires.length - 8}</b>}</span>
          <em>도깨비불 선반</em>
        </button>
        <button type="button" className="obj obj-hearth" onClick={() => show("hearth")} aria-label="화로의 도깨비불 보기">
          {latest ? <Dokkaebi motion="blaze" fire={latest.peak} width={104} kind={kind} /> : <Dokkaebi motion="idle" fire={20} width={90} />}
          <em>화로</em>
        </button>
        <button type="button" className="obj obj-invention" onClick={() => show("invention")} aria-label="발명품 보기">
          <span className="inv-stack">{roles.slice(1, 4).map((r) => <span key={r}>{r}</span>)}{roles.length === 0 && <span>아직 빈 작업대</span>}</span>
          <em>발명품</em>
        </button>
        <button type="button" className="obj obj-mailbox" onClick={() => show("mailbox")} aria-label="달그락 우체통">
          <span className="mb-box" />
          <em>우체통</em>
        </button>
      </div>
      <p className="tiny muted" style={{ textAlign: "center", margin: 0 }}>물건을 눌러봐. (방 그림은 곧 다인 그림으로 바뀌어)</p>

      {isOwner ? (
        <div className="owner-bar">
          <a className="btn btn-fire" href="/find" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>새 아이디어로 불 피우기</a>
          <div className="two">
            <button className="btn btn-ghost" type="button" onClick={share}>{copied ? "링크 복사했어!" : "대장간 자랑하기"}</button>
            <label className="vis">
              <span className="sr-only">공개 범위</span>
              <select value={visibility} onChange={(e) => changeVisibility(e.target.value as typeof visibility)}>
                {(Object.keys(VIS_LABEL) as Array<keyof typeof VIS_LABEL>).map((v) => <option key={v} value={v}>{VIS_LABEL[v]}</option>)}
              </select>
            </label>
          </div>
          <p className="fine-left">처음 쓴 문장은 너만 봐. 놀러 온 사람에게는 도깨비불 이름·속성·장작만 보여.</p>
        </div>
      ) : (
        <div className="blueprint-cta">
          <div className="display">너만의 도깨비불도 찾아볼래?</div>
          <p>만들고 싶은 거나 요즘 귀찮은 거 하나만 말하면, 네 대장간도 이 마을에 생겨.</p>
          <a className="btn btn-fire" href="/find" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }} onClick={() => track("visitor_onboard_start")}>내 도깨비불 찾기</a>
        </div>
      )}

      {open === "mailbox" && <MailSheet screen={`forge:${forge.id}`} onClose={() => setOpen(null)} />}
      {open && open !== "mailbox" && (
        <div className="overlay" role="dialog" aria-label="대장간 물건" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="sheet tall">
            {open === "hearth" && (latest?.card ? (
              <>
                <FireCardView name={latest.name} owner={forge.nickname} peak={latest.peak} kind={kind} card={latest.card} />
                <Roast head={latest.card.roast.head} body={latest.card.roast.body} kind={kind} />
              </>
            ) : <p className="body">아직 화로가 비어 있어.</p>)}
            {open === "blueprint" && (
              <>
                {latest && <div className="note"><div className="tiny muted">도깨비가 받아 적은 설계 한 줄</div><div className="sentence">{latest.sentence}</div></div>}
                {isOwner ? <ForgeSignup fire={latest ? { id: latest.id, name: latest.name } : null} refCode={null} couponText={couponText} /> : (
                  <p className="body">설계도의 나머지 칸(부품·회로·하우징·조립)은 대장간이 문을 열면 켜져.</p>
                )}
              </>
            )}
            {open === "invention" && (
              <>
                <div className="display" style={{ fontSize: 20 }}>{latest?.name ?? "발명품"}</div>
                {(latest?.card?.build.parts ?? []).map((p) => typeof p === "string" ? <div key={p} className="prole plain">{p}</div> : (
                  <div key={p.key} className="prole plain"><b>{p.role}</b> — {p.does}</div>
                ))}
                {!latest && <p className="body">아직 작업대가 비어 있어.</p>}
              </>
            )}
            {open === "shelf" && (
              <>
                <div className="display" style={{ fontSize: 20 }}>도깨비불 선반</div>
                {fires.map((f) => (
                  <a key={f.id} className="shelf-row" href={`/f/${f.id}`}>
                    <i style={{ background: f.color }} /><span>{f.name}</span><small>{f.card?.grade ?? ""} · 화력 {f.peak}</small>
                  </a>
                ))}
              </>
            )}
            <button className="link" type="button" onClick={() => setOpen(null)}>닫기</button>
          </div>
        </div>
      )}
    </section>
  );
}
