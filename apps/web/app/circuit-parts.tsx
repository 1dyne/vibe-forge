"use client";
import type { BuildBlueprint } from "../lib/project-types";
import { findCard } from "../lib/parts/catalog";
import { PartsBoard, placeParts, type BoardPart } from "./parts-board";

const RED = "#d64545", BLACK = "#222222", SIGNAL = ["#2e7bd6", "#e0a43a", "#3fa37a", "#9b59b6", "#16a2b8", "#c0712f"];

// The circuit as real parts: the board on the left, other parts beside it
// at real size, and every net drawn pin to pin. Parts without a card get a
// fallback box with pins spaced along one edge (approximate positions).
export function CircuitPartsView({ blueprint }: { blueprint: BuildBlueprint }) {
  const components = blueprint.components;
  const boardIndex = Math.max(0, components.findIndex((c) => findCard(c.catalogId)?.type === "board" || c.type === "controller"));
  const ordered = [components[boardIndex], ...components.filter((_, i) => i !== boardIndex)].filter(Boolean);
  const pinsUsed = (ref: string) => [...new Set(blueprint.nets.flatMap((n) => n.members.filter((m) => m.startsWith(`${ref}.`)).map((m) => m.slice(ref.length + 1))))];
  const sized = placeParts(ordered.map((c) => ({ ref: c.ref, label: c.valueOrModel, x: 0, y: 0, width: 22, height: 14, catalogId: c.catalogId })));
  const approximate: string[] = [];
  const parts: BoardPart[] = [];
  let x = 4, y = 6, colWidth = 0;
  const board = sized[0];
  const columnHeight = Math.max(60, (board?.h ?? 50) + 10);
  sized.forEach((p, i) => {
    let pins: BoardPart["pins"];
    const used = pinsUsed(p.ref);
    const cardHasPins = !!p.card?.pins.some((pin) => pin.xMm != null);
    if (!cardHasPins && used.length) {
      approximate.push(p.ref);
      pins = used.map((name, k) => ({ name, x: 0, y: Math.min(p.h - 1, 2 + k * Math.max(2.54, (p.h - 4) / Math.max(1, used.length - 1))) }));
    }
    if (i === 0) { parts.push({ ref: p.ref, label: p.label, x, y, width: p.w, height: p.h, catalogId: p.catalogId, pins }); x += p.w + 24; return; }
    if (y + p.h > columnHeight && y > 6) { x += colWidth + 14; y = 6; colWidth = 0; }
    parts.push({ ref: p.ref, label: p.label, x, y, width: p.w, height: p.h, catalogId: p.catalogId, pins });
    y += p.h + 8; colWidth = Math.max(colWidth, p.w);
  });
  const placed = placeParts(parts);
  const width = Math.max(...placed.map((p) => p.x + p.w)) + 6;
  const height = Math.max(...placed.map((p) => p.y + p.h)) + 6;
  let signalIndex = 0;
  const wires = blueprint.nets.flatMap((net) => {
    const hub = net.members.find((m) => m.startsWith(`${board?.ref}.`)) ?? net.members[0];
    const stroke = net.kind === "power" ? RED : net.kind === "ground" ? BLACK : SIGNAL[signalIndex++ % SIGNAL.length];
    return net.members.filter((m) => m !== hub).map((m) => ({ from: hub, to: m, stroke, label: net.name }));
  });
  const fallbacks = placed.filter((p) => !p.tag);
  return <div className="circuit-parts">
    <PartsBoard base={{ kind: "canvas", width, height }} placed={placed} wires={wires} label={`실제 부품 배치도 · ${blueprint.board}`} />
    <ul className="net-legend">{blueprint.nets.map((net, i) => <li key={net.name}><span style={{ background: net.kind === "power" ? RED : net.kind === "ground" ? BLACK : SIGNAL[blueprint.nets.slice(0, i).filter((n) => n.kind === "signal").length % SIGNAL.length] }} /><b>{net.name}</b> {net.members.join(" · ")}</li>)}</ul>
    {fallbacks.length > 0 && <p className="notice">대체 표시: {fallbacks.map((p) => `${p.ref}(${p.card?.model ?? p.label})`).join(", ")}는 실제 모양이 아직 없어 사각형으로 보여요.{approximate.length ? ` ${approximate.join(", ")}의 핀 위치는 대략적인 표시라, 실물의 핀 이름으로 확인하세요.` : ""}</p>}
    <p className="muted">부품은 실제 크기 비율이에요. 실제 기판 위 배치와 단계별 순서는 조립 가이드에서 볼 수 있어요.</p>
  </div>;
}
