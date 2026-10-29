import { createHash, randomUUID } from "node:crypto";
import type { Allocation, Budget, Confidence, Event, Requirement, SpecSlot } from "@dalgeurak/schema";

const confidenceRank: Record<Confidence, number> = { unknown: 0, guess: 1, estimate: 2, datasheet: 3, measured: 4 };

export function lowestConfidence(values: Confidence[]): Confidence {
  return values.length ? values.reduce((lowest, current) => confidenceRank[current] < confidenceRank[lowest] ? current : lowest) : "unknown";
}

export type SumResult = { knownSum: number; missingRefs: string[]; complete: boolean; confidence: Confidence; ratio: number | null; over: boolean | null };
export function calculateSumBudget(budget: Budget, allocations: Allocation[]): SumResult {
  if (budget.kind !== "sum") throw new Error("calculateSumBudget only accepts sum budgets");
  const active = allocations.filter((item) => item.active && item.budget_id === budget.id);
  const missingRefs = active.filter((item) => item.value === null).map((item) => item.owner_ref).sort();
  const knownSum = active.reduce((sum, item) => sum + (item.value ?? 0), 0);
  const confidence = lowestConfidence([budget.limit_confidence, ...active.map((item) => item.confidence)]);
  const limit = typeof budget.limit === "number" ? budget.limit : null;
  const ratio = limit === null || limit === 0 ? null : knownSum / limit;
  const certainlyOver = limit === null ? null : knownSum > limit;
  return { knownSum, missingRefs, complete: missingRefs.length === 0, confidence, ratio, over: certainlyOver === true ? true : missingRefs.length ? null : certainlyOver };
}

export type RequirementResult = { satisfies: boolean | null; margin: number | null; reason: string };
export function evaluateRequirement(requirement: Requirement, actual: unknown): RequirementResult {
  if (actual === null || actual === undefined) return { satisfies: null, margin: null, reason: "값을 확인해야 합니다" };
  if (requirement.type === "boolean") return { satisfies: actual === requirement.value, margin: null, reason: "불리언 비교" };
  if (requirement.type === "enum") {
    const allowed = Array.isArray(requirement.value) ? requirement.value : [requirement.value];
    return { satisfies: requirement.op === "eq" ? actual === allowed[0] : allowed.includes(String(actual)), margin: null, reason: "열거값 비교" };
  }
  if (requirement.type === "set") {
    if (!Array.isArray(actual)) return { satisfies: null, margin: null, reason: "집합 형식이 아닙니다" };
    const values = new Set(actual.map(String));
    const checks = requirement.value.map((value) => values.has(value));
    return { satisfies: requirement.op === "contains_all" ? checks.every(Boolean) : checks.some(Boolean), margin: null, reason: "집합 포함 비교" };
  }
  if (requirement.type === "range") {
    if (!Array.isArray(actual) || actual.length !== 2) return { satisfies: null, margin: null, reason: "범위 형식이 아닙니다" };
    const [min, max] = actual.map(Number);
    if (typeof requirement.value === "number") return { satisfies: min <= requirement.value && requirement.value <= max, margin: null, reason: "범위가 값을 포함하는지 비교" };
    return { satisfies: min <= requirement.value[0] && max >= requirement.value[1], margin: null, reason: "범위 포괄 비교" };
  }
  if (typeof actual !== "number") return { satisfies: null, margin: null, reason: "수치가 아닙니다" };
  const required = requirement.value;
  if (requirement.op === "range") {
    if (!Array.isArray(required)) return { satisfies: null, margin: null, reason: "요구 범위가 잘못되었습니다" };
    return { satisfies: actual >= required[0] && actual <= required[1], margin: Math.min(actual - required[0], required[1] - actual), reason: "수치 범위 비교" };
  }
  if (Array.isArray(required)) return { satisfies: null, margin: null, reason: "스칼라 요구값이 잘못되었습니다" };
  if (requirement.op === "eq") return { satisfies: actual === required, margin: actual - required, reason: "수치 동등 비교" };
  const denominator = Math.abs(required);
  if (requirement.op === "gte") return { satisfies: actual >= required, margin: denominator === 0 ? null : ((actual - required) / denominator) * 100, reason: "최솟값 비교" };
  return { satisfies: actual <= required, margin: denominator === 0 ? null : ((required - actual) / denominator) * 100, reason: "최댓값 비교" };
}

export function validateAssumptionLimit(slots: SpecSlot[], updates: Pick<SpecSlot, "key" | "status" | "acknowledged">[]): void {
  const next = new Map(slots.map((slot) => [slot.key, { status: slot.status, acknowledged: slot.acknowledged }]));
  for (const update of updates) next.set(update.key, { status: update.status, acknowledged: update.acknowledged });
  const unacknowledged = [...next.values()].filter((slot) => slot.status === "assumed" && !slot.acknowledged).length;
  if (unacknowledged > 3) throw new Error("확인받지 않은 가정은 최대 3개입니다");
}

export function stableHash(value: unknown): string {
  const normalize = (input: unknown): unknown => Array.isArray(input) ? input.map(normalize) : input && typeof input === "object" ? Object.fromEntries(Object.entries(input as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)])) : input;
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

export class InMemoryEventStore {
  private events: Event[] = [];
  private projections = new Map<string, unknown>();
  append(input: Omit<Event, "seq" | "id">): Event {
    const key = `${input.entity}:${input.entity_id}`;
    const previous = this.events.findLast((event) => event.entity === input.entity && event.entity_id === input.entity_id);
    if (input.entity_version !== (previous?.entity_version ?? 0) + 1) throw new Error("entity version conflict");
    const event: Event = { ...input, id: randomUUID(), seq: this.events.length + 1 };
    this.events.push(event);
    this.projections.set(key, structuredClone(input.payload));
    return structuredClone(event);
  }
  list(): Event[] { return structuredClone(this.events); }
  get(entity: string, id: string): unknown { return structuredClone(this.projections.get(`${entity}:${id}`)); }
  rebuild(): Map<string, unknown> {
    const rebuilt = new Map<string, unknown>();
    for (const event of this.events.toSorted((a, b) => a.seq - b.seq)) rebuilt.set(`${event.entity}:${event.entity_id}`, structuredClone(event.payload));
    return rebuilt;
  }
  projectionHash(): string { return stableHash(Object.fromEntries([...this.projections.entries()].sort(([a], [b]) => a.localeCompare(b)))); }
  rebuiltHash(): string { return stableHash(Object.fromEntries([...this.rebuild().entries()].sort(([a], [b]) => a.localeCompare(b)))); }
}

export type InventoryLot = { id: string; partId: string; usableQty: number };
export type InventoryAssignment = { lotId: string; instanceId: string; state: "reserved" | "installed" | "released"; qty: 1 };
export function planInventory(requiredQty: number, lots: InventoryLot[], assignments: InventoryAssignment[]) {
  if (!Number.isInteger(requiredQty) || requiredQty <= 0) throw new Error("required quantity must be a positive integer");
  const usedByLot = new Map<string, number>();
  for (const assignment of assignments) if (assignment.state !== "released") usedByLot.set(assignment.lotId, (usedByLot.get(assignment.lotId) ?? 0) + assignment.qty);
  const reserved: { lotId: string; qty: number }[] = [];
  let remaining = requiredQty;
  for (const lot of lots.toSorted((a, b) => a.id.localeCompare(b.id))) {
    const available = Math.max(0, lot.usableQty - (usedByLot.get(lot.id) ?? 0));
    const qty = Math.min(available, remaining);
    if (qty > 0) reserved.push({ lotId: lot.id, qty });
    remaining -= qty;
    if (remaining === 0) break;
  }
  return { reserved, ownedQty: requiredQty - remaining, buyQty: remaining };
}

export type TokenPrice = { input: number; output: number; cachedInput?: number | null; cacheWrite?: number | null };
export type TokenUsage = { inputTokens: number; outputTokens: number; cachedInputTokens?: number; cacheWriteTokens?: number };
export function calculateModelCost(price: TokenPrice, usage: TokenUsage): number {
  const regularInput = Math.max(0, usage.inputTokens - (usage.cachedInputTokens ?? 0) - (usage.cacheWriteTokens ?? 0));
  const usd = (regularInput * price.input + usage.outputTokens * price.output + (usage.cachedInputTokens ?? 0) * (price.cachedInput ?? price.input) + (usage.cacheWriteTokens ?? 0) * (price.cacheWrite ?? price.input)) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

export function canReserveCost(input: { settledUsd: number; unknownReservedUsd: number; newMaxUsd: number; turnLimitUsd: number; dayLimitUsd: number; daySettledUsd: number; dayReservedUsd: number }): boolean {
  if (input.turnLimitUsd <= 0 || input.dayLimitUsd <= 0 || input.newMaxUsd < 0) return false;
  return input.settledUsd + input.unknownReservedUsd + input.newMaxUsd <= input.turnLimitUsd && input.daySettledUsd + input.dayReservedUsd + input.newMaxUsd <= input.dayLimitUsd;
}
