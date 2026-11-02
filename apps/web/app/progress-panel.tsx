"use client";
import { useState } from "react";
import type { LocalProject } from "../lib/project-types";
import { intakeMissing, workflowFor } from "../lib/workflow";

type Status = "done" | "current" | "blocked" | "todo";
type Stage = { key: string; label: string; status: Status; note: string; sub?: Array<{ label: string; status: Status; note?: string }> };

// The project's path as a checklist, so the person always sees which step
// they are on and what it needs, like a long task's progress view.
export function projectStages(project: LocalProject): Stage[] {
  const w = workflowFor(project);
  const plan = project.buildPlan;
  const reports = project.assemblyReports ?? [];
  const blocked = (project.build?.checks ?? []).filter((c) => c.severity === "blocked");
  const doneSteps = new Set(reports.filter((r) => !r.cardId).map((r) => r.step));
  const totalSteps = project.assembly?.steps.length ?? 0;
  const unknownChecks = plan?.preBuyChecks?.filter((c) => c.status === "unknown").length ?? 0;
  const raw: Array<Omit<Stage, "status"> & { done: boolean; blocked?: boolean }> = [
    { key: "checklist", label: "체크리스트", done: intakeMissing(w.profile).length === 0, note: intakeMissing(w.profile).length ? `필요: ${intakeMissing(w.profile).join(" · ")}` : "제작 경험과 예산을 확인했어요" },
    { key: "form", label: "완성품 형태", done: !!project.productForm, note: project.productForm ? "완성품 미리보기가 있어요" : "형태 질문 후 완성품 3D를 만들어요" },
    { key: "plan", label: "설계도 · 보드 선택", done: !!plan, note: plan ? `${plan.board.model} · ${plan.stages.length}단계` : "STEP 0~5 순서로 보드와 부품을 정해요", sub: [
      { label: "STEP 0 하드웨어가 필요한지", status: plan?.track ? "done" : "todo", note: plan ? { software: "소프트웨어", hardware: "하드웨어", both: "둘 다" }[plan.track] : undefined },
      { label: "STEP 1 입력과 출력", status: plan?.io ? "done" : plan ? "current" : "todo", note: plan?.io ? `${plan.io.inputs.join(", ") || "-"} → ${plan.io.outputs.join(", ") || "-"} · 무선 ${{ none: "없음", bluetooth: "블루투스", wifi: "와이파이", both: "둘 다" }[plan.io.wireless]}` : undefined },
      { label: "STEP 2 보드 후보", status: plan?.board ? "done" : "todo", note: plan?.board.model },
      { label: "STEP 3 사기 전에 찾아보기", status: !plan?.preBuyChecks ? (plan ? "current" : "todo") : unknownChecks ? "current" : "done", note: plan?.preBuyChecks ? (unknownChecks ? `확인 필요 ${unknownChecks}개` : "모두 확인") : undefined },
      { label: "STEP 4 개발 환경 준비", status: reports.some((r) => r.step === 1) ? "done" : project.assembly ? "current" : "todo", note: "조립 가이드 1단계" },
      { label: "STEP 5 첫 동작 확인", status: reports.some((r) => r.step >= 2) ? "done" : reports.some((r) => r.step === 1) ? "current" : "todo" }
    ] },
    { key: "circuit", label: "회로 · 규칙 검사", done: !!project.build && !blocked.length, blocked: blocked.length > 0, note: blocked.length ? `꼭 고칠 것 ${blocked.length}건: ${blocked[0].message}` : project.build ? `검사 ${project.build.checks.length}개` : "부품 카드로 회로를 그리고 서버가 검사해요" },
    { key: "circuit_ok", label: "회로 승인", done: !!w.circuitApprovedAt, note: w.circuitApprovedAt ? "승인했어요" : "작업대에서 회로를 보고 승인해요" },
    { key: "mockup_ok", label: "3D 승인", done: !!w.mockupApprovedAt, note: w.mockupApprovedAt ? "승인했어요" : "완성품 3D와 출력 파일을 확인해요" },
    { key: "assembly", label: "조립 가이드", done: !!project.assembly, note: project.assembly ? `${project.assembly.stage} · ${totalSteps}단계` : "실제 부품 배치와 문제 카드를 만들어요" },
    { key: "workshop", label: "대장간 진행", done: totalSteps > 0 && doneSteps.size >= totalSteps && w.phase === "workshop", note: w.phase === "workshop" ? `조립 ${doneSteps.size}/${totalSteps}단계 완료` : "대장간에 들어가 단계별로 만들어요" }
  ];
  const firstOpen = raw.findIndex((s) => !s.done);
  return raw.map((s, i) => ({ key: s.key, label: s.label, note: s.note, sub: s.sub, status: s.blocked ? "blocked" : s.done ? "done" : i === firstOpen ? "current" : "todo" }));
}

const icon: Record<Status, string> = { done: "✓", current: "●", blocked: "!", todo: "○" };

export default function ProgressPanel({ project }: { project: LocalProject }) {
  const [open, setOpen] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const stages = projectStages(project);
  const current = stages.find((s) => s.status === "current" || s.status === "blocked");
  const live = project.liveStatus && Date.now() - new Date(project.liveStatus.updatedAt).getTime() < 15 * 60_000 ? project.liveStatus : null;
  const working = live?.plan.some((item) => item.status !== "done");
  const activity = (project.activity ?? []).slice(-6).reverse();
  return <section className="progress-panel" aria-label="진행 단계">
    <button className="progress-head" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span>{open ? "⌄" : "›"} 진행 단계</span>
      <span className="progress-now">{current ? `${stages.indexOf(current) + 1}/${stages.length} · ${current.label}` : "모든 단계 완료"}</span>
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
