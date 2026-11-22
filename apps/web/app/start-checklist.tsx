"use client";
import { useEffect, useState } from "react";
import type { LocalProject } from "../lib/project-types";
import { workflowFor } from "../lib/workflow";

// 투어로 가르치는 것보다 '남은 게 보이는' 쪽이 끝까지 가는 비율이 높다는 게, 찾아본
// 자료 중 유일하게 숫자가 붙은 주장이었다. 그래서 둘러보기는 둘러보기로 끝내고,
// 실제로 하게 만드는 일은 이 세 줄이 맡는다. 셋 다 끝나면 조용히 사라진다.
export default function StartChecklist({ projects, onIdea, onProfile, onConnect }: {
  projects: LocalProject[];
  onIdea: () => void; onProfile: () => void; onConnect: () => void;
}) {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" }).then(r => r.ok ? r.json() : null)
      .then(body => { if (alive) setConnected(((body?.clients?.length ?? 0) as number) > 0); })
      .catch(() => { if (alive) setConnected(false); });
    return () => { alive = false; };
  }, [projects.length]);

  const items = [
    { key: "idea", label: "아이디어 적기", done: projects.length > 0, act: onIdea },
    { key: "tools", label: "가진 장비 알려주기", done: projects.some(p => workflowFor(p).profile.toolsConfirmed), act: onProfile },
    { key: "ai", label: "내 AI에 연결하기", done: connected === true, act: onConnect }
  ];
  const done = items.filter(item => item.done).length;
  // 아직 모르는 동안에는 띄우지 않는다. 깜빡였다 사라지면 더 거슬린다.
  if (connected === null || done === items.length) return null;

  return <section className="start-checklist" aria-label="시작하기">
    <strong>시작하기 <span>{done}/{items.length}</span></strong>
    <ul>{items.map(item => <li key={item.key} className={item.done ? "done" : ""}>
      <span className="start-mark" aria-hidden="true">{item.done ? "✓" : "○"}</span>
      {item.done ? <span>{item.label}</span> : <button onClick={item.act}>{item.label}</button>}
    </li>)}</ul>
  </section>;
}
