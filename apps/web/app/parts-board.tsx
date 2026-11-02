"use client";
import { createElement, useEffect, useRef, useState } from "react";
import { findCard, type PartCard } from "../lib/parts/catalog";
import { resolvePin } from "../lib/parts/rules";
import wokwiSizes from "../lib/parts/wokwi-pins.json";

// Draws parts at real size on a base (breadboard, board or plain canvas):
// Wokwi parts as real-looking elements, others as a labelled fallback box,
// and wires between exact pin positions. Shared by the circuit tab and the
// assembly guide.

const MM = 3.7795; // CSS px per mm; Wokwi elements are sized in mm.
export type BoardPart = { ref: string; label: string; x: number; y: number; width: number; height: number; catalogId?: string; rotation?: number; color?: string; pins?: Array<{ name: string; x: number; y: number }> };
export type BoardWire = { from: string; to: string; stroke: string; fresh?: boolean; label?: string };
export type Placed = BoardPart & { card: PartCard | null; tag: string | null; w: number; h: number };

export function placeParts(parts: BoardPart[]): Placed[] {
  return parts.map((part) => {
    const card = findCard(part.catalogId);
    const tag = card?.renderer.type === "wokwi" ? card.renderer.ref : null;
    const size = tag ? (wokwiSizes as Record<string, { widthMm: number; heightMm: number }>)[tag.replace(/^wokwi-/, "")] : null;
    return { ...part, card, tag, w: size?.widthMm ?? part.width, h: size?.heightMm ?? part.height };
  });
}

function rotatePoint(x: number, y: number, w: number, h: number, rotation: number): [number, number] {
  const cx = w / 2, cy = h / 2, dx = x - cx, dy = y - cy, r = (rotation * Math.PI) / 180;
  return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
}

export function pinPointOf(placed: Placed[], end: string): [number, number] | null {
  const [ref, ...rest] = end.split(".");
  const pin = rest.join(".");
  const p = placed.find((item) => item.ref === ref);
  if (!p) return null;
  const cp = p.card ? resolvePin(p.card, pin) : null;
  const own = p.pins?.find((x) => x.name === pin);
  const local = cp && cp.xMm != null && cp.yMm != null ? [cp.xMm, cp.yMm] : own ? [own.x, own.y] : null;
  if (!local) return null;
  const [rx, ry] = rotatePoint(local[0], local[1], p.w, p.h, p.rotation ?? 0);
  return [p.x + rx, p.y + ry];
}

export function PartsBoard({ base, placed, wires, freshRefs = new Set(), pastRefs = new Set(), activePins = new Set(), replayKey = "", label }: {
  base: { kind: "breadboard" | "board" | "stack" | "perfboard" | "canvas"; width: number; height: number };
  placed: Placed[]; wires: BoardWire[]; freshRefs?: Set<string>; pastRefs?: Set<string>; activePins?: Set<string>; replayKey?: string; label: string;
}) {
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(1);
  const frame = useRef<HTMLDivElement>(null);
  const margin = 8;
  const { width: W, height: H } = base;
  useEffect(() => { let alive = true; import("@wokwi/elements").then(() => { if (alive) setReady(true); }).catch(() => {}); return () => { alive = false; }; }, []);
  useEffect(() => {
    const el = frame.current; if (!el) return;
    const measure = () => setFit(Math.min(1.6, (el.clientWidth - 4) / ((W + margin * 2) * MM)));
    measure(); const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect();
  }, [W]);
  const scale = fit * zoom;
  const holes = base.kind === "breadboard" || base.kind === "perfboard";
  const point = (end: string) => pinPointOf(placed, end);
  return <>
    <div className="view-toolbar"><span>{label}</span><button aria-label="축소" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}>−</button><button onClick={() => setZoom(1)}>맞춤</button><button aria-label="확대" onClick={() => setZoom(Math.min(3, zoom + 0.25))}>＋</button></div>
    <div className="assembly-frame" ref={frame}>
      <div className="assembly-scaler" style={{ width: (W + margin * 2) * MM * scale, height: (H + margin * 2) * MM * scale }}>
        <div key={replayKey} className="assembly-stage" style={{ width: `${W + margin * 2}mm`, height: `${H + margin * 2}mm`, transform: `scale(${scale})` }}>
          <svg className="assembly-layer" viewBox={`${-margin} ${-margin} ${W + margin * 2} ${H + margin * 2}`} aria-hidden="true">
            {base.kind !== "canvas" && <rect x={0} y={0} width={W} height={H} rx={2} fill={base.kind === "board" || base.kind === "stack" ? "#2f6f5e" : "#f4f2ea"} stroke="#9aa59f" strokeWidth={0.4} />}
            {base.kind === "canvas" && <rect x={-margin} y={-margin} width={W + margin * 2} height={H + margin * 2} fill="url(#canvas-grid)" />}
            <defs><pattern id="canvas-grid" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="0.5" cy="0.5" r="0.25" fill="#d7deda" /></pattern></defs>
            {holes && Array.from({ length: Math.floor(W / 2.54) }, (_, i) => Array.from({ length: Math.floor(H / 2.54) }, (_, j) => <circle key={`${i}-${j}`} cx={1.27 + i * 2.54} cy={1.27 + j * 2.54} r={0.35} fill="#c9c6bb" />))}
            {base.kind === "breadboard" && <><line x1={2} x2={W - 2} y1={2.2} y2={2.2} stroke="#d64545" strokeWidth={0.3} /><line x1={2} x2={W - 2} y1={H - 2.2} y2={H - 2.2} stroke="#3a5fbf" strokeWidth={0.3} /></>}
            {placed.filter((p) => !p.tag).map((p) => <g key={p.ref} className={freshRefs.has(p.ref) ? "assembly-fresh" : ""} opacity={pastRefs.has(p.ref) ? 0.75 : 1} transform={`rotate(${p.rotation ?? 0} ${p.x + p.w / 2} ${p.y + p.h / 2})`}>
              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={0.8} fill={p.color ?? "#5b6b66"} stroke="#e0a43a" strokeDasharray="1 0.8" strokeWidth={0.4} />
              <text x={p.x + p.w / 2} y={p.y + p.h / 2 - 1} textAnchor="middle" fontSize={Math.min(3, p.w / 5)} fill="#fff" fontWeight={700}>{p.ref}</text>
              <text x={p.x + p.w / 2} y={p.y + p.h / 2 + 2.4} textAnchor="middle" fontSize={1.8} fill="#ffe2a8">대체 표시</text>
              <title>{p.ref} · {p.card?.model ?? p.label} (대체 표시)</title>
            </g>)}
          </svg>
          {ready && placed.filter((p) => p.tag).map((p) => <div key={p.ref} className={"wokwi-slot " + (freshRefs.has(p.ref) ? "assembly-fresh current-part" : pastRefs.has(p.ref) ? "past-part" : "")} style={{ left: `${margin + p.x}mm`, top: `${margin + p.y}mm`, width: `${p.w}mm`, height: `${p.h}mm`, transform: `rotate(${p.rotation ?? 0}deg)` }} title={`${p.ref} · ${p.card?.model ?? p.label}`}>
            {createElement(p.tag!, p.tag === "wokwi-led" ? { color: p.color === "#2e7bd6" ? "blue" : "red" } : {})}
            <span className="part-ref-tag">{p.ref}</span>
          </div>)}
          <svg className="assembly-layer wires" viewBox={`${-margin} ${-margin} ${W + margin * 2} ${H + margin * 2}`} aria-hidden="true">
            {wires.map((wire, i) => {
              const a = point(wire.from), b = point(wire.to);
              if (!a || !b) return null;
              const mid: [number, number] = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 4];
              return <path key={i} className={wire.fresh ? "assembly-wire-fresh" : ""} pathLength={1} d={`M${a[0]},${a[1]} Q${mid[0]},${mid[1]} ${b[0]},${b[1]}`} fill="none" stroke={wire.stroke} strokeWidth={wire.fresh ? 0.9 : 0.6} strokeLinecap="round" opacity={wire.fresh || !wires.some((w) => w.fresh) ? 1 : 0.55} />;
            })}
            {[...activePins].map((end) => { const p = point(end); return p ? <g key={end}><circle cx={p[0]} cy={p[1]} r={0.9} fill="#e0a43a" /><text x={p[0]} y={p[1] - 1.6} textAnchor="middle" fontSize={2} fill="#7a4a00">{end.split(".").slice(1).join(".")}</text></g> : null; })}
          </svg>
        </div>
      </div>
    </div>
  </>;
}
