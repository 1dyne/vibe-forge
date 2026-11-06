"use client";
import type { CSSProperties } from "react";
import { REACT_HUE, type ReactKind } from "../../lib/find/chips";

export type Motion = "idle" | "tilt" | "stoke" | "blaze" | "fallen";

/**
 * 다인이 그린 도깨비 스프라이트(25프레임). 그림은 건드리지 않고 재생 방식으로 화력을 표현한다.
 * - 화력이 셀수록 빠르게(프레임 120ms → 50ms), 크게, 기운(aura)이 진하게
 * - 반응 갈래 색으로 hue-rotate
 */
export default function Dokkaebi({ motion = "idle", fire = 30, width, kind = "none", className = "", once = false }: {
  motion?: Motion; fire?: number; width?: number; kind?: ReactKind; className?: string; once?: boolean;
}) {
  const w = width ?? Math.round(130 + fire * 0.9);
  const frameMs = Math.round(120 - (Math.min(100, Math.max(0, fire)) / 100) * 70);
  const aura = Math.round(w * 0.7 + fire * 1.2);
  const style = {
    "--w": `${w}px`,
    "--dur": `${frameMs * 25}ms`,
    "--hue": `${REACT_HUE[kind]}deg`,
    "--aura": `${aura}px`,
    "--aura-o": (0.08 + fire / 450).toFixed(2),
    "--iter": once ? "1" : "infinite"
  } as CSSProperties;
  return (
    <div className={`dk ${className}`} style={style} aria-hidden>
      <div className="aura" />
      <div className="dk-body">
        <div className={`dk-sprite m-${motion}${once ? " hold" : ""}`} />
      </div>
    </div>
  );
}
