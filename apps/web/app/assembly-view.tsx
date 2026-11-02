"use client";
import { useEffect, useState } from "react";
import type { AssemblyGuide, AssemblyReport } from "../lib/project-types";

// Plays the assembly guide on the real board footprint: parts placed in the
// current step slide in and its wires draw themselves; earlier steps stay.
export function AssemblyView({ guide, reports, busy, onAction }: { guide: AssemblyGuide; reports: AssemblyReport[]; busy: boolean; onAction: (input: Record<string, unknown>) => void }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [replay, setReplay] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const current = guide.steps[step];
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => { if (step < guide.steps.length - 1) setStep(step + 1); else setPlaying(false); }, 4500);
    return () => clearTimeout(timer);
  }, [playing, step, guide.steps.length]);

  const placedAt = new Map<string, number>();
  guide.steps.forEach((s, i) => s.place.forEach((ref) => { if (!placedAt.has(ref)) placedAt.set(ref, i); }));
  const parts = guide.parts.filter((part) => (placedAt.get(part.ref) ?? 0) <= step);
  const pinPoint = (end: string): [number, number] | null => {
    const [ref, pin] = end.split(".");
    const part = guide.parts.find((p) => p.ref === ref);
    const found = part?.pins?.find((p) => p.name === pin);
    return part && found ? [part.x + found.x, part.y + found.y] : null;
  };
  const wires = guide.steps.slice(0, step + 1).flatMap((s, i) => s.wires.map((wire) => ({ ...wire, fresh: i === step })));
  const activePins = new Set(current.wires.flatMap((wire) => [wire.from, wire.to]));
  const margin = 8;
  const { width: W, height: H } = guide.base;
  const holes = guide.base.kind === "breadboard" || guide.base.kind === "perfboard";
  const stepReports = reports.filter((r) => r.step === step + 1);
  const send = (cardId: string | null, key: string, fallback?: string) => {
    const text = (answers[key] ?? "").trim() || fallback;
    if (!text) return;
    onAction({ action: "assembly_report", step: step + 1, ...(cardId ? { cardId } : {}), text });
    setAnswers({ ...answers, [key]: "" });
  };

  return <div className="assembly-view">
    <div className="artifact-title"><span className="pill">조립 가이드</span><h3>{guide.stage}</h3></div>
    <div className="view-toolbar"><span>{guide.base.name} · {W}×{H}mm 실제 크기 비율</span><button onClick={() => setReplay(replay + 1)}>↺ 다시 보기</button></div>
    <svg key={`${step}-${replay}`} className="assembly-canvas" viewBox={`${-margin} ${-margin} ${W + margin * 2} ${H + margin * 2}`} role="img" aria-label={`${step + 1}단계 배치도`}>
      <rect x={0} y={0} width={W} height={H} rx={guide.base.kind === "breadboard" ? 2 : 1.5} fill={guide.base.kind === "board" || guide.base.kind === "stack" ? "#2f6f5e" : "#f4f2ea"} stroke="#9aa59f" strokeWidth={0.4} />
      {holes && Array.from({ length: Math.floor(W / 2.54) }, (_, i) => Array.from({ length: Math.floor(H / 2.54) }, (_, j) => <circle key={`${i}-${j}`} cx={1.27 + i * 2.54} cy={1.27 + j * 2.54} r={0.35} fill="#c9c6bb" />))}
      {guide.base.kind === "breadboard" && <><line x1={2} x2={W - 2} y1={2.2} y2={2.2} stroke="#d64545" strokeWidth={0.3} /><line x1={2} x2={W - 2} y1={H - 2.2} y2={H - 2.2} stroke="#3a5fbf" strokeWidth={0.3} /></>}
      {parts.map((part) => {
        const fresh = placedAt.get(part.ref) === step;
        return <g key={part.ref} className={fresh ? "assembly-fresh" : ""}>
          <rect x={part.x} y={part.y} width={part.width} height={part.height} rx={0.8} fill={part.color ?? "#2e786b"} stroke={fresh ? "#e0a43a" : "#1f3b34"} strokeWidth={fresh ? 0.7 : 0.3} />
          <text x={part.x + part.width / 2} y={part.y + part.height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(3.2, part.width / 5)} fill="#fff" fontWeight={700}>{part.ref}</text>
          {(part.pins ?? []).map((pin) => { const on = activePins.has(`${part.ref}.${pin.name}`); return <g key={pin.name}><circle cx={part.x + pin.x} cy={part.y + pin.y} r={on ? 0.9 : 0.5} fill={on ? "#e0a43a" : "#d8d2b0"} />{on && <text x={part.x + pin.x} y={part.y + pin.y - 1.6} textAnchor="middle" fontSize={2} fill="#7a4a00">{pin.name}</text>}</g>; })}
          <title>{part.ref} · {part.label} ({part.width}×{part.height}mm)</title>
        </g>;
      })}
      {wires.map((wire, i) => {
        const a = pinPoint(wire.from); const b = pinPoint(wire.to);
        if (!a || !b) return null;
        const mid: [number, number] = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 4];
        return <path key={i} className={wire.fresh ? "assembly-wire-fresh" : ""} pathLength={1} d={`M${a[0]},${a[1]} Q${mid[0]},${mid[1]} ${b[0]},${b[1]}`} fill="none" stroke={wire.color} strokeWidth={wire.fresh ? 0.9 : 0.6} strokeLinecap="round" opacity={wire.fresh ? 1 : 0.7}><title>{wire.label ?? `${wire.from} → ${wire.to}`}</title></path>;
      })}
    </svg>
    <div className="assembly-controls">
      <button disabled={step === 0} onClick={() => { setPlaying(false); setStep(step - 1); }}>◀ 이전</button>
      <button className="primary" onClick={() => { if (!playing && step === guide.steps.length - 1) setStep(0); setPlaying(!playing); }}>{playing ? "⏸ 멈춤" : "▶ 전체 재생"}</button>
      <button disabled={step === guide.steps.length - 1} onClick={() => { setPlaying(false); setStep(step + 1); }}>다음 ▶</button>
      <span>{step + 1} / {guide.steps.length}</span>
    </div>
    <ol className="assembly-steps">{guide.steps.map((s, i) => <li key={i} className={i === step ? "current" : i < step ? "done" : ""}><button onClick={() => { setPlaying(false); setStep(i); }}>{s.title}</button></li>)}</ol>
    <section className="assembly-step">
      <h4>{step + 1}단계 · {current.title}</h4>
      <p>{current.action}</p>
      {current.wires.length > 0 && <ul className="wire-list">{current.wires.map((wire, i) => <li key={i}><span style={{ background: wire.color }} />{wire.from} → {wire.to}{wire.label ? ` · ${wire.label}` : ""}</li>)}</ul>}
      <p className="assembly-check"><b>확인</b> {current.check}</p>
      <div className="evidence-input"><textarea aria-label={`${step + 1}단계 결과`} placeholder="다 했으면 결과를 적어주세요 (예: LED가 1초마다 깜빡여요)" value={answers.step ?? ""} onChange={(e) => setAnswers({ ...answers, step: e.target.value })} /><button disabled={busy} onClick={() => send(null, "step", "이 단계를 마쳤어요.")}>이 단계 완료 보내기</button></div>
    </section>
    {current.cards.length > 0 && <section className="trouble-cards"><h4>문제가 생기면</h4>{current.cards.map((card) => <article key={card.id} className="trouble-card">
      <strong>⚠ {card.symptom}</strong>
      <p><b>확인</b> {card.check}</p>
      <p><b>정상이면</b> {card.expected}</p>
      <p><b>아니면</b> {card.ifNot}</p>
      <div className="evidence-input"><textarea aria-label={`${card.symptom} 확인 결과`} placeholder="측정값이나 본 것을 적어주세요 (예: 3.1V)" value={answers[card.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [card.id]: e.target.value })} /><button disabled={busy || !(answers[card.id] ?? "").trim()} onClick={() => send(card.id, card.id)}>확인 결과 보내기</button></div>
    </article>)}</section>}
    {stepReports.length > 0 && <section className="assembly-reports"><h4>보낸 결과</h4>{stepReports.map((r, i) => <p key={i}><small>{new Date(r.createdAt).toLocaleString("ko-KR")}</small> {r.cardId ? `[${r.cardId}] ` : ""}{r.text}</p>)}<p className="muted">보낸 결과는 Claude가 get_project로 읽고 원인을 함께 좁혀요.</p></section>}
  </div>;
}
