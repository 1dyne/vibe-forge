import type { AgentId, ConflictOption, DesignConflict, LocalProject, ProjectTask, PurchaseStatus, TaskAssignee, TaskStatus } from "./project-types";
import { workflowFor } from "./workflow";

// The shared board: who does what (the person or an agent), what clashes and
// must be decided, and whether the design is ready to be finalised. The
// dashboard and the connector tools both change projects through these
// functions, so the rules below hold whichever side writes.

export class CoordinationError extends Error {}

// An agent's claim on a task lapses after two hours without an update, so a
// session that stopped does not hold the work forever.
export const TASK_LEASE_MS = 2 * 60 * 60 * 1000;
const OPEN: TaskStatus[] = ["ready", "in_progress", "blocked", "cannot"];
export const ORDERABLE: PurchaseStatus[] = ["available", "ordered", "received"];

export const assigneeOf = (task: ProjectTask): TaskAssignee => task.assignee ?? "human";
export const isOpenTask = (task: ProjectTask) => OPEN.includes(task.status);
const norm = (value: string) => value.replace(/\s+/g, " ").trim();

function addHistory(task: ProjectTask, by: "human" | "server" | AgentId, status: TaskStatus, note?: string) {
  const at = new Date().toISOString();
  task.history = [...(task.history ?? []), { at, by, status, ...(note ? { note } : {}) }].slice(-10);
  task.updatedAt = at;
}

export type TaskDraft = { assignee: TaskAssignee; kind: ProjectTask["kind"]; title: string; plain: string; doneWhen?: string; dependsOn?: string[] };

// Adds a task, or updates the open one with the same assignee and content
// instead of making a duplicate (the same check asked twice is one task).
export function upsertTask(p: LocalProject, draft: TaskDraft, by: "human" | "server" | AgentId, taskId?: string): { task: ProjectTask; created: boolean } {
  const now = new Date().toISOString();
  if (draft.dependsOn?.some((id) => !p.tasks.some((t) => t.id === id))) throw new CoordinationError("dependsOn에 없는 할 일 ID가 있어요. get_project의 tasks에서 ID를 확인하세요.");
  let task = taskId ? p.tasks.find((t) => t.id === taskId) : p.tasks.find((t) => isOpenTask(t) && assigneeOf(t) === draft.assignee && (norm(t.plain) === norm(draft.plain) || norm(t.title) === norm(draft.title) && norm(t.plain).startsWith(norm(draft.plain).slice(0, 40))));
  if (taskId && !task) throw new CoordinationError("할 일을 찾을 수 없어요. get_project의 tasks에서 ID를 확인하세요.");
  if (task) {
    if (!isOpenTask(task) && taskId) throw new CoordinationError("이미 끝났거나 취소된 할 일이에요. 새 할 일로 만들어주세요.");
    Object.assign(task, { assignee: draft.assignee, kind: draft.kind, title: draft.title, plain: draft.plain, ...(draft.doneWhen !== undefined ? { doneWhen: draft.doneWhen } : {}), ...(draft.dependsOn ? { dependsOn: draft.dependsOn } : {}) });
    addHistory(task, by, task.status, "내용 수정");
    return { task, created: false };
  }
  task = { id: crypto.randomUUID(), status: "ready", createdBy: by, createdAt: now, updatedAt: now, ...draft };
  addHistory(task, by, "ready");
  p.tasks.push(task);
  return { task, created: true };
}

// Status changes. The person moves their own tasks (in progress, done,
// blocked, cannot do it — with a reason). Agents move agent tasks and may
// cancel tasks they created for the person, but never mark the person's work
// as done: only the person (or Claude relaying what the person said, through
// record_task_result) does that.
export function setTaskStatus(p: LocalProject, taskId: string, status: TaskStatus, by: "human" | AgentId, options: { note?: string; session?: string } = {}): ProjectTask {
  const task = p.tasks.find((t) => t.id === taskId);
  if (!task) throw new CoordinationError("할 일을 찾을 수 없어요.");
  const assignee = assigneeOf(task);
  if (by === "human" && assignee !== "human") throw new CoordinationError("에이전트가 맡은 할 일은 에이전트가 진행 상태를 바꿔요. 질문은 채팅으로 남겨주세요.");
  if (by !== "human" && assignee === "human" && status !== "cancelled") throw new CoordinationError("사람의 할 일은 사람이 대시보드에서 상태를 바꿔요. 사람이 채팅으로 결과를 말해줬다면 record_task_result로 기록하세요.");
  if (by !== "human" && assignee === "human" && task.createdBy !== by && task.createdBy !== "server") throw new CoordinationError("다른 역할이 만든 사람의 할 일은 취소할 수 없어요.");
  if ((status === "blocked" || status === "cannot") && !options.note?.trim()) throw new CoordinationError("막힘·못 함에는 이유를 함께 적어주세요.");
  if (by !== "human" && status === "in_progress") {
    const claimFresh = task.claimedAt && Date.now() - Date.parse(task.claimedAt) < TASK_LEASE_MS;
    if (task.status === "in_progress" && claimFresh && task.claimedBy && options.session && task.claimedBy !== options.session) throw new CoordinationError(`이미 다른 세션(${task.claimedBy})이 이 할 일을 진행 중이에요. 2시간 동안 소식이 없으면 다시 맡을 수 있어요.`);
    task.claimedBy = options.session ?? task.claimedBy ?? by;
    task.claimedAt = new Date().toISOString();
  }
  if (status !== "in_progress") { task.claimedAt = status === "ready" ? null : task.claimedAt ?? null; if (status === "ready") task.claimedBy = null; }
  task.status = status;
  if (options.note !== undefined) task.note = options.note.trim().slice(0, 1000);
  addHistory(task, by, status, options.note?.trim().slice(0, 300));
  return task;
}

export function claimExpired(task: ProjectTask, now = Date.now()) {
  return task.status === "in_progress" && assigneeOf(task) !== "human" && !!task.claimedAt && now - Date.parse(task.claimedAt) >= TASK_LEASE_MS;
}

export type ConflictDraft = { title: string; detail: string; source: DesignConflict["source"]; refs: string[]; options: Array<Omit<ConflictOption, "id">> };

// Raises a decision for the person, or revises an existing one (for example
// after the person wrote a third proposal and the chief reviewed it).
export function raiseConflict(p: LocalProject, draft: ConflictDraft, by: "server" | AgentId, conflictId?: string): DesignConflict {
  const now = new Date().toISOString();
  const options = draft.options.map((option, index) => ({ ...option, id: `o${index + 1}` }));
  const afterFinal = Boolean(workflowFor(p).finalizedAt);
  const list = p.conflicts ?? [];
  const existing = conflictId ? list.find((c) => c.id === conflictId) : list.find((c) => (c.status === "open" || c.status === "reviewing") && norm(c.title) === norm(draft.title));
  if (conflictId && !existing) throw new CoordinationError("충돌 카드를 찾을 수 없어요. get_project의 conflicts에서 ID를 확인하세요.");
  if (existing) {
    if (existing.status === "resolved" || existing.status === "dismissed") throw new CoordinationError("이미 정리된 충돌이에요. 새 충돌로 올려주세요.");
    Object.assign(existing, { title: draft.title, detail: draft.detail, source: draft.source, refs: draft.refs, options, status: "open", updatedAt: now });
    return existing;
  }
  const conflict: DesignConflict = { id: crypto.randomUUID(), ...draft, options, raisedBy: by, status: "open", afterFinal, createdAt: now, updatedAt: now };
  p.conflicts = [...list, conflict];
  return conflict;
}

// The person picks an option (settled now) or writes their own proposal
// (the chief reviews it, then revises the options or closes the card).
export function resolveConflictByPerson(p: LocalProject, conflictId: string, choice: { optionId?: string; proposal?: string }): DesignConflict {
  const conflict = p.conflicts?.find((c) => c.id === conflictId);
  if (!conflict) throw new CoordinationError("충돌 카드를 찾을 수 없어요.");
  if (conflict.status === "resolved" || conflict.status === "dismissed") throw new CoordinationError("이미 정리된 충돌이에요.");
  const now = new Date().toISOString();
  const proposal = choice.proposal?.trim();
  if (proposal) {
    conflict.status = "reviewing";
    conflict.resolution = { optionId: null, proposal: proposal.slice(0, 1500), at: now };
  } else {
    const option = conflict.options.find((o) => o.id === choice.optionId);
    if (!option) throw new CoordinationError("선택지를 골라주세요.");
    conflict.status = "resolved";
    conflict.resolution = { optionId: option.id, proposal: null, at: now };
  }
  conflict.updatedAt = now;
  return conflict;
}

export function closeConflict(p: LocalProject, conflictId: string, status: "resolved" | "dismissed", note: string): DesignConflict {
  const conflict = p.conflicts?.find((c) => c.id === conflictId);
  if (!conflict) throw new CoordinationError("충돌 카드를 찾을 수 없어요.");
  if (conflict.status === "open" && status === "resolved") throw new CoordinationError("사람이 아직 고르지 않은 충돌이에요. 사람이 대시보드에서 고르거나 제안을 남긴 뒤에 닫을 수 있어요.");
  const now = new Date().toISOString();
  conflict.status = status;
  conflict.resolution = { optionId: conflict.resolution?.optionId ?? null, proposal: conflict.resolution?.proposal ?? null, note: note.slice(0, 600), at: now };
  conflict.updatedAt = now;
  return conflict;
}

export const openConflicts = (p: LocalProject) => (p.conflicts ?? []).filter((c) => c.status === "open" || c.status === "reviewing");

// Stock trouble on a part the person reported becomes a decision card the
// chief fills with alternatives.
export function stockConflict(p: LocalProject, ref: string, note: string) {
  const part = p.build?.blueprint.components.find((c) => c.ref === ref);
  const title = `재고 문제: ${ref}${part ? ` (${part.valueOrModel})` : ""}`;
  if (openConflicts(p).some((c) => c.title === title)) return;
  raiseConflict(p, { title, detail: note || "사람이 이 부품을 구할 수 없다고 알렸어요. 대장이 대체 부품과 바뀌는 설계를 정리해 선택지를 올릴 거예요.", source: "stock", refs: [ref], options: [] }, "server");
}

export const PURCHASE_LABEL: Record<PurchaseStatus, string> = { needed: "구매 예정", available: "재고 확인됨", ordered: "주문 완료", received: "수령 완료", problem: "문제 발생" };

// Shared by the dashboard's parts list and set_purchase_status. A problem
// (out of stock, wrong part arrived) opens a decision card for the chief.
export function recordPurchase(p: LocalProject, ref: string, status: PurchaseStatus, note: string): string {
  if (!p.build?.blueprint.components.some((c) => c.ref === ref)) throw new CoordinationError("부품을 찾을 수 없습니다. get_project의 circuit.components에서 ref를 확인하세요.");
  const w = workflowFor(p);
  w.purchases[ref] = status;
  p.workflow = w;
  if (status === "problem") stockConflict(p, ref, note);
  return `${ref} 구매 상태: ${PURCHASE_LABEL[status]}${note ? ` · ${note}` : ""}`;
}

// What still stands between the design and "finalised": every part checked
// as orderable, no open decision, the team chosen, the circuit's blocking
// rules cleared and the independent review not failing.
export function finalizeBlockers(p: LocalProject): string[] {
  const w = workflowFor(p);
  const blockers: string[] = [];
  if (!w.mockupApprovedAt) blockers.push("3D 목업 승인이 필요해요.");
  const parts = p.build?.blueprint.components ?? [];
  const unchecked = parts.filter((c) => !ORDERABLE.includes(w.purchases[c.ref] ?? "needed"));
  if (unchecked.length) blockers.push(`주문 가능 여부를 확인하지 않은 부품 ${unchecked.length}개: ${unchecked.map((c) => c.ref).join(", ")} (부품목록에서 '재고 확인됨'·'주문 완료'·'수령 완료' 중 하나로 바꿔주세요)`);
  const conflicts = openConflicts(p);
  if (conflicts.length) blockers.push(`정리하지 않은 충돌 ${conflicts.length}건: ${conflicts.map((c) => c.title).join(" / ")}`);
  if (!w.activeAgents.length) blockers.push("함께 일할 팀을 하나 이상 골라주세요.");
  const blockedRules = (p.build?.checks ?? []).filter((c) => c.severity === "blocked" && c.verdict === "fail");
  if (blockedRules.length) blockers.push(`회로에 꼭 고쳐야 할 문제 ${blockedRules.length}건이 남아 있어요.`);
  const review = p.build?.evaluator;
  if (review && (review.hw.verdict === "fail" || review.sw.verdict === "fail")) blockers.push("구매 전 교차 검토에서 실패(fail) 판정이 있어요. 회로를 고쳐 다시 검토받아주세요.");
  return blockers;
}

// Read model for Claude and the dashboard.
export function boardSummary(p: LocalProject, link: (kind: "task" | "conflict", id: string) => string) {
  const now = Date.now();
  const task = (t: ProjectTask) => ({ id: t.id, assignee: assigneeOf(t), kind: t.kind, title: t.title, plain: t.plain, status: claimExpired(t, now) ? "ready" : t.status, claimedBy: claimExpired(t, now) ? null : t.claimedBy ?? null, note: t.note ?? null, doneWhen: t.doneWhen ?? null, dependsOn: t.dependsOn ?? [], openUrl: link("task", t.id) });
  const open = p.tasks.filter(isOpenTask);
  return {
    humanTasks: open.filter((t) => assigneeOf(t) === "human").map(task),
    agentTasks: open.filter((t) => assigneeOf(t) !== "human").map(task),
    recentlyDone: p.tasks.filter((t) => t.status === "completed").slice(-5).map(({ id, title }) => ({ id, title })),
    conflicts: (p.conflicts ?? []).filter((c) => c.status !== "dismissed").slice(-12).map((c) => ({ ...c, openUrl: link("conflict", c.id) })),
    finalizeBlockers: workflowFor(p).phase === "handoff" ? finalizeBlockers(p) : []
  };
}
