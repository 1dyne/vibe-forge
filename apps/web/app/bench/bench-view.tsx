"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BenchKit, BenchView } from "../../lib/bench/types";
import type { BenchApi, HoldEvent, MistakeKind } from "./bench-scene";
import { glossaryIn, lookupGlossary, splitGlossary, type GlossaryEntry } from "../../lib/bench/glossary";
import { GRADE_TEXT, HOLD_MS, TOOL_NAME, bendableRefs, handsStages, stageText, stepTools, type HandsStage, type HoldGrade } from "../../lib/bench/hands";

type Motion = "idle" | "tilt" | "stoke" | "blaze" | "fallen";
import "./bench.css";

/** **굵게**와 사전 말(ⓘ)을 함께 그린다. seen = 이 단계에서 이미 ⓘ를 단 말 */
function rich(text: string, seen: Set<string>, onTerm: (e: GlossaryEntry) => void): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((seg, i) => {
    const bold = seg.startsWith("**") && seg.endsWith("**") && seg.length > 4;
    const body = bold ? seg.slice(2, -2) : seg;
    const kids = splitGlossary(body, seen).map((g, j) => (typeof g === "string" ? g : (
      <button key={j} type="button" className="gl" onClick={() => onTerm(g.entry)} aria-label={`${g.text} 뜻 보기`}>{g.text}<sup aria-hidden>ⓘ</sup></button>
    )));
    return bold ? <b key={i}>{kids}</b> : <span key={i}>{kids}</span>;
  });
}

/** 꾹 누르는 동안 손가락 둘레에 차오르는 고리 (자기 rAF로만 다시 그린다) */
function HoldRing({ x, y, start }: { x: number; y: number; start: number }) {
  const [ms, setMs] = useState(0);
  useEffect(() => { let r = 0; const f = () => { setMs(performance.now() - start); r = requestAnimationFrame(f); }; r = requestAnimationFrame(f); return () => cancelAnimationFrame(r); }, [start]);
  const p = Math.min(1, ms / HOLD_MS.good);
  const phase = ms < HOLD_MS.heat ? "heat" : ms < HOLD_MS.good ? "feed" : ms < HOLD_MS.warn ? "good" : ms < HOLD_MS.cold ? "warn" : "cold";
  const text = { heat: "데우는 중…", feed: "납 넣는 중…", good: "좋아요, 떼요!", warn: "이제 떼요!", cold: "너무 오래요" }[phase];
  const C = 2 * Math.PI * 30;
  return (
    <div className={`hold-ring ${phase}`} style={{ left: x, top: y }} aria-hidden>
      <svg width="76" height="76" viewBox="0 0 76 76"><circle cx="38" cy="38" r="30" className="bg" /><circle cx="38" cy="38" r="30" className="fg" strokeDasharray={`${C * p} ${C}`} transform="rotate(-90 38 38)" /></svg>
      <span>{text}</span>
    </div>
  );
}

// 3D 조립 책상 화면 (명세서 2차 v0.1 §1·§4·§5). 연습 키트와 프로젝트 조립이 같이 쓴다.
// 장면은 bench-scene.ts가 그리고, 여기서는 단계·버튼·달그락 말풍선·HW 서랍을 다룬다.

export type BenchPhoto = { name: string; dataUrl: string };
type Props = {
  kit: BenchKit; hue?: number; mode: "practice" | "project"; backHref?: string; onClose?: () => void; onFinish?: () => void;
  /** 프로젝트: HW 작업실에 실제로 묻는다. 답 첫 문단을 돌려준다 (실패하면 오류 문구를 던진다) */
  onAsk?: (text: string, photos: BenchPhoto[]) => Promise<string>;
  /** 프로젝트: 실물로 이 단계를 마쳤다고 기록한다 (1부터) */
  onReport?: (step: number, text: string) => void;
  /** 웹 AI 없이 내 Claude로만 쓰는 사람: 물어볼 문구를 복사해 준다 */
  connectorOnly?: boolean;
  /** 이미 실물 완료를 보낸 단계 (1부터) */
  reported?: number[];
};

const VIEWS: Array<[BenchView, string]> = [["34", "3/4"], ["top", "위"], ["bottom", "아래"], ["front", "앞"]];
const PRAISE = ["좋아! 반짝이는 원뿔이야", "깔끔해!", "그렇지, 그거야", "손이 빠른데?", "대장장이 다 됐네"];

function s0Saved() { try { return (JSON.parse(localStorage.getItem("bench:" + (location.pathname.split("/").pop() ?? "")) ?? "null") as { step: number } | null)?.step ?? 0; } catch { return 0; } }
function fmt(sec: number) { return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`; }

export default function BenchViewScreen({ kit, hue = 0, mode, backHref = "/", onClose, onFinish, onAsk, onReport, connectorOnly = false, reported = [] }: Props) {
  const [askText, setAskText] = useState("");
  const [photos, setPhotos] = useState<BenchPhoto[]>([]);
  const [asking, setAsking] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const leave = () => (onClose ? onClose() : (window.location.href = backHref));
  const mount = useRef<HTMLDivElement>(null);
  const api = useRef<BenchApi | null>(null);
  const storeKey = `bench:${kit.id}`;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState(0);
  const [doneSteps, setDoneSteps] = useState(0);
  const [playing, setPlaying] = useState(false);
  const advancing = useRef(false);
  const [challenge, setChallenge] = useState(false);
  const [view, setView] = useState<BenchView>(kit.steps[0]?.view ?? "34");
  const [bubble, setBubble] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string; skip?: boolean } | null>(null);
  // 직접 하기: 이 단계를 손으로 하는 순서 (뒤집기 → 양손 → 꾹 누르기 …)
  const [stages, setStages] = useState<HandsStage[]>([]);
  const [stageIdx, setStageIdx] = useState(0);
  const [grades, setGrades] = useState<Record<string, HoldGrade>>({});
  const [holdUi, setHoldUi] = useState<{ x: number; y: number; start: number } | null>(null);
  const [gloss, setGloss] = useState<GlossaryEntry | null>(null);
  const stagesRef = useRef<HandsStage[]>([]); stagesRef.current = stages;
  const stageIdxRef = useRef(0); stageIdxRef.current = stageIdx;
  const gradesRef = useRef<Record<string, HoldGrade>>({}); gradesRef.current = grades;
  const userOff = useRef(false);
  const bendable = useMemo(() => bendableRefs(kit), [kit]);
  const [drawer, setDrawer] = useState(false);
  const [chat, setChat] = useState<Array<{ who: "me" | "hw"; text: string }>>([]);
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [intro, setIntro] = useState(true);
  const [mistake, setMistake] = useState<MistakeKind | null>(null);
  const [light, setLight] = useState(false);
  const [finished, setFinished] = useState(false);
  const wrong = useRef(0);
  const topRef = useRef<HTMLElement>(null);
  const lowRef = useRef<HTMLDivElement>(null);
  const bubbleTimer = useRef(0);
  const stepRef = useRef(0); stepRef.current = step;
  const total = kit.steps.length;
  const cur = kit.steps[Math.min(step, total - 1)];

  const say = useCallback((text: string, ms = 3600) => {
    setBubble(text); clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  }, []);
  const [mot, setMot] = useState<{ m: Motion; k: number }>({ m: "idle", k: 0 });
  const motTimer = useRef(0);
  const motion = useCallback((m: Motion, once = true) => {
    setMot((x) => ({ m, k: x.k + 1 })); clearTimeout(motTimer.current);
    if (once) motTimer.current = window.setTimeout(() => setMot((x) => ({ m: "idle", k: x.k + 1 })), 25 * 80);
  }, []);
  const lastTap = useRef(0), tapTimer = useRef(0);
  const onMascot = () => {
    const now = Date.now();
    if (now - lastTap.current < 360) { clearTimeout(tapTimer.current); lastTap.current = 0; setDrawer(true); motion("blaze"); return; }
    lastTap.current = now;
    tapTimer.current = window.setTimeout(() => { const s = kit.steps[stepRef.current]; say(s ? `${s.doneWhen}면 성공이야. ${s.caution ?? ""}`.trim() : "두 번 누르면 나랑 얘기할 수 있어", 4200); motion("tilt"); }, 370);
  };

  // 저장된 진행 불러오기
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) ?? "null") as { step: number } | null;
      if (saved && saved.step > 0 && saved.step < total) { setStep(saved.step); setDoneSteps(saved.step); setIntro(false); }
      const l = localStorage.getItem("bench_light"); if (l === "1") setLight(true);
    } catch { /* 저장소가 막혀 있어도 처음부터 하면 된다 */ }
  }, [storeKey, total]);

  // 한 단계를 마쳤을 때 (보여줘로 끝났든, 직접 하기로 끝났든)
  const finishStep = useCallback((s: number) => {
    const next = s + 1;
    setDoneSteps((d) => Math.max(d, next));
    motion("blaze");
    say(next >= total ? "완성! 진짜 잘했어 🔥" : PRAISE[s % PRAISE.length], 2200);
    try { localStorage.setItem(storeKey, JSON.stringify({ step: next })); } catch { /* 무시 */ }
    if (next >= total) {
      advancing.current = false; setPlaying(false);
      setFinished(true);
      try { const done = JSON.parse(localStorage.getItem("dalgeurak_practice") ?? "{}"); done[kit.id] = new Date().toISOString(); localStorage.setItem("dalgeurak_practice", JSON.stringify(done)); } catch { /* 무시 */ }
      onFinish?.();
      return;
    }
    window.setTimeout(() => { setStep(next); api.current?.goto(next); advancing.current = false; setPlaying(false); }, 950);
  }, [kit, total, say, storeKey, onFinish, motion]);

  const advance = useCallback(() => {
    const s = stepRef.current;
    // 보여주는 중이거나, 끝나고 다음 단계로 넘어가는 0.95초 사이에는 다시 누르지 못하게 (연타하면 멈추던 문제)
    if (!api.current || s >= total || advancing.current) return;
    advancing.current = true;
    setPlaying(true); setFeedback(null); setMistake(null); setHoldUi(null); wrong.current = 0;
    if (kit.steps[s]?.ops.some((o) => o.op === "solder" || o.op === "bridge")) motion("stoke", false);
    api.current.play().then(() => finishStep(s));
  }, [kit, total, motion, finishStep]);

  // ── 직접 하기: 한 동작씩 ──
  const sceneHint = (st: HandsStage | null) => (st?.kind === "tap" || !st ? kit.steps[stepRef.current]?.tapHint : stageText(st));
  const showStage = useCallback((list: HandsStage[], i: number) => {
    setStageIdx(i); setGrades({});
    const st = list[i] ?? null;
    api.current?.setStage(st, sceneHint(st));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit]);
  const nextStage = () => {
    const list = stagesRef.current, i = stageIdxRef.current + 1;
    setFeedback(null);
    if (i < list.length) { showStage(list, i); return; }
    // 마지막 동작까지 손으로 했다
    const s = stepRef.current;
    if (advancing.current) return;
    advancing.current = true; setPlaying(true);
    finishStep(s);
  };
  const runStage = async (fn: () => Promise<void>, after?: string) => {
    if (!api.current || advancing.current || playingRef.current) return;
    playingRef.current = true; setPlaying(true); setFeedback(null);
    try { await fn(); } finally { playingRef.current = false; setPlaying(false); }
    if (after) say(after, 2600);
    nextStage();
  };
  const playingRef = useRef(false);
  const doFlip = () => runStage(() => api.current!.flip(), "구리 면이 위로 왔어요! 반짝이는 동그라미가 패드예요");
  const doHands = () => { motion("stoke"); return runStage(() => api.current!.ready(), "왼손 실납, 오른손 인두. 준비 끝!"); };
  const doBend = (ref: string) => runStage(() => api.current!.bend(ref), "다리가 ㄱ자로 꺾였어요. 이제 구멍에 꽂아요");
  const doTap = (st: Extract<HandsStage, { kind: "tap" }>) => runStage(() => api.current!.playOps(st.from, st.to));
  const skipHold = () => {
    const st = stagesRef.current[stageIdxRef.current];
    if (st?.kind !== "hold") return;
    api.current?.finishOp(st.op); say("괜찮아요. 연습이니까 다음에 또 해 봐요", 2600);
    nextStage();
  };

  // 장면에서 온 신호는 늘 최신 상태로 처리한다 (장면은 한 번만 만든다)
  const onTargetRef = useRef<(ok: boolean, message?: string) => void>(() => {});
  onTargetRef.current = (ok, message) => {
    if (ok) {
      const st = challenge ? stagesRef.current[stageIdxRef.current] : null;
      if (st?.kind === "tap") { void doTap(st); return; }
      if (st?.kind === "bend") { void doBend(st.ref); return; }
      if (st?.kind === "flip") { void doFlip(); return; }
      if (st?.kind === "hands" || st?.kind === "hold") return;
      advance(); return;
    }
    wrong.current += 1;
    setFeedback({ ok: false, text: message ?? "거기가 아니에요" });
    if (wrong.current >= 3) { motion("fallen"); say("같이 보자! 힌트를 눌러 봐", 3200); wrong.current = 0; }
    else motion("tilt");
  };
  const onHoldRef = useRef<(e: HoldEvent) => void>(() => {});
  onHoldRef.current = (e) => {
    if (e.type === "start") { setHoldUi({ x: e.x, y: e.y, start: performance.now() }); setFeedback(null); motion("stoke", false); return; }
    setHoldUi(null);
    const st = stagesRef.current[stageIdxRef.current];
    if (!st || st.kind !== "hold") return;
    const g = { ...gradesRef.current, [e.key]: e.grade };
    gradesRef.current = g; setGrades(g);
    const good = st.keys.filter((k) => g[k] === "good").length;
    const name = e.key.split("|").map((a) => a.split(".")[1] ?? a).join("–");
    if (e.grade === "good") {
      motion("blaze");
      if (good >= st.keys.length) { api.current?.finishOp(st.op); say(st.keys.length > 1 ? "전부 반짝이는 원뿔! 잘했어요" : "반짝이는 원뿔! 잘했어요", 2400); nextStage(); }
      else setFeedback({ ok: true, text: `${name}: ${GRADE_TEXT.good} (${good}/${st.keys.length}) 다음 자리도 꾹 눌러요` });
    } else {
      motion("tilt");
      const text = e.grade === "starved" && e.ms < 450 ? "살짝 눌렀다 뗐어요. 손가락을 떼지 말고 2초쯤 꾹 눌러요" : GRADE_TEXT[e.grade];
      setFeedback({ ok: false, text: `${name}: ${text}`, skip: true });
    }
  };

  // 장면 만들기
  useEffect(() => {
    let disposed = false;
    const lowEnd = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 3 || (navigator.hardwareConcurrency ?? 8) <= 4;
    let startLight = lowEnd;
    try { const l = localStorage.getItem("bench_light"); if (l === "1" || l === "0") startLight = l === "1"; } catch { /* 무시 */ }
    setLight(startLight);
    (async () => {
      try {
        const { createBench } = await import("./bench-scene");
        if (disposed || !mount.current) return;
        const a = await createBench(mount.current, kit, {
          hue, light: startLight,
          cb: {
            onTarget: (ok, message) => onTargetRef.current(ok, message),
            onHold: (e) => onHoldRef.current(e),
            onView: (v) => setView(v),
            onPart: (ref) => { const p = kit.parts.find((x) => x.ref === ref); if (p) say(`${p.label}: ${p.about}`, 4200); }
          }
        });
        if (disposed) { a.dispose(); return; }
        if (s0Saved() > 0) setStarted(Date.now());
        api.current = a;
        const saved = (() => { try { return (JSON.parse(localStorage.getItem(storeKey) ?? "null") as { step: number } | null)?.step ?? 0; } catch { return 0; } })();
        const s0 = saved > 0 && saved < total ? saved : 0;
        a.goto(s0);
        setReady(true);
      } catch (e) {
        console.error(e);
        if (!disposed) setFailed(true);
      }
    })();
    return () => { disposed = true; api.current?.dispose(); api.current = null; };
    // 장면은 키트가 바뀔 때만 다시 만든다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit.id]);

  useEffect(() => { if (!started || finished) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [started, finished]);
  useEffect(() => { api.current?.setChallenge(challenge); }, [challenge, ready]);
  // 단계가 바뀌거나 직접 하기를 켜고 끌 때: 손으로 할 순서를 다시 짠다
  useEffect(() => {
    if (!ready || !api.current) return;
    setGloss(null); setHoldUi(null);
    const s = kit.steps[step];
    if (!challenge || finished || !s) { setStages([]); stagesRef.current = []; api.current.setStage(null); return; }
    const st = api.current.state();
    const list = handsStages(s, { canFlip: st.canFlip, flipped: st.flipped, hands: st.hands, bendable });
    setStages(list); stagesRef.current = list;
    showStage(list, 0);
  }, [ready, step, challenge, finished, kit, bendable, showStage]);
  // 패널이 넘칠 때(키 작은 폰): 단계·동작이 바뀌면 단계 글의 첫 줄이 보이게 (버튼을 누르면 맨 아래로 밀려 있던 문제)
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const p = panelRef.current, sb = p?.querySelector(".step-box") as HTMLElement | null;
    if (p && sb && p.scrollHeight > p.clientHeight + 2) p.scrollTop = sb.offsetTop;
  }, [step, stageIdx, challenge, finished]);
  // 납땜 단계는 직접 해 보기가 기본 (연습). 끈 적이 있으면 말로만 권한다
  useEffect(() => {
    if (!ready || finished || intro) return;
    const s = kit.steps[step];
    if (!s?.ops.some((o) => o.op === "solder" || o.op === "bridge") || challenge) return;
    if (mode === "practice" && !userOff.current) { setChallenge(true); say("납땜은 직접 해 봐요! 빛나는 자리를 꾹 누르면 돼요", 3800); }
    else say("‘직접’을 켜면 손으로 납땜해 볼 수 있어요", 3200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, step, finished, intro]);
  // 이번 단계에 쓰는 연장·부품을 장면에서 빛내고 이름표를 단다
  const tools = useMemo(() => (cur && !finished ? stepTools(cur) : []), [cur, finished]);
  useEffect(() => {
    if (!ready) return;
    const ps = finished || !cur ? [] : cur.ops.flatMap((o) => (o.op === "place" || o.op === "insert" || o.op === "seat" || o.op === "mount_on" ? [o.ref] : o.op === "batteries" ? kit.parts.filter((p) => p.kind === "aa_battery").map((p) => p.ref) : []));
    api.current?.setHighlight(tools, ps);
  }, [ready, tools, cur, finished, kit]);
  // 카드에 가리지 않는 띠에 장면이 오도록 알려 준다
  useEffect(() => {
    if (!ready) return;
    const measure = () => {
      const H = window.innerHeight, W = window.innerWidth;
      const panel = document.querySelector(".bench-panel") as HTMLElement | null;
      const root = document.querySelector(".bench") as HTMLElement | null;
      if (panel && root) root.style.setProperty("--panel-real", `${Math.ceil(panel.getBoundingClientRect().height)}px`);
      const top = topRef.current?.getBoundingClientRect().bottom ?? 0;
      // 아래쪽은 시점 알약과 HW 달그락 중 더 높은 것까지 가린 것으로 본다
      const mascot = document.querySelector(".bench-mascot") as HTMLElement | null;
      const low = Math.min(lowRef.current?.getBoundingClientRect().top ?? H, mascot?.getBoundingClientRect().top ?? H);
      if (W >= 900) api.current?.setInsets(0, 0, 0, 424); else api.current?.setInsets(top + 12, H - low + 14);
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of document.querySelectorAll(".bench-top, .bench-panel")) ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [ready, step, finished]);

  function begin() { setIntro(false); setStarted(Date.now()); say("두 번 누르면 나한테 물어볼 수 있어!", 3800); }
  function goStep(i: number) {
    if (playing || i < 0 || i >= total || i > doneSteps) return;
    setStep(i); setFeedback(null); setMistake(null); setHoldUi(null); api.current?.goto(i);
  }
  function pickView(v: BenchView) { setView(v); api.current?.setView(v); }
  function toggleMistake(k: MistakeKind) { const next = mistake === k ? null : k; setMistake(next); api.current?.mistake(next); if (next) motion("tilt"); }
  function toggleLight() { const on = !light; setLight(on); api.current?.setLight(on); try { localStorage.setItem("bench_light", on ? "1" : "0"); } catch { /* 무시 */ } }
  function restart() { try { localStorage.removeItem(storeKey); } catch { /* 무시 */ } setFinished(false); setDoneSteps(0); setStep(0); setStarted(Date.now()); api.current?.goto(0); }
  function ask(q: string, a: string) { setChat((c) => [...c, { who: "me", text: q }, { who: "hw", text: a }]); motion("stoke"); }
  async function askReal(q: string) {
    const text = q.trim(); if (!text || !onAsk || asking) return;
    setChat((c) => [...c, { who: "me", text: photos.length ? `${text} (사진 ${photos.length}장)` : text }]);
    setAskText(""); setAsking(true); motion("stoke", false);
    try { const reply = await onAsk(`${contextLine} ${text}`, photos); setChat((c) => [...c, { who: "hw", text: reply }]); motion("blaze"); setPhotos([]); }
    catch (e) { setChat((c) => [...c, { who: "hw", text: e instanceof Error ? e.message : "지금은 답하지 못했어요. 잠시 뒤 다시 보내 주세요." }]); motion("tilt"); }
    finally { setAsking(false); }
  }
  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const added: BenchPhoto[] = [];
    for (const f of Array.from(files).slice(0, 3 - photos.length)) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(f.type) || f.size > 5 * 1024 * 1024) continue;
      const bmp = await createImageBitmap(f); const c = document.createElement("canvas"); const sc = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
      c.width = bmp.width * sc; c.height = bmp.height * sc; c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
      added.push({ name: f.name, dataUrl: c.toDataURL("image/jpeg", 0.82) });
    }
    setPhotos((p) => [...p, ...added].slice(0, 3));
    if (fileRef.current) fileRef.current.value = "";
  }
  function copyAsk(q: string) {
    const text = `달그락 프로젝트 "${kit.title}" ${contextLine} ${q} — get_project로 조립 단계와 문제 카드를 읽고 같이 봐줘.`;
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  }

  const elapsed = started ? (now - started) / 1000 : 0;
  const pct = Math.round((doneSteps / total) * 100);
  const contextLine = `[${mode === "practice" ? "연습" : "조립"} · ${kit.title} · ${Math.min(step + 1, total)}/${total} · ${cur?.title ?? "완료"}]`;
  const stage: HandsStage | null = challenge && !finished ? stages[stageIdx] ?? null : null;
  // 손으로 할 동작이 버튼 하나면 '보여줘' 자리에 그 버튼을 둔다 (보여줘는 안내 줄 끝에 남는다)
  const act = stage?.kind === "flip" ? { label: "보드 뒤집기", run: () => void doFlip() }
    : stage?.kind === "hands" ? { label: "양손 준비", run: () => void doHands() }
    : stage?.kind === "bend" ? { label: "다리 구부리기", run: () => void doBend(stage.ref) }
    : null;
  // HW 서랍의 '말 뜻' 빠른 질문: 이번 단계 글과 연장 이름에 나온 말
  const terms = cur && !finished ? glossaryIn([cur.action, cur.why, cur.caution ?? "", ...tools.map((t) => TOOL_NAME[t])]).slice(0, 6) : [];

  return (
    <div className={`bench ${drawer ? "drawer-open" : ""}`}>
      <div className="bench-stage" ref={mount} aria-label="3D 조립 책상. 드래그로 돌리고, 두 손가락으로 확대해요." role="img" />
      {!ready && !failed && <div className="bench-loading"><span className="spin" />작업대를 펼치는 중…</div>}
      {failed && <div className="bench-loading">이 기기에서는 3D를 열 수 없어요. 아래 단계 설명을 따라 해 보세요.</div>}

      <header className="bench-top" ref={topRef}>
        {onClose ? <button type="button" className="bench-brand" onClick={leave} aria-label="작업대로 돌아가기">← 작업대</button> : <a className="bench-brand" href={backHref} aria-label="돌아가기">← 달그락</a>}
        <div className="bench-card">
          <div className="eyebrow"><span>{mode === "practice" ? "미리 만들어보기" : "조립 가이드"}</span><span>{String(Math.min(step + 1, total)).padStart(2, "0")} / {String(total).padStart(2, "0")}</span></div>
          <h1>{kit.title}</h1>
          <p className="sub">{kit.subtitle}</p>
          {kit.provisional && kit.provisional.length > 0 && <span className="bench-sticker" title={`빌드하면서 바뀔 수 있어요: ${kit.provisional.join(", ")}`}>🔧 바뀔 수 있어요 · {kit.provisional.join(" · ")}</span>}
          <div className="meta"><span className="lvl"><i /><i /><i className={kit.level === "처음" ? "off" : ""} />{kit.level}</span><span>약 {kit.minutes}분</span><button type="button" className="chip-btn" onClick={toggleLight} aria-pressed={light}>{light ? "가볍게 ✓" : "가볍게"}</button></div>
        </div>
      </header>

      {bubble && <div className="bench-bubble" role="status">{bubble}</div>}
      <button type="button" className="bench-mascot" onClick={onMascot} aria-label="HW 달그락 (두 번 누르면 물어보기)" style={{ ["--hue" as string]: `${hue}deg` }}>
        <span className="aura" />
        <span key={mot.k} className={`dk-sprite m-${mot.m}`} />
      </button>

      <div className="bench-views" role="group" aria-label="보는 방향" ref={lowRef}>
        {VIEWS.map(([v, label]) => <button key={v} type="button" className={view === v ? "on" : ""} onClick={() => pickView(v)}>{label}</button>)}
      </div>

      <section className="bench-panel" aria-live="polite" ref={panelRef}>
        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="count"><span><b>{doneSteps}</b> / {total} 완료</span><span>{fmt(elapsed)}</span></div>

        {finished ? (
          <div className="step-box done">
            <div className="phase">완성</div>
            {mode === "practice" ? <>
              <p className="action">다 했어요! 🔥 이 손 기술은 내 대장간 연장 걸이에 걸어 둘게요.</p>
              <p className="why">실제 프로젝트에서는 HW 달그락이 같은 화면으로 내 설계도대로 안내해요.</p>
            </> : <>
              <p className="action">화면 속 조립을 끝까지 봤어요. 🔥</p>
              <p className="why">실물로 마친 단계는 ‘실제로 했어요’로 보내 주세요. 전원을 넣기 전에 문제 카드의 측정부터 해요.</p>
            </>}
            <div className="row"><button type="button" className="btn-main" onClick={leave}>돌아가기</button><button type="button" className="btn-ghost" onClick={restart}>처음부터</button></div>
          </div>
        ) : cur && (
          <div className={`step-box ${stage ? "hands" : ""} ${stage?.kind === "hold" ? "hold" : ""}`}>
            <div className="phase"><span>STEP {step + 1} OF {total} · {cur.phase}</span>
              {tools.length > 0 && <span className="tools" aria-label="이번에 쓰는 연장">{tools.map((t) => <button key={t} type="button" className={`tool ${gloss?.term === TOOL_NAME[t] ? "on" : ""}`} onClick={() => { const e = lookupGlossary(TOOL_NAME[t]); setGloss(gloss && e && gloss.term === e.term ? null : e); api.current?.peek(t); }}>{TOOL_NAME[t]}<sup aria-hidden>ⓘ</sup></button>)}</span>}
            </div>
            {(() => { const seen = new Set<string>(); const onTerm = (e: GlossaryEntry) => setGloss((g) => (g?.term === e.term ? null : e)); return <>
              <p className="action">{rich(cur.action, seen, onTerm)}</p>
              <p className="why">{rich(cur.why, seen, onTerm)}</p>
              {cur.caution && <p className="caution">⚠ {rich(cur.caution, seen, onTerm)}</p>}
            </>; })()}
            {gloss && <p className="gloss-note" role="note"><b>{gloss.term}</b> {gloss.short} <button type="button" className="link" onClick={() => { setDrawer(true); ask(`‘${gloss.term}’ 뜻이 뭐예요?`, gloss.short); }}>달그락에게 더 묻기</button><button type="button" className="x" aria-label="닫기" onClick={() => setGloss(null)}>×</button></p>}
            {feedback ? <p className={`feedback ${feedback.ok ? "ok" : "no"}`}>{feedback.text}{feedback.skip && <> <button type="button" className="link" onClick={skipHold}>이대로 넘어가기</button></>}</p>
              : stage && <p className="hands-line"><span>👐 {stage.kind === "tap" ? cur.tapHint : stageText(stage, stage.kind === "hold" ? stage.keys.filter((k) => grades[k] === "good").length : 0)}</span>{(stage.kind === "flip" || stage.kind === "hands" || stage.kind === "bend") && <button type="button" className="link" disabled={playing} onClick={advance}>보여줘</button>}</p>}
            {cur.mistakes && cur.mistakes.length > 0 && (
              <div className="mistakes">
                <span>흔한 실수</span>
                {cur.mistakes.map((m) => <button key={m.kind} type="button" className={mistake === m.kind ? "on" : ""} onClick={() => toggleMistake(m.kind)}>{m.title}</button>)}
              </div>
            )}
            {mistake && (() => { const m = cur.mistakes?.find((x) => x.kind === mistake); return m ? <p className="mistake-note"><b>{m.title}</b> · {m.looks}<br />고치기: {m.fix}</p> : null; })()}
          </div>
        )}

        <div className="parts-row" role="list" aria-label="부품">
          {kit.parts.map((p) => {
            const at = kit.steps.findIndex((s) => s.ops.some((o) => ("ref" in o && o.ref === p.ref) || (o.op === "batteries" && p.kind === "aa_battery")));
            const done = at >= 0 && doneSteps > at;
            const now2 = at === step && !finished;
            return <button type="button" role="listitem" key={p.ref} className={`part ${done ? "done" : ""} ${now2 ? "now" : ""}`} onClick={() => say(`${p.label}: ${p.about}`, 4200)}><i />{p.label}</button>;
          })}
        </div>

        {!finished && (
          <div className={`actions ${act ? "has-act" : ""}`}>
            <button type="button" className="btn-ghost hint" disabled={!ready || playing} aria-label="힌트" onClick={() => { api.current?.hint(); say(stage && stage.kind !== "tap" ? stageText(stage) : cur?.tapHint ?? "", 2600); }}>💡<span className="lbl"> 힌트</span></button>
            <button type="button" className={`btn-main ${act ? "act" : ""}`} disabled={!ready || playing} onClick={act ? act.run : advance}>{playing ? "하는 중…" : act ? act.label : "보여줘"}</button>
            <button type="button" className={`toggle ${challenge ? "on" : ""}`} aria-pressed={challenge} disabled={playing} onClick={() => { const on = !challenge; if (!on) userOff.current = true; setFeedback(null); setChallenge(on); }}><span className="sw" />직접<span className="lbl2"> 하기</span></button>
            <button type="button" className="btn-ghost nav" disabled={playing || step === 0} onClick={() => goStep(step - 1)} aria-label="이전 단계">◀</button>
            <button type="button" className="btn-ghost nav" disabled={playing || step >= doneSteps} onClick={() => goStep(step + 1)} aria-label="다음 단계">▶</button>
          </div>
        )}
        {mode === "project" && onReport && !finished && cur && (
          <div className="report-row">
            {reported.includes(step + 1) ? <span className="sent">✓ 실물 완료를 보냈어요</span>
              : <button type="button" className="btn-ghost" disabled={doneSteps <= step} onClick={() => onReport(step + 1, `3D 작업대 ${step + 1}단계(${cur.title})를 실물로 마쳤어요.`)}>✋ 실제로 했어요</button>}
            <span className="muted-s">{doneSteps <= step ? "화면에서 먼저 해 보면 눌러져요" : "실물로 마쳤으면 눌러요"}</span>
          </div>
        )}
        {!finished && <p className="tap-hint">{challenge ? "직접 하기: 손으로 한 동작씩 해요. 막히면 ‘직접’을 끄고 ‘보여줘’" : "빛나는 곳을 누르거나 ‘보여줘’"} · 실물: {cur?.doneWhen}</p>}
      </section>
      {holdUi && <HoldRing x={holdUi.x} y={holdUi.y} start={holdUi.start} />}

      {intro && ready && (
        <div className="bench-sheet intro" role="dialog" aria-label="시작 전 안내">
          <h2>{kit.title}</h2>
          <p className="sub">{kit.subtitle}</p>
          <h3>배우는 것</h3>
          <ul>{kit.learn.map((l) => <li key={l}>{l}</li>)}</ul>
          <h3>준비물</h3>
          <p className="tools">{kit.tools.join(" · ")}</p>
          <h3>안전</h3>
          <ul className="safety">{kit.safety.map((l) => <li key={l}>{l}</li>)}</ul>
          <button type="button" className="btn-main wide" onClick={begin}>책상에 앉기</button>
        </div>
      )}

      {drawer && (
        <div className="bench-sheet hw" role="dialog" aria-label="HW 달그락에게 묻기">
          <div className="hw-head"><b>HW 달그락</b><button type="button" className="x" onClick={() => setDrawer(false)} aria-label="닫기">×</button></div>
          <p className="ctx">{contextLine}</p>
          <div className="chat">
            <p className="hw-msg">{mode === "project" ? "지금 이 단계 보고 있어. 뭐가 이상해? 사진이 있으면 같이 보내 줘." : "지금 어디서 막혔어? 아래에서 골라 봐."}</p>
            {chat.map((m, i) => <p key={i} className={m.who === "me" ? "me-msg" : "hw-msg"}>{m.text}</p>)}
            {asking && <p className="hw-msg typing">HW 달그락이 보고 있어요…</p>}
          </div>
          {terms.length > 0 && <div className="quick terms" aria-label="말 뜻 묻기">{terms.map((e) => <button key={e.term} type="button" onClick={() => ask(`‘${e.term}’ 뜻이 뭐예요?`, e.short)}>ⓘ {e.term} 뜻?</button>)}</div>}
          {mode === "project" && connectorOnly ? <>
            <div className="quick">{kit.faq.map((f) => <button key={f.q} type="button" onClick={() => copyAsk(f.q)}>{f.q}</button>)}</div>
            <p className="note">대화는 내 Claude에서 해요. 위 문구를 누르면 지금 단계가 담긴 질문이 복사돼요. 내 Claude에 붙여 넣고 사진도 같이 보내 주세요.{copied ? " ✓ 복사했어요" : ""}</p>
          </> : mode === "project" && onAsk ? <>
            <div className="quick">{kit.faq.map((f) => <button key={f.q} type="button" disabled={asking} onClick={() => askReal(f.q)}>{f.q}</button>)}</div>
            {photos.length > 0 && <div className="photos">{photos.map((p, i) => <img key={i} src={p.dataUrl} alt={p.name} />)}<button type="button" onClick={() => setPhotos([])}>지우기</button></div>}
            <form className="ask" onSubmit={(e) => { e.preventDefault(); void askReal(askText); }}>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => void addPhotos(e.target.files)} />
              <button type="button" className="clip" aria-label="사진 첨부" onClick={() => fileRef.current?.click()}>📷</button>
              <input value={askText} onChange={(e) => setAskText(e.target.value)} placeholder="예: 5V 핀 납땜이 회색이에요" aria-label="HW 달그락에게 보낼 말" />
              <button type="submit" className="send" disabled={asking || !askText.trim()}>보내기</button>
            </form>
            <p className="note">대화는 HW 작업실에 기록되고 팀이 같이 봐요.</p>
          </> : <>
            <div className="quick">{kit.faq.map((f) => <button key={f.q} type="button" onClick={() => ask(f.q, f.a)}>{f.q}</button>)}</div>
            <p className="note">연습에서는 정해진 답만 해요. 실제 프로젝트에서는 납땜 사진을 올리면 HW 달그락이 직접 보고 답해요.</p>
          </>}
        </div>
      )}
    </div>
  );
}
