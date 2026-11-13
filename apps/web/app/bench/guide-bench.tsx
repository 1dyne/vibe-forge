"use client";
import { useEffect, useRef, useState } from "react";
import type { BenchKit } from "../../lib/bench/types";
import type { BenchApi } from "./bench-scene";

// 조립 가이드 카드 안의 3D 단계 그림. 3D 작업대와 같은 장면을 쓰고,
// 가이드의 단계가 바뀌면 그 단계까지 놓인 상태에서 이번 단계 동작을 재생한다.
export default function GuideBench({ kit, step, replayKey, onFail }: { kit: BenchKit; step: number; replayKey: number; onFail: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const api = useRef<BenchApi | null>(null);
  const [ready, setReady] = useState(false);
  const stepRef = useRef(step); stepRef.current = step;

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const { createBench } = await import("./bench-scene");
        if (disposed || !mount.current) return;
        const lowEnd = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 3 || (navigator.hardwareConcurrency ?? 8) <= 4;
        const a = await createBench(mount.current, kit, { hue: 0, light: lowEnd, cb: { onTarget: () => {}, onPart: () => {} } });
        if (disposed) { a.dispose(); return; }
        api.current = a;
        a.setInsets(0, 0);
        setReady(true);
      } catch (e) {
        console.error(e);
        if (!disposed) onFail();
      }
    })();
    return () => { disposed = true; api.current?.dispose(); api.current = null; };
    // 장면은 키트가 바뀔 때만 다시 만든다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit.id, JSON.stringify(kit.steps.map((s) => s.ops))]);

  // 단계가 바뀌거나 다시 보기: 이전 단계까지 놓고 이번 단계를 재생
  useEffect(() => {
    const a = api.current;
    if (!ready || !a) return;
    a.goto(Math.min(step, kit.steps.length - 1));
    void a.play();
  }, [ready, step, replayKey, kit.steps.length]);

  return <div className="guide-bench" ref={mount} aria-label={`${step + 1}단계 3D 조립 그림 · 드래그로 돌려보기`}>
    {!ready && <div className="guide-bench-loading">3D 작업대 준비 중…</div>}
  </div>;
}
