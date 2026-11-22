"use client";
import { useState } from "react";
import type { LocalProject } from "../lib/project-types";
import { projectProgress, projectStages, type Status } from "../lib/progress";

// 사이드바 프로젝트 줄에 들어가는 작은 고리. 숫자는 옆의 글자가 말하므로 여기서는 숨긴다.
export function ProgressRing({ percent, blocked = false }: { percent: number; blocked?: boolean }) {
  const radius = 6, circumference = 2 * Math.PI * radius;
  return <svg className={"progress-ring" + (blocked ? " blocked" : "")} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    <circle cx="8" cy="8" r={radius} fill="none" strokeWidth="2.5" className="ring-track" />
    <circle cx="8" cy="8" r={radius} fill="none" strokeWidth="2.5" strokeLinecap="round" className="ring-value"
      strokeDasharray={`${(circumference * percent) / 100} ${circumference}`} transform="rotate(-90 8 8)" />
  </svg>;
}

const icon: Record<Status, string> = { done: "✓", current: "●", blocked: "!", todo: "○" };

export default function ProgressPanel({ project }: { project: LocalProject }) {
  const [open, setOpen] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const stages = projectStages(project);
  const progress = projectProgress(project);
  const current = progress.current;
  const live = project.liveStatus && Date.now() - new Date(project.liveStatus.updatedAt).getTime() < 15 * 60_000 ? project.liveStatus : null;
  const working = live?.plan.some((item) => item.status !== "done");
  const activity = (project.activity ?? []).slice(-6).reverse();
  return <section className="progress-panel" aria-label="진행 단계">
    <button className="progress-head" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span>{open ? "⌄" : "›"} 진행 단계</span>
      <span className={"progress-now" + (progress.blocked ? " blocked" : "")}>{current ? `${progress.blocked ? "꼭 고칠 것 · " : ""}${progress.percent}% · ${current.label}` : "다 끝냈어요 · 100%"}</span>
    </button>
    {live && <div className={"live-card " + (working ? "working" : "")} role="status">
      <div className="live-title">{working ? <span className="live-dot" /> : "✓"} 대장 달그락 · {live.title}<small>{new Date(live.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</small></div>
      {live.plan.length > 0 && <ol className="live-plan">{live.plan.map((item, i) => <li key={i} className={item.status}>{item.status === "done" ? "✓" : item.status === "doing" ? "◐" : "○"} {item.label}</li>)}</ol>}
      {live.thinking && <><button className="thinking-toggle" aria-expanded={showThinking} onClick={() => setShowThinking(!showThinking)}>{showThinking ? "⌄" : "›"} 생각 요약</button>{showThinking && <p className="live-thinking">{live.thinking}</p>}</>}
    </div>}
    {open && <ol className="stage-list">{stages.map((stage, i) => <li key={stage.key} className={stage.status}>
      <span className="stage-icon">{icon[stage.status]}</span>
      <div><strong>{i + 1}. {stage.label}</strong><small>{stage.note}</small>
        {stage.sub && (stage.status === "current" || stage.status === "done") && <ul className="stage-sub">{stage.sub.map((sub) => <li key={sub.label} className={sub.status}>{icon[sub.status]} {sub.label}{sub.note ? <small> · {sub.note}</small> : null}</li>)}</ul>}
      </div>
    </li>)}</ol>}
    {open && activity.length > 0 && <details className="activity-log"><summary>최근 활동 {activity.length}</summary><ul>{activity.map((a) => <li key={a.id}><time>{new Date(a.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</time> <b>{a.source === "person" ? "나" : a.source === "claude" ? "대장" : "기록"}</b> {a.title}{a.detail ? ` — ${a.detail}` : ""}</li>)}</ul></details>}
  </section>;
}
