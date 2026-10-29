"use client";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";

export type LayoutSizes = { sidebar: number; workbench: number; composer: number; sidebarHeight: number; workbenchHeight: number };
const defaults: LayoutSizes = { sidebar: 240, workbench: 460, composer: 160, sidebarHeight: 210, workbenchHeight: 360 };
export const layoutLimits: Record<keyof LayoutSizes, [number, number]> = { sidebar: [160, 480], workbench: [280, 1000], composer: [125, 480], sidebarHeight: [120, 460], workbenchHeight: [180, 800] };
export function useWorkspaceLayout(workbenchVisible: boolean) {
  const [sizes, setSizes] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [viewport, setViewport] = useState({ width: 1200, height: 900 });
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("forge-layout-v1") ?? "{}");
      setSizes(current => Object.fromEntries(Object.entries(current).map(([key, value]) => {
        const k = key as keyof LayoutSizes;
        return [key, typeof saved[key] === "number" && Number.isFinite(saved[key]) ? Math.max(layoutLimits[k][0], Math.min(layoutLimits[k][1], saved[key])) : value];
      })) as LayoutSizes);
    } catch { /* Browser storage is optional. */ }
    setReady(true);
    const measure = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    measure(); window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  useEffect(() => { if (ready) try { localStorage.setItem("forge-layout-v1", JSON.stringify(sizes)); } catch {} }, [sizes, ready]);
  const mobile = viewport.width <= 600;
  const stacked = viewport.width <= 1000;
  function resize(key: keyof LayoutSizes, value: number, workbenchVisible: boolean) {
    setSizes(current => {
      const [min, baseMax] = layoutLimits[key];
      const max = key === "sidebar" ? Math.min(baseMax, viewport.width - 320 - (!stacked && workbenchVisible ? current.workbench + 16 : 8))
        : key === "workbench" ? Math.min(baseMax, viewport.width - current.sidebar - 336)
        : key === "composer" ? Math.min(baseMax, viewport.height * .5)
        : key === "sidebarHeight" ? Math.min(baseMax, viewport.height * .4)
        : Math.min(baseMax, viewport.height * .55);
      return { ...current, [key]: Math.round(Math.max(min, Math.min(Math.max(min, max), value))) };
    });
  }
  const sidebarWidth = Math.min(sizes.sidebar, Math.max(160, viewport.width - (!stacked && workbenchVisible ? Math.min(sizes.workbench, viewport.width * .4) + 336 : 320)));
  const style = {
    "--sidebar-width": `${sidebarWidth}px`,
    "--workbench-width": `${Math.min(sizes.workbench, Math.max(280, viewport.width - sidebarWidth - 336))}px`,
    "--composer-height": `${Math.min(sizes.composer, viewport.height * .5)}px`,
    "--sidebar-height": `${Math.min(sizes.sidebarHeight, viewport.height * .4)}px`,
    "--workbench-height": `${Math.min(sizes.workbenchHeight, viewport.height * .55)}px`
  } as CSSProperties;
  return { sizes, style, mobile, stacked, resize, reset: () => setSizes(defaults) };
}

export function ResizeHandle({ label, axis, value, min, max, reverse = false, onResize, onReset, className = "", controls }: {
  label: string; axis: "x" | "y"; value: number; min: number; max: number; reverse?: boolean; onResize: (value: number) => void; onReset: () => void; className?: string; controls: string;
}) {
  const drag = useRef<{ pointerId: number; coordinate: number; value: number } | null>(null);
  useEffect(() => () => { document.body.classList.remove("resizing-layout"); }, []);
  const coordinate = (e: PointerEvent) => axis === "x" ? e.clientX : e.clientY;
  function finish() { drag.current = null; document.body.classList.remove("resizing-layout"); }
  return <div role="separator" tabIndex={0} aria-label={label} aria-controls={controls} aria-orientation={axis === "x" ? "vertical" : "horizontal"} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)}
    className={`resize-handle resize-${axis} ${className}`} title={`${label} · 드래그 또는 방향키 · 두 번 눌러 기본 크기`}
    onDoubleClick={onReset}
    onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { pointerId: e.pointerId, coordinate: coordinate(e), value }; document.body.classList.add("resizing-layout"); }}
    onPointerMove={e => { if (drag.current?.pointerId === e.pointerId) onResize(drag.current.value + (coordinate(e) - drag.current.coordinate) * (reverse ? -1 : 1)); }}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onKeyDown={e => {
      const decrement = axis === "x" ? "ArrowLeft" : "ArrowUp";
      const increment = axis === "x" ? "ArrowRight" : "ArrowDown";
      if (e.key === "Home") { e.preventDefault(); onResize(min); }
      if (e.key === "End") { e.preventDefault(); onResize(max); }
      if (e.key === decrement || e.key === increment) { e.preventDefault(); onResize(value + (e.key === increment ? 1 : -1) * (reverse ? -1 : 1) * (e.shiftKey ? 40 : 16)); }
    }}><span /></div>;
}
