"use client";
import type { CSSProperties } from "react";
import type { ReactKind } from "../../lib/find/chips";
import { tintCss } from "../../lib/find/classify";

export type Motion = "idle" | "tilt" | "stoke" | "blaze" | "fallen";

const LINE = { fill: "#fff", stroke: "#232323", strokeWidth: 1.7, strokeLinejoin: "round", strokeLinecap: "round" } as const;
const OPEN = { ...LINE, fill: "none" } as const;

/** 반응(빛·소리·움직임)을 나타내는 작은 도형. 색은 쓰지 않고 먹선으로만 그린다 — 색은 달그락 종류가 쓴다. */
export function ReactMark({ kind }: { kind: ReactKind }) {
  if (kind === "none") return null;
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      {kind === "light" && <>
        <path {...LINE} d="M10 4.5l2.2 6.3 6.3 2.2-6.3 2.2-2.2 6.3-2.2-6.3L1.5 13l6.3-2.2z" />
        <path {...LINE} d="M19.5 1.7l1 2.8 2.8 1-2.8 1-1 2.8-1-2.8-2.8-1 2.8-1z" />
      </>}
      {kind === "sound" && <>
        <circle {...LINE} cx="5" cy="12" r="2.7" />
        <path {...OPEN} d="M11 7.5a6.4 6.4 0 0 1 0 9" />
        <path {...OPEN} d="M15.8 4.2a11 11 0 0 1 0 15.6" />
      </>}
      {kind === "move" && <>
        <path {...LINE} d="M12.5 5.5l9 6.5-9 6.5z" />
        <path {...OPEN} d="M3.5 8.5h5" />
        <path {...OPEN} d="M2 12h6.5" />
        <path {...OPEN} d="M3.5 15.5h5" />
      </>}
    </svg>
  );
}

/**
 * 다인이 그린 도깨비 스프라이트(25프레임). 그림은 건드리지 않고 재생 방식으로 화력을 표현한다.
 * - 화력이 셀수록 빠르게(프레임 120ms → 50ms), 크게, 기운(aura)이 진하게
 * - 몸 색은 이 아이디어를 맡는 달그락의 색(대장간과 같은 색 한 벌). 안 주면 대장 민트다
 * - 반응(빛·소리·움직임)은 몸 색을 바꾸지 않고 옆에 작은 도형으로 띄운다
 */
export default function Dokkaebi({ motion = "idle", fire = 30, width, maker, reacts, className = "", once = false }: {
  motion?: Motion; fire?: number; width?: number; className?: string; once?: boolean;
  /** 달그락 종류("hardware" · "software" · "twin" · "design"). 없거나 "none"이면 대장 민트 */
  maker?: string | null;
  reacts?: ReactKind[];
}) {
  const w = width ?? Math.round(130 + fire * 0.9);
  const frameMs = Math.round(120 - (Math.min(100, Math.max(0, fire)) / 100) * 70);
  const aura = Math.round(w * 0.7 + fire * 1.2);
  const style = {
    "--w": `${w}px`,
    "--dur": `${frameMs * 25}ms`,
    "--tint": tintCss(maker),
    "--aura": `${aura}px`,
    "--aura-o": (0.08 + fire / 450).toFixed(2),
    "--iter": once ? "1" : "infinite"
  } as CSSProperties;
  const marks = (reacts ?? []).filter((k) => k !== "none");
  return (
    <div className={`dk ${className}`} style={style} aria-hidden>
      <div className="aura" />
      <div className="dk-body">
        <div className={`dk-sprite m-${motion}${once ? " hold" : ""}`} />
        {marks.length > 0 && <div className="dk-marks">{marks.map((k) => <span key={k} className={`dk-mark mk-${k}`}><ReactMark kind={k} /></span>)}</div>}
      </div>
    </div>
  );
}
