"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BenchKit, BenchView } from "../../lib/bench/types";
import type { BenchApi, MistakeKind } from "./bench-scene";

type Motion = "idle" | "tilt" | "stoke" | "blaze" | "fallen";
import "./bench.css";

// 3D 조립 책상 화면 (명세서 2차 v0.1 §1·§4·§5). 연습 키트와 프로젝트 조립이 같이 쓴다.
// 장면은 bench-scene.ts가 그리고, 여기서는 단계·버튼·달그락 말풍선·HW 서랍을 다룬다.

type Props = { kit: BenchKit; hue?: number; mode: "practice" | "project"; backHref: string; onFinish?: () => void };

const VIEWS: Array<[BenchView, string]> = [["34", "3/4"], ["top", "위"], ["bottom", "아래"], ["front", "앞"]];
const PRAISE = ["좋아! 반짝이는 원뿔이야", "깔끔해!", "그렇지, 그거야", "손이 빠른데?", "대장장이 다 됐네"];

function strong(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((s, i) => (s.startsWith("**") ? <b key={i}>{s.slice(2, -2)}</b> : <span key={i}>{s}</span>));
}
function s0Saved() { try { return (JSON.parse(localStorage.getItem("bench:" + (location.pathname.split("/").pop() ?? "")) ?? "null") as { step: number } | null)?.step ?? 0; } catch { return 0; } }
function fmt(sec: number) { return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`; }

export default function BenchViewScreen({ kit, hue = 0, mode, backHref, onFinish }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const api = useRef<BenchApi | null>(null);
  const storeKey = `bench:${kit.id}`;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState(0);
  const [doneSteps, setDoneSteps] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [challenge, setChallenge] = useState(false);
  const [view, setView] = useState<BenchView>(kit.steps[0]?.view ?? "34");
  const [bubble, setBubble] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
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

  const advance = useCallback(() => {
    const s = stepRef.current;
    if (!api.current || s >= total) return;
    setPlaying(true); setFeedback(null); setMistake(null); wrong.current = 0;
    if (kit.steps[s]?.ops.some((o) => o.op === "solder" || o.op === "bridge")) motion("stoke", false);
    api.current.play().then(() => {
      setPlaying(false);
      const next = s + 1;
      setDoneSteps((d) => Math.max(d, next));
      motion("blaze");
      say(next >= total ? "완성! 진짜 잘했어 🔥" : PRAISE[s % PRAISE.length], 2200);
      try { localStorage.setItem(storeKey, JSON.stringify({ step: next })); } catch { /* 무시 */ }
      if (next >= total) {
        setFinished(true);
        try { const done = JSON.parse(localStorage.getItem("dalgeurak_practice") ?? "{}"); done[kit.id] = new Date().toISOString(); localStorage.setItem("dalgeurak_practice", JSON.stringify(done)); } catch { /* 무시 */ }
        onFinish?.();
        return;
      }
      window.setTimeout(() => { setStep(next); api.current?.goto(next); setView(kit.steps[next].view); }, 950);
    });
  }, [kit, total, say, storeKey, onFinish]);

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
            onTarget: (ok, message) => {
              if (ok) { advance(); return; }
              wrong.current += 1;
              setFeedback({ ok: false, text: message ?? "거기가 아니야" });
              if (wrong.current >= 3) { motion("fallen"); say("같이 보자! 힌트를 눌러 봐", 3200); wrong.current = 0; }
              else motion("tilt");
            },
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
  // 카드에 가리지 않는 띠에 장면이 오도록 알려 준다
  useEffect(() => {
    if (!ready) return;
    const measure = () => {
      const H = window.innerHeight, W = window.innerWidth;
      const panel = document.querySelector(".bench-panel") as HTMLElement | null;
      const root = document.querySelector(".bench") as HTMLElement | null;
      if (panel && root) root.style.setProperty("--panel-real", `${Math.ceil(panel.getBoundingClientRect().height)}px`);
      const top = topRef.current?.getBoundingClientRect().bottom ?? 0;
      const low = (lowRef.current?.getBoundingClientRect().top ?? H);
      if (W >= 900) api.current?.setInsets(0, 0, 0, 424); else api.current?.setInsets(top + 4, H - low + 6);
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
    setStep(i); setFeedback(null); setMistake(null); api.current?.goto(i); setView(kit.steps[i].view);
  }
  function pickView(v: BenchView) { setView(v); api.current?.setView(v); }
  function toggleMistake(k: MistakeKind) { const next = mistake === k ? null : k; setMistake(next); api.current?.mistake(next); if (next) motion("tilt"); }
  function toggleLight() { const on = !light; setLight(on); api.current?.setLight(on); try { localStorage.setItem("bench_light", on ? "1" : "0"); } catch { /* 무시 */ } }
  function restart() { try { localStorage.removeItem(storeKey); } catch { /* 무시 */ } setFinished(false); setDoneSteps(0); setStep(0); setStarted(Date.now()); api.current?.goto(0); setView(kit.steps[0].view); }
  function ask(q: string, a: string) { setChat((c) => [...c, { who: "me", text: q }, { who: "hw", text: a }]); motion("stoke"); }

  const elapsed = started ? (now - started) / 1000 : 0;
  const pct = Math.round((doneSteps / total) * 100);
  const contextLine = `[${mode === "practice" ? "연습" : "조립"} · ${kit.title} · ${Math.min(step + 1, total)}/${total} · ${cur?.title ?? "완료"}]`;

  return (
    <div className={`bench ${drawer ? "drawer-open" : ""}`}>
      <div className="bench-stage" ref={mount} aria-label="3D 조립 책상. 드래그로 돌리고, 두 손가락으로 확대해요." role="img" />
      {!ready && !failed && <div className="bench-loading"><span className="spin" />작업대를 펼치는 중…</div>}
      {failed && <div className="bench-loading">이 기기에서는 3D를 열 수 없어요. 아래 단계 설명을 따라 해 보세요.</div>}

      <header className="bench-top" ref={topRef}>
        <a className="bench-brand" href={backHref} aria-label="돌아가기">← 달그락</a>
        <div className="bench-card">
          <div className="eyebrow"><span>{mode === "practice" ? "미리 만들어보기" : "조립 가이드"}</span><span>{String(Math.min(step + 1, total)).padStart(2, "0")} / {String(total).padStart(2, "0")}</span></div>
          <h1>{kit.title}</h1>
          <p className="sub">{kit.subtitle}</p>
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

      <section className="bench-panel" aria-live="polite">
        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="count"><span><b>{doneSteps}</b> / {total} 완료</span><span>{fmt(elapsed)}</span></div>

        {finished ? (
          <div className="step-box done">
            <div className="phase">완성</div>
            <p className="action">LED가 켜졌어요! 🔥 이 손 기술은 내 대장간 연장 걸이에 걸어 둘게요.</p>
            <p className="why">실제 프로젝트에서는 HW 달그락이 같은 화면으로 내 설계도대로 안내해요.</p>
            <div className="row"><button type="button" className="btn-main" onClick={() => (window.location.href = backHref)}>돌아가기</button><button type="button" className="btn-ghost" onClick={restart}>처음부터</button></div>
          </div>
        ) : cur && (
          <div className="step-box">
            <div className="phase">STEP {step + 1} OF {total} · {cur.phase}</div>
            <p className="action">{strong(cur.action)}</p>
            <p className="why">{cur.why}</p>
            {cur.caution && <p className="caution">⚠ {cur.caution}</p>}
            {feedback && <p className={`feedback ${feedback.ok ? "ok" : "no"}`}>{feedback.text}</p>}
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
          <div className="actions">
            <button type="button" className="btn-ghost" disabled={!ready || playing} onClick={() => { api.current?.hint(); say(cur?.tapHint ?? "", 2600); }}>💡 힌트</button>
            <button type="button" className="btn-main" disabled={!ready || playing} onClick={advance}>{playing ? "하는 중…" : "보여줘"}</button>
            <button type="button" className={`toggle ${challenge ? "on" : ""}`} aria-pressed={challenge} onClick={() => setChallenge((c) => !c)}><span className="sw" />직접 하기</button>
            <button type="button" className="btn-ghost" disabled={playing || step === 0} onClick={() => goStep(step - 1)} aria-label="이전 단계">◀</button>
            <button type="button" className="btn-ghost" disabled={playing || step >= doneSteps} onClick={() => goStep(step + 1)} aria-label="다음 단계">▶</button>
          </div>
        )}
        {!finished && <p className="tap-hint">{challenge ? "직접 하기: 장면에서 맞는 곳을 눌러요" : "빛나는 곳을 누르거나 ‘보여줘’"} · 실물: {cur?.doneWhen}</p>}
      </section>

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
            <p className="hw-msg">지금 어디서 막혔어? 아래에서 골라 봐.</p>
            {chat.map((m, i) => <p key={i} className={m.who === "me" ? "me-msg" : "hw-msg"}>{m.text}</p>)}
          </div>
          <div className="quick">{kit.faq.map((f) => <button key={f.q} type="button" onClick={() => ask(f.q, f.a)}>{f.q}</button>)}</div>
          <p className="note">{mode === "practice" ? "연습에서는 정해진 답만 해요. 실제 프로젝트에서는 납땜 사진을 올리면 HW 달그락이 직접 보고 답해요." : "사진을 첨부하면 HW 달그락이 직접 보고 답해요."}</p>
        </div>
      )}
    </div>
  );
}
