"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// 슬라이드로 설명하면 다 읽고 닫아도 실제 화면 어디에 무엇이 있는지는 모른다.
// 그래서 진짜 화면 위를 걸어 다닌다. 각 정거장은 실제 DOM 요소를 가리키고, 그 자리만
// 밝게 남긴 채 나머지를 덮는다. 창 크기가 바뀌거나 스크롤해도 따라붙는다.

export type Station = {
  key: string;
  /** 실제 화면 요소를 가리키는 data-tour 값. */
  target: string;
  title: string;
  body: ReactNode;
  /** 이 정거장을 보여주기 전에 앱 상태를 바꿔야 할 때(작업대 열기 등). */
  before?: () => void;
  /** 가리킬 것이 없으면 건너뛴다(그 화면에 아직 없는 영역). */
  optional?: boolean;
};

type Box = { top: number; left: number; width: number; height: number };
const PAD = 8;

function findTarget(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
}

export default function Tour({ stations, onClose }: { stations: Station[]; onClose: () => void }) {
  const [at, setAt] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const station = stations[at];
  const last = at === stations.length - 1;

  // 대상이 아직 그려지지 않았을 수 있어 몇 프레임 기다렸다 잰다.
  const measure = useCallback(() => {
    const element = findTarget(station.target);
    if (!element) { setBox(null); return false; }
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
    const rect = element.getBoundingClientRect();
    setBox({ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 });
    return true;
  }, [station.target]);

  useLayoutEffect(() => { station.before?.(); }, [station]);

  useEffect(() => {
    let tries = 0;
    let raf = 0;
    const tick = () => {
      if (measure() || tries++ > 40) return;
      raf = requestAnimationFrame(tick);
    };
    tick();
    const again = () => measure();
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", again); window.removeEventListener("scroll", again, true); };
  }, [measure]);

  const go = useCallback((next: number) => {
    if (next < 0) return;
    if (next >= stations.length) { onClose(); return; }
    setAt(next);
  }, [stations.length, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); go(at + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(at - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, go, onClose]);

  useEffect(() => { bubble.current?.focus(); }, [at]);

  // 아래 → 위 → 옆 순으로 자리를 찾는다. 사이드바나 작업대처럼 화면만큼 긴 것을
  // 가리킬 때는 위아래에 자리가 없어서, 옆으로 비켜야 짚은 자리를 가리지 않는다.
  const bubbleStyle = (): React.CSSProperties => {
    const width = Math.min(330, window.innerWidth - 24);
    const height = 190;
    const clampLeft = (value: number) => Math.min(Math.max(12, value), window.innerWidth - width - 12);
    if (!box) return { width, left: clampLeft((window.innerWidth - width) / 2), top: window.innerHeight / 2 - 90 };
    const below = box.top + box.height + 12;
    if (window.innerHeight - below > height) return { width, left: clampLeft(box.left + box.width / 2 - width / 2), top: below };
    if (box.top > height + 12) return { width, left: clampLeft(box.left + box.width / 2 - width / 2), top: box.top - height - 12 };
    const roomRight = window.innerWidth - (box.left + box.width);
    const left = roomRight > width + 24 ? box.left + box.width + 12 : Math.max(12, box.left - width - 12);
    return { width, left: clampLeft(left), top: Math.min(Math.max(12, box.top + box.height / 2 - height / 2), window.innerHeight - height - 12) };
  };

  return <div className="tour-layer" role="dialog" aria-modal="true" aria-label="화면 안내">
    {box
      ? <div className="tour-ring" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
      : <div className="tour-dim" />}
    <div ref={bubble} tabIndex={-1} className="tour-bubble" style={bubbleStyle()}>
      <div className="tour-count">{at + 1} / {stations.length}</div>
      <strong>{station.title}</strong>
      <div className="tour-body">{station.body}</div>
      <div className="tour-nav">
        <button className="tour-skip" onClick={onClose}>그만 보기</button>
        <span className="tour-spacer" />
        {at > 0 && <button onClick={() => go(at - 1)}>이전</button>}
        <button className="primary" onClick={() => go(at + 1)}>{last ? "다 봤어요" : "다음"}</button>
      </div>
    </div>
  </div>;
}
