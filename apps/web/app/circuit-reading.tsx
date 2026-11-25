"use client";
import { useMemo, useState } from "react";
import { circuitReadingGuide } from "../lib/learn";
import type { BuildBlueprint } from "../lib/project-types";
import { InfoDot, useLearnMode } from "./info-dot";

// 회로도 읽는 법을 이 회로로 따라가 본다. 학습 모드에서만 보인다.
// 순서는 전원 → GND → 신호. 고장을 찾을 때도 같은 순서로 본다.
const KIND = { power: "전원", ground: "GND", signal: "신호" } as const;

export default function CircuitReading({ blueprint }: { blueprint: BuildBlueprint }) {
  const enabled = useLearnMode();
  const steps = useMemo(() => circuitReadingGuide(blueprint), [blueprint]);
  const [at, setAt] = useState(0);
  if (!enabled || !steps.length) return null;
  const step = steps[Math.min(at, steps.length - 1)];
  return <section className="ld-reading" aria-label="회로도 읽는 법">
    <header><strong>회로도 읽는 법</strong><small>{Math.min(at, steps.length - 1) + 1} / {steps.length}</small></header>
    <p className="ld-reading-order">전원 → GND → 신호 순서로 읽어요. 선을 하나씩 따라가지 않고, 서로 이어진 핀들을 한 묶음<InfoDot term="net" />으로 봐요.</p>
    <div className={`ld-reading-step ld-kind-${step.kind}`}>
      <span className="ld-reading-kind">{KIND[step.kind]}{step.kind === "ground" && <InfoDot term="GND" />}{step.kind === "power" && <InfoDot term="전압" />}</span>
      <b>{step.title}</b>
      <p>{step.body}</p>
      {step.pins.length > 0 && <ul aria-label="이 묶음에 든 핀">{step.pins.map((pin) => <li key={pin}><code>{pin}</code></li>)}</ul>}
    </div>
    <div className="ld-reading-nav">
      <button type="button" disabled={at <= 0} onClick={() => setAt((v) => Math.max(0, v - 1))}>이전</button>
      <button type="button" className="primary" disabled={at >= steps.length - 1} onClick={() => setAt((v) => Math.min(steps.length - 1, v + 1))}>다음</button>
    </div>
  </section>;
}
