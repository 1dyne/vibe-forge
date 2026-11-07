"use client";
import { useMemo, useState } from "react";
import type { FireCard } from "../../lib/find/card";
import type { ReactKind } from "../../lib/find/chips";
import Dokkaebi from "./dokkaebi";
import ForgeRoom, { type RoomObj } from "./forge-room";
import FireCardView, { Roast } from "./fire-card";
import { MailSheet } from "./mailbox";
import { track } from "./track";
import ForgeSignup from "./waitlist";

export type ForgeFire = { id: string; name: string; color: string; reactKind: string; peak: number; sentence: string; card: FireCard | null; stage: 1 | 2 | 3; cats: string[] };
export type Social = { fuelToday: number; fuelTotal: number; wants: number; notes: Array<{ phrase: string; from: string; nickname: string; at: string }>; neighbors: number; visitsWeek: number; mine: { fuelGivenToday: boolean; wanted: boolean; notedToday: boolean; neighbor: boolean } };
type Props = {
  forge: { id: string; nickname: string; alley: string; plotNo: number; visibility: "public" | "link" | "private"; theme: string; village: string };
  fires: ForgeFire[];
  isOwner: boolean;
  couponText: string | null;
  social: Social;
  viewerHasForge: boolean;
  dexAdded: number;
};
const PHRASES = ["나도 갖고 싶어", "이거 천재다", "만들면 알려줘!", "장작 넣고 감", "응원해"];
type Obj = "hearth" | "blueprint" | "shelf" | "invention" | "mailbox";

// 골목 테마별 방 색 (다인의 방 그림이 오기 전 임시)
const ROOM_TINT: Record<string, [string, string, string]> = {
  cat: ["#FBE3EA", "#F6D3DE", "#F1C2D0"], dog: ["#FCE8D6", "#F7DCC3", "#F0CDAE"], water: ["#E2F0FA", "#D3E7F6", "#C2DCF0"],
  sleep: ["#E5E4F4", "#D8D6EE", "#C9C6E6"], plant: ["#E3F2E3", "#D4EAD3", "#C3E0C2"], desk: ["#F4EEE2", "#ECE3D2", "#E2D6BF"],
  door: ["#EFE6DD", "#E6D9CC", "#DACBBB"], kitchen: ["#FBF3D9", "#F6EAC4", "#EFDEAB"]
};
const VIS_LABEL = { public: "전체 공개", link: "링크로만", private: "비공개" } as const;

export default function ForgeView({ forge, fires, isOwner, couponText, social: initialSocial, viewerHasForge, dexAdded }: Props) {
  const [social, setSocial] = useState(initialSocial);
  const [needForge, setNeedForge] = useState(false);
  const [toast, setToast] = useState(dexAdded > 0 ? `도감에 ${forge.nickname}의 도깨비불 ${dexAdded}칸 추가!` : "");
  const [open, setOpen] = useState<Obj | null>(null);
  const [visibility, setVis] = useState(forge.visibility);
  const [copied, setCopied] = useState(false);
  const latest = fires[0] ?? null;
  // 받은 장작만큼 화로의 불이 커진다
  const glow = Math.min(100, (latest?.peak ?? 20) + social.fuelTotal * 2);
  const kind = (latest?.reactKind ?? "none") as ReactKind;
  const [wall, wall2, floor] = ROOM_TINT[forge.theme] ?? ROOM_TINT.desk;
  const roles = (latest?.card?.build.parts ?? []).map((p) => (typeof p === "string" ? p : p.role));

  async function act(action: "fuel" | "want" | "note" | "neighbor", extra: Record<string, unknown> = {}) {
    if (!viewerHasForge) { setNeedForge(true); return; }
    const res = await fetch("/api/find/visit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ host: forge.id, action, ...extra }) });
    const json = await res.json().catch(() => ({}));
    if (res.status === 403 && json.error === "need_forge") { setNeedForge(true); return; }
    if (res.ok) {
      setSocial(json.state);
      track(action === "fuel" ? "fuel_given" : action === "want" ? "want_given" : action === "note" ? "note_left" : "neighbor_added", action === "note" ? { phrase: String(extra.phrase) } : undefined);
      if (action === "fuel" && json.changed) setToast("장작을 넣었어! 불이 조금 커졌어.");
    }
  }

  function show(o: Obj) { setOpen(o); track("object_open", { object: o }); }
  const roomFires = useMemo(() => fires.map((f) => ({ id: f.id, color: f.color, stage: f.stage, cats: f.cats })), [fires]);
  const STAGE_NAME = ["불씨", "타오름", "활활"];
  const topStage = fires.reduce((m, f) => Math.max(m, f.stage), 1);
  const usedCats = [...new Set(fires.flatMap((f) => f.cats))];
  function pickRoom(o: RoomObj) {
    if (o === "woodpile") { setToast(social.fuelTotal ? `이웃들이 넣어준 장작 ${social.fuelTotal}개가 쌓여 있어. 장작이 많을수록 화로 불이 커져.` : "아직 장작더미가 비어 있어. 이웃이 장작을 넣어주면 여기 쌓여."); track("object_open", { object: o }); return; }
    if (o === "tools") { setToast(`공구 걸이: ${usedCats.join("·")} 갈래를 채워봤어. 네 갈래를 다 채우면 공구가 다 걸려.`); track("object_open", { object: o }); return; }
    if (o === "display") { setToast(`'나도 갖고 싶어' ${social.wants}개. 5개가 넘으면 트로피가 올라가.`); track("object_open", { object: o }); return; }
    show(o);
  }
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
        <div className="muted small">도깨비불 {fires.length}개가 머무는 중 · 대장간 {STAGE_NAME[topStage - 1]} 단계</div>
      </div>

      <ForgeRoom village={forge.village} fires={roomFires} peak={latest?.peak ?? 20} fuel={social.fuelTotal} wants={social.wants} notes={social.notes.length} neighbors={social.neighbors} onPick={pickRoom} fallback={
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
          {latest ? <Dokkaebi motion="blaze" fire={glow} width={Math.round(96 + social.fuelTotal * 1.5 > 140 ? 140 : 96 + social.fuelTotal * 1.5)} kind={kind} /> : <Dokkaebi motion="idle" fire={20} width={90} />}
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
      </div>} />
      <p className="tiny muted" style={{ textAlign: "center", margin: 0 }}>물건을 눌러봐 · 옆으로 끌면 방을 둘러볼 수 있어</p>
      {toast && <div className="news" role="status"><span>{toast}</span><button className="link" type="button" onClick={() => setToast("")}>좋아</button></div>}

      <div className="social-stats">
        <div><b>{social.fuelToday}</b><small>오늘 받은 장작</small></div>
        <div><b>{social.wants}</b><small>나도 갖고 싶어</small></div>
        <div><b>{social.neighbors}</b><small>이웃</small></div>
      </div>

      {!isOwner && (
        <div className="visit-panel">
          <div className="two">
            <button className="btn btn-fire" type="button" disabled={social.mine.fuelGivenToday} onClick={() => act("fuel")}>{social.mine.fuelGivenToday ? "오늘 장작 넣었어" : "장작 하나 넣어주기"}</button>
            <button className="btn btn-ghost" type="button" disabled={social.mine.wanted} onClick={() => act("want")}>{social.mine.wanted ? "갖고 싶다고 했어" : "나도 갖고 싶어"}</button>
          </div>
          <div className="phrases">
            {PHRASES.map((p) => <button key={p} type="button" className="chip" disabled={social.mine.notedToday} onClick={() => act("note", { phrase: p })}>{p}</button>)}
          </div>
          <button className="link" type="button" onClick={() => act("neighbor", { on: !social.mine.neighbor })}>{social.mine.neighbor ? "이웃 끊기" : "이웃 맺기 (소식 받기)"}</button>
          {needForge && (
            <div className="note">
              <b>너만의 도깨비불부터 찾아볼래?</b>
              <span className="small body">내 대장간이 있어야 장작을 넣고 말을 남길 수 있어. 1분이면 돼.</span>
              <a className="btn btn-fire" href="/find" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }} onClick={() => track("visitor_onboard_start")}>내 도깨비불 찾기</a>
            </div>
          )}
        </div>
      )}

      {social.notes.length > 0 && (
        <div className="notes">
          <div className="tiny muted">놀러 온 도깨비들이 남긴 말</div>
          {social.notes.map((n, i) => <div key={i} className="note-row"><a href={`/f/${n.from}`}>{n.nickname}</a><span>{n.phrase}</span></div>)}
        </div>
      )}

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
      ) : viewerHasForge ? (
        <a className="btn btn-ghost" href="/find/home" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>내 대장간으로 돌아가기</a>
      ) : (
        <div className="blueprint-cta">
          <div className="display">너만의 도깨비불도 찾아볼래?</div>
          <p>만들고 싶은 거나 요즘 귀찮은 거 하나만 말하면, 네 대장간도 이 마을에 생겨.</p>
          <a className="btn btn-fire" href="/find" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }} onClick={() => track("visitor_onboard_start")}>내 도깨비불 찾기</a>
        </div>
      )}

      <a className="btn btn-ghost" href="/find/village" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>도깨비 마을 지도 보기</a>
      {!isOwner && <ReportLink forgeId={forge.id} />}
      <nav className="town-tabs" aria-label="마을 길">
        <a href="/find/home">내 집</a><a href="/find/neighbors">이웃</a><a href="/find/dex">도감</a><a href="/find/random">아무 집이나</a>
      </nav>

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
                {isOwner ? <ForgeSignup fire={latest ? { id: latest.id, name: latest.name } : null} forgeId={forge.id} refCode={null} couponText={couponText} /> : (
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

const REASONS = ["불쾌한 이름", "개인정보가 보여요", "광고·도배", "기타"];
function ReportLink({ forgeId }: { forgeId: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <p className="fine-left" style={{ textAlign: "center" }}>신고했어. 다인이 확인할게.</p>;
  return open ? (
    <div className="report-row">
      {REASONS.map((r) => <button key={r} type="button" className="chip" onClick={async () => { await fetch("/api/find/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ host: forgeId, reason: r }) }).catch(() => undefined); track("report_sent"); setDone(true); }}>{r}</button>)}
    </div>
  ) : <button className="link" type="button" style={{ fontSize: 12 }} onClick={() => setOpen(true)}>이 집 신고하기</button>;
}
