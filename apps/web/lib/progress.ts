import type { LocalProject } from "./project-types";
import { intakeMissing, workflowFor } from "./workflow";


export type Status = "done" | "current" | "blocked" | "todo";
export type Stage = { key: string; label: string; status: Status; note: string; sub?: Array<{ label: string; status: Status; note?: string }> };

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

// 단계마다 실제로 드는 품이 다르다. 여덟 단계를 똑같이 1로 세면 부품도 사지 않은
// 사람에게 7/8(88%)이라고 말하게 되는데, 그건 거짓말이고 한 번 겪으면 이 숫자를
// 다시는 믿지 않는다. 뒤로 갈수록 무겁게 주고, 대장간은 조립 단계 진척만큼만 준다.
const WEIGHT: Record<string, number> = { checklist: 1, form: 1, plan: 2, circuit: 2, circuit_ok: 1, mockup_ok: 1, assembly: 2, workshop: 8 };

export function projectProgress(project: LocalProject) {
  const stages = projectStages(project);
  const total = stages.reduce((sum, s) => sum + (WEIGHT[s.key] ?? 1), 0);
  const steps = project.assembly?.steps.length ?? 0;
  const builtSteps = new Set((project.assemblyReports ?? []).filter((r) => !r.cardId).map((r) => r.step)).size;
  let earned = 0;
  for (const stage of stages) {
    const weight = WEIGHT[stage.key] ?? 1;
    if (stage.status === "done") earned += weight;
    // 대장간은 '들어갔다/안 들어갔다'가 아니라 실제로 몇 단계를 조립했는지로 센다.
    else if (stage.key === "workshop" && steps > 0) earned += weight * Math.min(1, builtSteps / steps);
  }
  const everything = stages.every((s) => s.status === "done");
  return {
    percent: everything ? 100 : Math.min(99, Math.round((earned / total) * 100)),
    current: stages.find((s) => s.status === "current" || s.status === "blocked") ?? null,
    // 꼭 고칠 것은 %에 섞으면 묻힌다. 따로 들고 나간다.
    blocked: stages.some((s) => s.status === "blocked"),
    done: stages.filter((s) => s.status === "done").length,
    total: stages.length
  };
}

