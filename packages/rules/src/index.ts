import { createHash, randomUUID } from "node:crypto";
import type { Allocation, Budget, Conflict, Requirement } from "@dalgeurak/schema";
import { calculateSumBudget, evaluateRequirement } from "@dalgeurak/domain";

export type CurrentValue = { subjectRef: string; field: string; value: unknown; confidence: "measured" | "datasheet" | "estimate" | "guess" | "unknown"; sourceRefs: string[] };
export type HardConstraint = { id: string; subjectRef: string; field: string; requirement: Requirement; hardness: "hard" | "soft"; active: boolean; domain: "HW" | "SW" | "ME" | "ID" };

export function fingerprint(ruleId: string, refs: string[]): string {
  return createHash("sha256").update([ruleId, ...refs.toSorted()].join("|")).digest("hex");
}

function baseConflict(ruleId: string, severity: "blocking" | "warning", refs: string[], message: string, projectId: string, now: string): Conflict {
  return {
    id: randomUUID(), project_id: projectId, scope: "personal", version: 1, active: true,
    created_at: now, updated_at: now, created_by: "system", source: { call_id: null, model: null },
    rule_id: ruleId, severity, fingerprint: fingerprint(ruleId, refs), occurrence: 1,
    subject_refs: refs.toSorted(), dependencies: [], gap: null, message, status: "open", resolved_at: null
  };
}

export function detectBudgetConflicts(projectId: string, budgets: Budget[], allocations: Allocation[], now = new Date().toISOString()): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const budget of budgets.filter((item) => item.active && item.kind === "sum")) {
    const result = calculateSumBudget(budget, allocations);
    const refs = [`budget:${budget.id}`, ...allocations.filter((item) => item.active && item.budget_id === budget.id).map((item) => `allocation:${item.id}`)];
    if (result.over === true) {
      const conflict = baseConflict("R3_BUDGET_OVER", "blocking", refs, `${budget.label} 예산이 한도를 초과했습니다.`, projectId, now);
      if (typeof budget.limit === "number") conflict.gap = { required: result.knownSum, allowed: budget.limit, unit: budget.unit };
      conflicts.push(conflict);
    } else if (result.ratio !== null && result.complete && result.ratio >= 0.9) {
      conflicts.push(baseConflict("W_BUDGET_NEAR", "warning", refs, `${budget.label} 예산 여유가 10% 이하입니다.`, projectId, now));
    } else if (!result.complete) {
      conflicts.push(baseConflict("W_INSUFFICIENT_DATA", "warning", refs, `${budget.label} 예산에 확인되지 않은 값이 있습니다.`, projectId, now));
    }
  }
  return conflicts;
}

export function detectConstraintConflicts(projectId: string, constraints: HardConstraint[], values: CurrentValue[], now = new Date().toISOString()): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const constraint of constraints.filter((item) => item.active)) {
    const current = values.find((value) => value.subjectRef === constraint.subjectRef && value.field === constraint.field);
    const refs = [`constraint:${constraint.id}`, constraint.subjectRef, ...(current?.sourceRefs ?? [])];
    const result = evaluateRequirement(constraint.requirement, current?.value);
    if (result.satisfies === false) {
      conflicts.push(baseConflict(constraint.hardness === "hard" ? "R2_HARD_VIOLATED" : "W_SOFT_VIOLATED", constraint.hardness === "hard" ? "blocking" : "warning", refs, `${constraint.field} 조건을 만족하지 않습니다.`, projectId, now));
    } else if (result.satisfies === null) {
      conflicts.push(baseConflict("W_INSUFFICIENT_DATA", "warning", refs, `${constraint.field} 조건을 판정할 자료가 부족합니다.`, projectId, now));
    }
  }
  return conflicts;
}

export type RuleVerdict = { checkerId: string; verdict: "pass" | "fail" | "unknown" | "not_applicable"; message: string; missingRefs: string[] };
export type PowerMember = { instanceId: string; role: "source" | "sink"; vIn?: [number, number] | null; vOut?: number | null; iAvgMa?: number | null; iOutContMa?: number | null };
export function checkPowerNet(members: PowerMember[], voltage: number | null): RuleVerdict[] {
  if (!members.length) return [{ checkerId: "VOLTAGE_MISMATCH", verdict: "not_applicable", message: "연결된 멤버가 없습니다.", missingRefs: [] }];
  const results: RuleVerdict[] = [];
  const sinks = members.filter((member) => member.role === "sink");
  const sources = members.filter((member) => member.role === "source");
  if (voltage === null || sinks.some((sink) => !sink.vIn)) results.push({ checkerId: "VOLTAGE_MISMATCH", verdict: "unknown", message: "전압 또는 입력 범위가 부족합니다.", missingRefs: sinks.filter((sink) => !sink.vIn).map((sink) => sink.instanceId) });
  else results.push({ checkerId: "VOLTAGE_MISMATCH", verdict: sinks.every((sink) => sink.vIn![0] <= voltage && voltage <= sink.vIn![1]) ? "pass" : "fail", message: "전원 넷 전압과 입력 범위를 비교했습니다.", missingRefs: [] });
  if (!sources.length) results.push({ checkerId: "CURRENT_CONT_OVER", verdict: "unknown", message: "전류 공급원을 찾지 못했습니다.", missingRefs: ["power-source"] });
  else if (sinks.some((sink) => sink.iAvgMa === null || sink.iAvgMa === undefined) || sources.some((source) => source.iOutContMa === null || source.iOutContMa === undefined)) results.push({ checkerId: "CURRENT_CONT_OVER", verdict: "unknown", message: "전류 자료가 부족합니다.", missingRefs: members.filter((member) => member.iAvgMa == null && member.iOutContMa == null).map((member) => member.instanceId) });
  else results.push({ checkerId: "CURRENT_CONT_OVER", verdict: sinks.reduce((sum, sink) => sum + sink.iAvgMa!, 0) <= sources.reduce((sum, source) => sum + source.iOutContMa!, 0) ? "pass" : "fail", message: "연속 공급 전류와 평균 부하를 비교했습니다.", missingRefs: [] });
  return results;
}
