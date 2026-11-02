"use client";
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import type { AssemblyPart, LocalProject } from "../lib/project-types";
import { findCard, type PartCard } from "../lib/parts/catalog";
import { resolvePin } from "../lib/parts/rules";
import { judgeReading, libraryCardsForStep, type ExpectedRange } from "../lib/parts/trouble-cards";
import { stepBasis, wireLengths } from "../lib/assembly-utils";
import wokwiSizes from "../lib/parts/wokwi-pins.json";

const MM = 3.7795; // CSS px per mm; Wokwi elements are sized in mm.
const RED = "#d64545", BLACK = "#222222";

type Placed = { part: AssemblyPart; card: PartCard | null; tag: string | null; w: number; h: number };

function rotatePoint(x: number, y: number, w: number, h: number, rotation: number): [number, number] {
  const cx = w / 2, cy = h / 2, dx = x - cx, dy = y - cy;
  const r = (rotation * Math.PI) / 180;
  return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
}

function rangeText(range: ExpectedRange | null): string {
  if (!range) return "정상 범위 확인 필요";
  if (range.kind === "boolean") return range.expect;
  if (range.kind !== "number") return "회로 값 기준";
  const fmt = (v: number) => range.unit === "Ω" && v >= 1000 ? (v >= 1e6 ? `${v / 1e6}M` : `${v / 1000}k`) : `${v}`;
  return range.min != null && range.max != null ? `${fmt(range.min)}~${fmt(range.max)}${range.unit}` : range.min != null ? `${fmt(range.min)}${range.unit} 이상` : `${fmt(range.max!)}${range.unit} 이하`;
}

export function AssemblyView({ project, busy, onAction }: { project: LocalProject; busy: boolean; onAction: (input: Record<string, unknown>) => void }) {
  const guide = project.assembly!;
  const reports = project.assemblyReports ?? [];
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [replay, setReplay] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(1);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [readings, setReadings] = useState<Record<string, { value: string; yes: boolean | null }>>({});
  const [showDetail, setShowDetail] = useState(false);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const current = guide.steps[step];
  const blocked = (project.build?.checks ?? []).filter((c) => c.severity === "blocked");

  // Wokwi custom elements need the browser; load them once on the client.
  useEffect(() => { let alive = true; import("@wokwi/elements").then(() => { if (alive) setReady(true); }).catch(() => {}); return () => { alive = false; }; }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => { if (step < guide.steps.length - 1) setStep(step + 1); else setPlaying(false); }, 4500);
    return () => clearTimeout(timer);
  }, [playing, step, guide.steps.length]);
  useEffect(() => { try { const saved = localStorage.getItem(`forge-ticks-${project.id}`); if (saved) setTicks(JSON.parse(saved)); } catch { /* browser storage is optional */ } }, [project.id]);
  const tick = (key: string) => { const next = { ...ticks, [key]: !ticks[key] }; setTicks(next); try { localStorage.setItem(`forge-ticks-${project.id}`, JSON.stringify(next)); } catch { /* optional */ } };

  const margin = 8;
  const { width: W, height: H } = guide.base;
  useEffect(() => {
    const el = frame.current; if (!el) return;
    const measure = () => setFit(Math.min(1.6, (el.clientWidth - 4) / ((W + margin * 2) * MM)));
    measure(); const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect();
  }, [W]);

  const components = project.build?.blueprint.components ?? [];
  const nets = project.build?.blueprint.nets ?? [];
  const placed: Placed[] = useMemo(() => guide.parts.map((part) => {
    const card = findCard(part.catalogId ?? components.find((c) => c.ref === part.ref)?.catalogId);
    const tag = card?.renderer.type === "wokwi" ? card.renderer.ref : null;
    const size = tag ? (wokwiSizes as Record<string, { widthMm: number; heightMm: number }>)[tag.replace(/^wokwi-/, "")] : null;
    return { part, card, tag, w: size?.widthMm ?? part.width, h: size?.heightMm ?? part.height };
  }), [guide.parts, components]);
  const placedAt = new Map<string, number>();
  guide.steps.forEach((s, i) => s.place.forEach((ref) => { if (!placedAt.has(ref)) placedAt.set(ref, i); }));
  const visible = placed.filter((p) => (placedAt.get(p.part.ref) ?? 0) <= step);

  const pinPoint = (end: string): [number, number] | null => {
    const [ref, ...rest] = end.split(".");
    const pin = rest.join(".");
    const p = placed.find((item) => item.part.ref === ref);
    if (!p) return null;
    const cp = p.card ? resolvePin(p.card, pin) : null;
    const local = cp && cp.xMm != null && cp.yMm != null ? [cp.xMm, cp.yMm] : p.part.pins?.find((x) => x.name === pin) ? [p.part.pins.find((x) => x.name === pin)!.x, p.part.pins.find((x) => x.name === pin)!.y] : null;
    if (!local) return null;
    const [rx, ry] = rotatePoint(local[0], local[1], p.w, p.h, p.part.rotation ?? 0);
    return [p.part.x + rx, p.part.y + ry];
  };
  const wireColor = (from: string, to: string, given: string) => {
    const net = nets.find((n) => n.members.includes(from) || n.members.includes(to));
    return net?.kind === "power" ? RED : net?.kind === "ground" ? BLACK : given;
  };
  const wires = guide.steps.slice(0, step + 1).flatMap((s, i) => s.wires.map((wire) => ({ ...wire, fresh: i === step, stroke: wireColor(wire.from, wire.to, wire.color) })));
  const activePins = new Set(current.wires.flatMap((w) => [w.from, w.to]));
  const fallbacks = placed.filter((p) => !p.tag);
  const library = libraryCardsForStep(project, step);
  const lengths = wireLengths(project, step);
  const detail = (project.assemblyDetails ?? []).find((d) => d.step === step + 1);
  const stale = detail && detail.basis !== stepBasis(project, step);
  const pending = (project.assemblyRequests ?? []).find((r) => r.step === step + 1 && !r.doneAt);
  const stepReports = reports.filter((r) => r.step === step + 1);
  const scale = fit * zoom;
  const holes = guide.base.kind === "breadboard" || guide.base.kind === "perfboard";

  const sendText = (cardId: string | null, key: string, fallback?: string) => {
    const text = (answers[key] ?? "").trim() || fallback;
    if (!text) return;
    onAction({ action: "assembly_report", step: step + 1, ...(cardId ? { cardId } : {}), text });
    setAnswers({ ...answers, [key]: "" });
  };

  return <div className="assembly-view">
    <div className="artifact-title"><span className="pill">조립 가이드</span><h3>{guide.stage}</h3></div>
    {blocked.length > 0 && <p className="notice danger-notice">회로에 꼭 고쳐야 할 문제가 있어 조립을 진행할 수 없어요: {blocked.map((c) => c.message).join(" / ")}</p>}
    <div className="view-toolbar"><span>{guide.base.name} · {W}×{H}mm 실제 비율</span><button aria-label="축소" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}>−</button><button onClick={() => setZoom(1)}>맞춤</button><button aria-label="확대" onClick={() => setZoom(Math.min(3, zoom + 0.25))}>＋</button><button onClick={() => setReplay(replay + 1)}>↺</button></div>
    <div className="assembly-frame" ref={frame}>
      <div className="assembly-scaler" style={{ width: (W + margin * 2) * MM * scale, height: (H + margin * 2) * MM * scale }}>
        <div key={`${step}-${replay}`} className="assembly-stage" style={{ width: `${W + margin * 2}mm`, height: `${H + margin * 2}mm`, transform: `scale(${scale})` }}>
          <svg className="assembly-layer" viewBox={`${-margin} ${-margin} ${W + margin * 2} ${H + margin * 2}`} aria-hidden="true">
            <rect x={0} y={0} width={W} height={H} rx={2} fill={guide.base.kind === "board" || guide.base.kind === "stack" ? "#2f6f5e" : "#f4f2ea"} stroke="#9aa59f" strokeWidth={0.4} />
            {holes && Array.from({ length: Math.floor(W / 2.54) }, (_, i) => Array.from({ length: Math.floor(H / 2.54) }, (_, j) => <circle key={`${i}-${j}`} cx={1.27 + i * 2.54} cy={1.27 + j * 2.54} r={0.35} fill="#c9c6bb" />))}
            {guide.base.kind === "breadboard" && <><line x1={2} x2={W - 2} y1={2.2} y2={2.2} stroke={RED} strokeWidth={0.3} /><line x1={2} x2={W - 2} y1={H - 2.2} y2={H - 2.2} stroke="#3a5fbf" strokeWidth={0.3} /></>}
            {visible.filter((p) => !p.tag).map((p) => <g key={p.part.ref} className={placedAt.get(p.part.ref) === step ? "assembly-fresh" : ""} transform={`rotate(${p.part.rotation ?? 0} ${p.part.x + p.w / 2} ${p.part.y + p.h / 2})`}>
              <rect x={p.part.x} y={p.part.y} width={p.w} height={p.h} rx={0.8} fill={p.part.color ?? "#5b6b66"} stroke="#e0a43a" strokeDasharray="1 0.8" strokeWidth={0.4} />
              <text x={p.part.x + p.w / 2} y={p.part.y + p.h / 2 - 1} textAnchor="middle" fontSize={Math.min(3, p.w / 5)} fill="#fff" fontWeight={700}>{p.part.ref}</text>
              <text x={p.part.x + p.w / 2} y={p.part.y + p.h / 2 + 2.4} textAnchor="middle" fontSize={1.8} fill="#ffe2a8">대체 표시</text>
            </g>)}
          </svg>
          {ready && visible.filter((p) => p.tag).map((p) => {
            const fresh = placedAt.get(p.part.ref) === step;
            return <div key={p.part.ref} className={"wokwi-slot " + (fresh ? "assembly-fresh current-part" : step > (placedAt.get(p.part.ref) ?? 0) ? "past-part" : "")} style={{ left: `${margin + p.part.x}mm`, top: `${margin + p.part.y}mm`, width: `${p.w}mm`, height: `${p.h}mm`, transform: `rotate(${p.part.rotation ?? 0}deg)` }} title={`${p.part.ref} · ${p.card?.model ?? p.part.label}`}>
              {createElement(p.tag!, p.tag === "wokwi-led" ? { color: p.part.color === "#2e7bd6" ? "blue" : "red" } : {})}
            </div>;
          })}
          <svg className="assembly-layer wires" viewBox={`${-margin} ${-margin} ${W + margin * 2} ${H + margin * 2}`} aria-hidden="true">
            {wires.map((wire, i) => {
              const a = pinPoint(wire.from), b = pinPoint(wire.to);
              if (!a || !b) return null;
              const mid: [number, number] = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 4];
              return <path key={i} className={wire.fresh ? "assembly-wire-fresh" : ""} pathLength={1} d={`M${a[0]},${a[1]} Q${mid[0]},${mid[1]} ${b[0]},${b[1]}`} fill="none" stroke={wire.stroke} strokeWidth={wire.fresh ? 0.9 : 0.6} strokeLinecap="round" opacity={wire.fresh ? 1 : 0.6} />;
            })}
            {[...activePins].map((end) => { const p = pinPoint(end); return p ? <g key={end}><circle cx={p[0]} cy={p[1]} r={0.9} fill="#e0a43a" /><text x={p[0]} y={p[1] - 1.6} textAnchor="middle" fontSize={2} fill="#7a4a00">{end.split(".").slice(1).join(".")}</text></g> : null; })}
          </svg>
        </div>
      </div>
    </div>
    {fallbacks.length > 0 && <p className="notice">대체 표시: {fallbacks.map((p) => `${p.part.ref}(${p.card?.model ?? p.part.label})`).join(", ")}는 실제 모양이 아직 준비되지 않아 사각형으로 보여요. 핀 위치는 {fallbacks.some((p) => p.card?.pins.length) ? "부품 카드" : "가이드"} 기준이니, 판매 페이지 사진과 핀 이름으로 방향을 확인하세요.</p>}
    <div className="assembly-controls">
      <button disabled={step === 0} onClick={() => { setPlaying(false); setStep(step - 1); setShowDetail(false); }}>◀ 이전</button>
      <button className="primary" onClick={() => { if (!playing && step === guide.steps.length - 1) setStep(0); setPlaying(!playing); }}>{playing ? "⏸ 멈춤" : "▶ 전체 재생"}</button>
      <button disabled={step === guide.steps.length - 1} onClick={() => { setPlaying(false); setStep(step + 1); setShowDetail(false); }}>다음 ▶</button>
      <span>{step + 1} / {guide.steps.length}</span>
    </div>
    <ol className="assembly-steps">{guide.steps.map((s, i) => <li key={i} className={i === step ? "current" : reports.some((r) => r.step === i + 1 && !r.cardId) ? "done" : ""}><button onClick={() => { setPlaying(false); setStep(i); setShowDetail(false); }}>{s.title}</button></li>)}</ol>
    <section className="assembly-step">
      <h4>{step + 1}단계 · {current.title}</h4>
      <p>{current.action}</p>
      {current.wires.length > 0 && <ul className="wire-list">{current.wires.map((wire, i) => { const len = lengths.find((l) => l.from === wire.from && l.to === wire.to); return <li key={i}><span style={{ background: wireColor(wire.from, wire.to, wire.color) }} />{wire.from} → {wire.to}{wire.label ? ` · ${wire.label}` : ""}{len ? <small> · 선 약 {len.suggestedMm}mm (핀 사이 {len.directMm}mm + 여유)</small> : null}</li>; })}</ul>}
      <p className="assembly-check"><b>확인</b> {current.check}</p>
      <button className="detail-toggle" aria-expanded={showDetail} onClick={() => setShowDetail(!showDetail)}>{showDetail ? "⌄" : "›"} 더 잘게 보기</button>
      {showDetail && <div className="detail-box">
        {detail ? <>
          {stale && <p className="notice">회로나 이 단계가 바뀌어 세부 단계가 오래됐어요. 다시 요청해주세요.</p>}
          <ol className="substeps">{detail.substeps.map((sub) => <li key={sub.id}>
            <strong>{sub.action}</strong>
            {(sub.materials.length > 0 || sub.tools.length > 0) && <small>{sub.materials.length ? `재료: ${sub.materials.join(", ")}` : ""}{sub.materials.length && sub.tools.length ? " · " : ""}{sub.tools.length ? `도구: ${sub.tools.join(", ")}` : ""}</small>}
            {sub.caution && <small className="caution">⚠ {sub.caution}</small>}
            <small>완료: {sub.doneWhen}{sub.checkMethod ? ` · 확인: ${sub.checkMethod}` : ""}</small>
            <span className="repeat-ticks">{Array.from({ length: sub.repeatCount }, (_, k) => <label key={k}><input type="checkbox" checked={!!ticks[`${sub.id}-${k}`]} onChange={() => tick(`${sub.id}-${k}`)} />{sub.repeatCount > 1 ? `${k + 1}` : "완료"}</label>)}{sub.repeatCount > 1 && <b>×{sub.repeatCount}</b>}</span>
          </li>)}</ol>
        </> : <p className="muted">아직 세부 단계가 없어요.</p>}
        {pending ? <p className="muted">{pending.level === "micro" ? "한 동작 단위" : "초보자용"} 세부 단계를 요청했어요. Claude에게 “이어서 해줘”라고 하면 만들어요.</p>
          : <div className="detail-actions"><button disabled={busy} onClick={() => onAction({ action: "detail_request", step: step + 1, level: "beginner" })}>초보자용으로 나눠 달라고 요청</button><button disabled={busy} onClick={() => onAction({ action: "detail_request", step: step + 1, level: "micro" })}>한 동작 단위로 요청</button></div>}
      </div>}
      <div className="evidence-input"><textarea aria-label={`${step + 1}단계 결과`} placeholder="다 했으면 결과를 적어주세요 (예: LED가 1초마다 깜빡여요)" value={answers.step ?? ""} onChange={(e) => setAnswers({ ...answers, step: e.target.value })} /><button disabled={busy || blocked.length > 0} onClick={() => sendText(null, "step", "이 단계를 마쳤어요.")}>이 단계 완료 보내기</button></div>
    </section>
    {(library.length > 0 || current.cards.length > 0) && <section className="trouble-cards"><h4>문제가 생기면</h4>
      {library.map((card) => {
        const r = readings[card.libId] ?? { value: "", yes: null };
        const judged = judgeReading(card.resolvedRange, r.value === "" ? null : Number(r.value), r.yes);
        return <article key={card.libId} className="trouble-card">
          <strong>⚠ {card.symptom}</strong>
          <p><b>원인 후보</b> {card.cause}</p>
          <p><b>확인</b> {card.checkMethod}{card.meterMode ? <span className="pill">{card.meterMode}</span> : null}</p>
          <p><b>재는 곳</b> {card.probe}</p>
          <p><b>정상</b> {rangeText(card.resolvedRange)} {card.sourceUrl ? <a href={card.sourceUrl} target="_blank" rel="noreferrer noopener">출처</a> : <small>(출처 없는 확인 항목)</small>}</p>
          {card.resolvedRange?.kind === "number" ? <label className="reading">측정값 <input type="number" inputMode="decimal" step="any" value={r.value} onChange={(e) => setReadings({ ...readings, [card.libId]: { ...r, value: e.target.value } })} /> {card.resolvedRange.unit}</label>
            : card.resolvedRange?.kind === "boolean" ? <div className="reading"><button className={r.yes === true ? "on" : ""} onClick={() => setReadings({ ...readings, [card.libId]: { ...r, yes: true } })}>네, 그래요</button><button className={r.yes === false ? "on" : ""} onClick={() => setReadings({ ...readings, [card.libId]: { ...r, yes: false } })}>아니요</button></div>
            : <textarea aria-label="본 것" placeholder="본 것이나 측정값을 적어주세요" value={answers[card.libId] ?? ""} onChange={(e) => setAnswers({ ...answers, [card.libId]: e.target.value })} />}
          {judged !== "unknown" && <p className={judged === "normal" ? "judge ok" : "judge bad"}>{judged === "normal" ? `정상이에요. ${card.ifNormal}` : `범위 밖이에요. ${card.ifAbnormal}`}</p>}
          {judged === "unknown" && !card.resolvedRange && <p className="muted">정상 범위가 확인되지 않은 항목이에요. 본 그대로 보내주면 Claude가 함께 판단해요.</p>}
          <button disabled={busy || (card.resolvedRange?.kind === "number" ? r.value === "" : card.resolvedRange?.kind === "boolean" ? r.yes == null : !(answers[card.libId] ?? "").trim())} onClick={() => {
            const text = card.resolvedRange?.kind === "number" ? `${r.value}${card.resolvedRange.unit}` : card.resolvedRange?.kind === "boolean" ? (r.yes ? "네" : "아니요") : (answers[card.libId] ?? "").trim();
            onAction({ action: "assembly_report", step: step + 1, cardId: card.libId, text, value: r.value === "" ? null : Number(r.value), yes: r.yes });
          }}>확인 결과 보내기</button>
        </article>;
      })}
      {current.cards.map((card) => <article key={card.id} className="trouble-card">
        <strong>⚠ {card.symptom}</strong>
        <p><b>확인</b> {card.check}</p><p><b>정상이면</b> {card.expected}</p><p><b>아니면</b> {card.ifNot}</p>
        <div className="evidence-input"><textarea aria-label={`${card.symptom} 확인 결과`} placeholder="측정값이나 본 것을 적어주세요" value={answers[card.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [card.id]: e.target.value })} /><button disabled={busy || !(answers[card.id] ?? "").trim()} onClick={() => sendText(card.id, card.id)}>확인 결과 보내기</button></div>
      </article>)}
    </section>}
    {stepReports.length > 0 && <section className="assembly-reports"><h4>보낸 결과</h4>{stepReports.map((r, i) => <p key={i}><small>{new Date(r.createdAt).toLocaleString("ko-KR")}</small> {r.cardId ? `[${r.cardId}] ` : ""}{r.text}{r.judgement ? <span className={`pill ${r.judgement === "normal" ? "pass" : r.judgement === "abnormal" ? "fail" : "unknown"}`}>{{ normal: "정상", abnormal: "범위 밖", unknown: "판정 불가" }[r.judgement]}</span> : null}</p>)}<p className="muted">보낸 결과는 Claude가 get_project로 읽고 원인을 함께 좁혀요.</p></section>}
  </div>;
}
