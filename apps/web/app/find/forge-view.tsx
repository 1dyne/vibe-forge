"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FireCard } from "../../lib/find/card";
import { REACT_HUE, type ReactKind } from "../../lib/find/chips";
import Dokkaebi from "./dokkaebi";
import ForgeRoom, { type RoomObj } from "./forge-room";
import { MyLanterns, RopeSheet } from "./lantern-panel";
import { MemoSheet } from "./memo-panel";
import { QuestionSheet, useQuestion } from "./question-panel";
import type { LanternRecord, PublicLantern } from "../../lib/find/lantern";
import { ROOFS, SIGNS, YARD, YARD_MAX, yardUnlocked, type Decor } from "../../lib/find/decor";
import FireCardView, { Roast } from "./fire-card";
import { MailSheet } from "./mailbox";
import { track } from "./track";
import ForgeSignup from "./waitlist";
import Kkachi from "./kkachi";
import { PracticeSheet, SkillsSheet } from "./practice-sheet";
import { createForgeSound } from "./world/world-sound";

export type ForgeFire = { id: string; name: string; color: string; reactKind: string; peak: number; sentence: string; card: FireCard | null; stage: 1 | 2 | 3; cats: string[] };
export type Social = { fuelToday: number; fuelTotal: number; wants: number; notes: Array<{ phrase: string; from: string; nickname: string; at: string }>; neighbors: number; visitsWeek: number; mine: { fuelGivenToday: boolean; wanted: boolean; notedToday: boolean; neighbor: boolean } };
type Props = {
  forge: { id: string; nickname: string; alley: string; plotNo: number; visibility: "public" | "link" | "private"; theme: string; village: string; decor: Decor };
  fires: ForgeFire[];
  isOwner: boolean;
  couponText: string | null;
  social: Social;
  viewerHasForge: boolean;
  dexAdded: number;
  lanterns: { mine: LanternRecord[] | null; allowance: number; shown: PublicLantern[] };
  news?: ReactNode;
  /** 작업실 메모 수 (주인만) */
  memoCount?: number;
};
const PHRASES = ["나도 갖고 싶어", "이거 천재다", "만들면 알려줘!", "장작 넣고 감", "응원해"];
type Obj = "hearth" | "blueprint" | "shelf" | "invention" | "mailbox" | "decor" | "lantern" | "memo" | "practice" | "work" | "skills" | "share";

// 골목 테마별 방 색 (다인의 방 그림이 오기 전 임시)
const ROOM_TINT: Record<string, [string, string, string]> = {
  cat: ["#FBE3EA", "#F6D3DE", "#F1C2D0"], dog: ["#FCE8D6", "#F7DCC3", "#F0CDAE"], water: ["#E2F0FA", "#D3E7F6", "#C2DCF0"],
  sleep: ["#E5E4F4", "#D8D6EE", "#C9C6E6"], plant: ["#E3F2E3", "#D4EAD3", "#C3E0C2"], desk: ["#F4EEE2", "#ECE3D2", "#E2D6BF"],
  door: ["#EFE6DD", "#E6D9CC", "#DACBBB"], kitchen: ["#FBF3D9", "#F6EAC4", "#EFDEAB"]
};
const VIS_LABEL = { public: "전체 공개", link: "링크로만", private: "비공개" } as const;

export default function ForgeView({ forge, fires, isOwner, couponText, social: initialSocial, viewerHasForge, dexAdded, lanterns, news, memoCount: initialMemos = 0 }: Props) {
  const [memoCount, setMemoCount] = useState(initialMemos);
  const [mailNews, setMailNews] = useState(false);
  // 처음 들어온 주인에게 대장간에서 할 수 있는 일을 알려준다 (이 기기에서 한 번, ? 버튼으로 다시)
  const [tut, setTut] = useState<number | null>(null);
  useEffect(() => { if (!isOwner) return; try { if (!localStorage.getItem("forge_tut_v1")) setTut(0); } catch { /* 저장소 막힘: 안내 생략 */ } }, [isOwner]);
  const endTut = () => { setTut(null); try { localStorage.setItem("forge_tut_v1", "1"); } catch { /* 무시 */ } };
  // 대장간 소리: 화덕 타닥, 풀무, 가끔 가야금 한 음 (켜야 난다)
  const snd = useRef<ReturnType<typeof createForgeSound> | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  function toggleSound() {
    if (!snd.current) snd.current = createForgeSound();
    const on = !soundOn; setSoundOn(on);
    snd.current.resume(); snd.current.setMuted(!on);
    try { localStorage.setItem("find_sound", on ? "1" : "0"); } catch { /* 무시 */ }
    track("world_sound", { on: String(on), where: "forge" });
  }
  useEffect(() => () => snd.current?.close(), []);
  const [question, setQuestion] = useQuestion(isOwner);
  const [asking, setAsking] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => { if (isOwner && window.location.hash === "#lantern") setOpen("lantern"); }, [isOwner]);
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
    if (o === "tools" && isOwner) { show("skills"); return; }
    if (o === "invention") { show(isOwner ? "work" : "blueprint"); return; }
    if (o === "mailbox" && isOwner && news) { setMailNews(true); track("object_open", { object: o }); return; }
    if (o === "tools") { setToast(`연장 걸이: ${usedCats.join("·")} 갈래를 채워봤어. 네 갈래를 다 채우면 연장이 다 걸려.`); track("object_open", { object: o }); return; }
    if (o === "display") { setToast(`'나도 갖고 싶어' ${social.wants}개. 소반에 메밀묵이 올라가고, 5개가 넘으면 금빛 초롱이 켜져.`); track("object_open", { object: o }); return; }
    show(o);
  }
  async function share() {
    const url = `${window.location.origin}/f/${forge.id}`;
    const text = `${forge.nickname}의 대장간에 놀러 와. ${forge.alley}에 있어.`;
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
    <section className="forge-full" style={{ ["--fire" as string]: latest?.color ?? "#4FB3A6" }}>
      <div className="forge-stage">
      <ForgeRoom full onExit={() => { track("forge_exit"); window.location.href = `/find/village?house=${forge.id}`; }} memos={memoCount} lanternsLit={(lanterns.mine ?? lanterns.shown).filter((l) => l.status === "lit").length} lanternsDone={(lanterns.mine ?? lanterns.shown).filter((l) => l.status === "done").length} village={forge.village} fires={roomFires} peak={latest?.peak ?? 20} fuel={social.fuelTotal} wants={social.wants} notes={social.notes.length} neighbors={social.neighbors} hue={REACT_HUE[kind] ?? 0} onPick={pickRoom} fallback={
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
      <header className="forge-top">
        <span className="forge-tools">
          <Kkachi where="forge" onTutorial={isOwner ? () => setTut(0) : undefined} />
          <button type="button" className="forge-back" onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? "소리 끄기" : "소리 켜기"}>{soundOn ? "소리 끔" : "소리"}</button>

        </span>
        <div className="forge-title">
          <b>{forge.nickname}의 대장간</b>
          <span>{forge.alley} · {STAGE_NAME[topStage - 1]} · 도깨비불 {fires.length}</span>
        </div>
        <span className="forge-chips" aria-label="받은 것">
          <i title="오늘 받은 장작">장작 {social.fuelToday}</i><i title="나도 갖고 싶어">갖고 싶어 {social.wants}</i>
        </span>
      </header>
      {toast && <div className="forge-toast" role="status"><span>{toast}</span><button className="link" type="button" onClick={() => setToast("")}>좋아</button></div>}
      {isOwner && question && !asking && (
        <button type="button" className="forge-ask" onClick={() => { setAsking(true); track("forge_sheet", { sheet: "question" }); }}>
          <b>화덕 도깨비</b><span>{question.ask}</span>
        </button>
      )}
      {asking && question && <QuestionSheet q={question} onClose={() => setAsking(false)} onDone={(msg) => { setAsking(false); setQuestion(null); setToast(msg); setTimeout(() => window.location.reload(), 1400); }} />}
      <p className="forge-hint">바닥을 누르면 달그락이 걸어가 · 물건을 눌러봐 · 옆으로 끌면 둘러보기</p>
      <nav className={`forge-dock ${isOwner ? "owner" : ""}`} aria-label="대장간에서 할 일">
        {isOwner ? (
          <>
            <button type="button" className="dock-main" onClick={() => show("work")}>작업대</button>
            <button type="button" onClick={() => show("memo")}>메모{memoCount ? ` ${memoCount}` : ""}</button>
            <button type="button" onClick={() => show("decor")}>꾸미기</button>
            <button type="button" onClick={() => show("share")}>자랑하기</button>
          </>
        ) : (
          <>
            <button type="button" className="dock-main" disabled={social.mine.fuelGivenToday} onClick={() => act("fuel")}>{social.mine.fuelGivenToday ? "장작 넣었어" : "장작 넣기"}</button>
            <button type="button" disabled={social.mine.wanted} onClick={() => act("want")}>{social.mine.wanted ? "갖고 싶어 ✓" : "갖고 싶어"}</button>
            <button type="button" onClick={() => { setMore(true); track("forge_sheet"); }}>쪽지·이웃</button>
          </>
        )}
      </nav>
      </div>

      {more && <div className="overlay" role="dialog" aria-label="대장간 살림" onClick={(e) => { if (e.target === e.currentTarget) setMore(false); }}>
      <div className="sheet tall forge-more">
      {news}
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
            <button className="btn btn-ghost" type="button" onClick={() => show("decor")}>대장간 꾸미기</button>
            <a className="btn btn-ghost" href={`/find/village?house=${forge.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>마을로 나가기</a>
          </div>
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

      <a className="btn btn-ghost" href={`/find/village?house=${forge.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>마을로 나가기</a>
      {!isOwner && <ReportLink forgeId={forge.id} />}
      <nav className="town-tabs" aria-label="마을 길">
        <a href="/find/home">내 대장간</a><a href="/find/neighbors">이웃</a><a href="/find/dex">도감</a><a href="/find/random">아무 대장간이나</a>
      </nav>
      <button className="link" type="button" onClick={() => setMore(false)}>닫기</button>
      </div></div>}
      {open === "work" && isOwner && (
        <div className="overlay" role="dialog" aria-label="작업대" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="sheet work-sheet">
            <div className="display" style={{ fontSize: 22 }}>작업대</div>
            <button type="button" className="work-pick" onClick={() => show("practice")}><b>🔧 손 기술 연습</b><span>부품을 사기 전에 3D 작업대에서 납땜·조립을 먼저 해봐</span></button>
            <a className="work-pick" href="/find" onClick={() => track("forge_sheet", { sheet: "new-fire" })}><b>🔥 새 아이디어로 불 피우기</b><span>다른 아이디어로 도깨비불을 하나 더 찾아</span></a>
            <button className="link" type="button" onClick={() => setOpen(null)}>닫기</button>
          </div>
        </div>
      )}
      {open === "skills" && isOwner && <SkillsSheet onPractice={() => show("practice")} onClose={() => setOpen(null)} />}
      {open === "share" && isOwner && (
        <div className="overlay" role="dialog" aria-label="대장간 자랑하기" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="sheet">
            <div className="display" style={{ fontSize: 22 }}>대장간 자랑하기</div>
            <button className="btn btn-fire" type="button" onClick={share}>{copied ? "링크 복사했어!" : "링크 보내기"}</button>
            <label className="vis" htmlFor="vis-sel"><span className="small">누가 볼 수 있어?</span>
              <select id="vis-sel" value={visibility} onChange={(e) => changeVisibility(e.target.value as typeof visibility)}>
                {(Object.keys(VIS_LABEL) as Array<keyof typeof VIS_LABEL>).map((v) => <option key={v} value={v}>{VIS_LABEL[v]}</option>)}
              </select>
            </label>
            <p className="fine-left">처음 쓴 문장은 너만 봐. 놀러 온 사람에게는 도깨비불 이름·속성·장작만 보여.</p>
            <button className="link" type="button" onClick={() => setOpen(null)}>닫기</button>
          </div>
        </div>
      )}
      {mailNews && (
        <div className="overlay" role="dialog" aria-label="편지함" onClick={(e) => { if (e.target === e.currentTarget) setMailNews(false); }}>
          <div className="sheet tall">
            <div className="display" style={{ fontSize: 22 }}>편지함</div>
            {news}
            <button className="btn btn-ghost" type="button" onClick={() => { setMailNews(false); setOpen("mailbox"); }}>만든 사람 dyne에게 편지 쓰기</button>
            <button className="link" type="button" onClick={() => setMailNews(false)}>닫기</button>
          </div>
        </div>
      )}
      {tut !== null && <ForgeTutorial step={tut} onStep={setTut} onDone={endTut} />}
      {open === "practice" && isOwner && <PracticeSheet forgeId={forge.id} hue={REACT_HUE[kind] ?? 0} onClose={() => setOpen(null)} />}
      {open === "memo" && isOwner && <MemoSheet fires={fires.map((f) => ({ id: f.id, name: f.name, sentence: f.sentence }))} onCount={setMemoCount} onClose={() => setOpen(null)} />}
      {open === "lantern" && (isOwner && lanterns.mine
        ? <MyLanterns initial={lanterns.mine} allowance={lanterns.allowance} fires={fires.map((f) => ({ id: f.id, name: f.name }))} onClose={() => setOpen(null)} />
        : <RopeSheet group={{ key: `forge:${forge.id}`, label: `${forge.nickname}의 등불`, count: lanterns.shown.length, done: lanterns.shown.filter((l) => l.status === "done").length, lanterns: lanterns.shown }} hasForge={viewerHasForge} onClose={() => setOpen(null)} />)}

      {open === "mailbox" && <MailSheet screen={`forge:${forge.id}`} onClose={() => setOpen(null)} />}
      {open === "decor" && <DecorSheet initial={forge.decor} village={forge.village} stats={{ neighbors: social.neighbors, fuel: social.fuelTotal, wants: social.wants, notes: social.notes.length }} houseId={forge.id} onClose={() => setOpen(null)} />}
      {open && open !== "mailbox" && open !== "decor" && open !== "lantern" && open !== "memo" && open !== "practice" && open !== "work" && open !== "skills" && open !== "share" && (
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
                {isOwner && <button className="btn btn-ghost" type="button" onClick={() => show("memo")}>작업실 메모 열기{memoCount ? ` (${memoCount})` : ""}</button>}
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

/** 대장간 꾸미기: 마을에서 보이는 집 겉모습 + 기척 공개 여부 */
function DecorSheet({ initial, stats, houseId, onClose }: { initial: Decor; village: string; stats: { neighbors: number; fuel: number; wants: number; notes: number }; houseId: string; onClose: () => void }) {
  const [d, setD] = useState<Decor>(initial ?? {});
  const [msg, setMsg] = useState("");
  const yard = d.yard ?? [];
  function toggleYard(id: (typeof YARD)[number]["id"]) {
    if (yard.includes(id)) setD({ ...d, yard: yard.filter((y) => y !== id) });
    else if (yard.length >= YARD_MAX) setMsg(`집 앞엔 ${YARD_MAX}개까지 둘 수 있어. 하나를 빼고 골라줘.`);
    else { setD({ ...d, yard: [...yard, id] }); setMsg(""); }
  }
  async function save() {
    const res = await fetch("/api/find/forge", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ decor: d }) }).catch(() => null);
    if (!res?.ok) { setMsg("저장하지 못했어. 잠시 뒤에 다시 해줘."); return; }
    track("decor_saved", { roof: d.roof ?? "", sign: d.sign ?? "", yard: yard.join(","), hide: String(Boolean(d.hidePresence)) });
    setMsg("저장했어! 마을에 나가면 바뀐 집이 보여.");
  }
  return (
    <div className="overlay" role="dialog" aria-label="대장간 꾸미기" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet tall">
        <div className="display" style={{ fontSize: 22 }}>대장간 꾸미기</div>
        <div className="tiny muted">마을에서 보이는 내 대장간 겉모습이야.</div>
        <div className="decor-group">
          <b className="small">지붕</b>
          <div className="phrases">
            <button type="button" className={`chip ${!d.roof ? "on" : ""}`} onClick={() => setD({ ...d, roof: undefined })}>마을 기본</button>
            {ROOFS.map((r) => <button key={r.id} type="button" className={`chip roof-chip ${d.roof === r.id ? "on" : ""}`} onClick={() => setD({ ...d, roof: r.id })}><i style={{ background: r.color }} />{r.name}</button>)}
          </div>
          <div className="tiny muted">네 색은 지붕이 아니라 창호지 불빛으로 보여. 마을에선 네 도깨비불 색으로 창이 켜져.</div>
        </div>
        <div className="decor-group">
          <b className="small">문패</b>
          <div className="phrases">{SIGNS.map((s) => <button key={s.id} type="button" className={`chip ${(d.sign ?? "plank") === s.id ? "on" : ""}`} onClick={() => setD({ ...d, sign: s.id })}>{s.name}</button>)}</div>
        </div>
        <div className="decor-group">
          <b className="small">집 앞 꾸미기 <span className="tiny muted">({yard.length}/{YARD_MAX})</span></b>
          <div className="phrases">
            {YARD.map((y) => {
              const open = yardUnlocked(y.id, stats);
              return <button key={y.id} type="button" className={`chip ${yard.includes(y.id) ? "on" : ""}`} disabled={!open} title={open ? "" : y.hint} onClick={() => toggleYard(y.id)}>{open ? y.name : `🔒 ${y.name}`}</button>;
            })}
          </div>
          <div className="tiny muted">잠긴 건 이웃과 어울리면 열려: 이웃 3명 → 평상 · 장작 10개 → 초롱 걸이 · '나도 갖고 싶어' 5개 → 작은 솟대 · 남긴 말 5개 → 풍경</div>
        </div>
        <label className="decor-toggle">
          <input type="checkbox" checked={!d.hidePresence} onChange={(e) => setD({ ...d, hidePresence: !e.target.checked })} />
          <span><b className="small">마을에 내 기척 보이기</b><br /><span className="tiny muted">내가 마을에 있으면 집 창문이 일렁이고 굴뚝 연기가 굵어져. 이름이나 접속 여부는 따로 보여주지 않아.</span></span>
        </label>
        {msg && <div className="small" role="status">{msg}</div>}
        <button className="btn btn-fire" type="button" onClick={save}>저장하기</button>
        <a className="btn btn-ghost" href={`/find/village?house=${houseId}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>마을에 나가서 보기</a>
        <button className="link" type="button" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}

const REASONS = ["불쾌한 이름", "개인정보가 보여요", "광고·도배", "기타"];
function ReportLink({ forgeId }: { forgeId: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <p className="fine-left" style={{ textAlign: "center" }}>신고했어. 만든 사람 dyne이 확인할게.</p>;
  return open ? (
    <div className="report-row">
      {REASONS.map((r) => <button key={r} type="button" className="chip" onClick={async () => { await fetch("/api/find/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ host: forgeId, reason: r }) }).catch(() => undefined); track("report_sent"); setDone(true); }}>{r}</button>)}
    </div>
  ) : <button className="link" type="button" style={{ fontSize: 12 }} onClick={() => setOpen(true)}>이 집 신고하기</button>;
}

const TUT: Array<{ title: string; body: string }> = [
  { title: "여기가 네 대장간이야", body: "바닥을 누르면 달그락이 그리로 걸어가. 물건을 누르면 그 앞까지 가서 열어줘. 옆으로 끌면 방을 둘러볼 수 있어." },
  { title: "작업대에서 미리 해봐", body: "작업대를 누르면 3D로 납땜·조립을 미리 연습할 수 있어. 부품을 사기 전에 손으로 하는 순서를 익혀둬. 새 아이디어로 불을 하나 더 피우는 것도 여기서." },
  { title: "설계도와 화덕", body: "설계도에는 도깨비가 받아 적은 설계 한 줄이 있어. 화덕 도깨비는 하루에 한 번 질문을 해. 답할수록 네 도깨비불이 자라고 대장간도 커져." },
  { title: "꾸미고, 적고, 나가기", body: "꾸미기로 마을에서 보이는 집 모양을 바꾸고, 메모에 떠오른 생각을 모아둬. 앞쪽 바닥의 주황 화살표를 누르면 마을로 나가. 소원 등불은 마을의 소원 선착장에서 달아. 새 소식과 만든 사람 dyne에게 보내는 말은 왼쪽 위 까치에게." },
];
function ForgeTutorial({ step, onStep, onDone }: { step: number; onStep: (n: number) => void; onDone: () => void }) {
  const c = TUT[step];
  const last = step === TUT.length - 1;
  return (
    <div className="overlay tut" role="dialog" aria-label="대장간 안내">
      <div className="sheet tut-card">
        <div className="tiny muted">{step + 1} / {TUT.length}</div>
        <div className="display" style={{ fontSize: 22 }}>{c.title}</div>
        <p className="body" style={{ margin: 0 }}>{c.body}</p>
        <div className="two">
          <button className="btn btn-ghost" type="button" onClick={onDone}>건너뛰기</button>
          <button className="btn btn-fire" type="button" onClick={() => (last ? onDone() : onStep(step + 1))}>{last ? "시작하기" : "다음"}</button>
        </div>
      </div>
    </div>
  );
}
