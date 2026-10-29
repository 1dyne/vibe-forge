import { describe, expect, it } from "vitest";
import { calculateModelCost, calculateSumBudget, canReserveCost, evaluateRequirement, InMemoryEventStore, planInventory, validateAssumptionLimit } from "@dalgeurak/domain";
import type { Allocation, Budget, Requirement, SpecSlot } from "@dalgeurak/schema";

const projectId = "01994f9a-d364-7a5d-8cee-6867bcfe1702";
const now = "2026-09-16T00:00:00.000Z";
const base = { project_id: projectId, scope: "personal" as const, version: 1, active: true, created_at: now, updated_at: now, created_by: "system", source: { call_id: null, model: null } };

describe("deterministic domain rules", () => {
  it("does not treat unknown allocations as zero", () => {
    const budget: Budget = { ...base, id: "01994f9a-d364-7a5d-8cee-6867bcfe1710", key: "mass_total", label: "총 질량", unit: "g", subject_ref: null, kind: "sum", limit: 100, limit_source: "user", limit_confidence: "measured" };
    const allocations: Allocation[] = [
      { ...base, id: "01994f9a-d364-7a5d-8cee-6867bcfe1711", budget_id: budget.id, owner_ref: "instance:a", value: 90, unit: "g", confidence: "datasheet", need_id: null, basis: "selected", derived_from: [], calculation_id: null },
      { ...base, id: "01994f9a-d364-7a5d-8cee-6867bcfe1712", budget_id: budget.id, owner_ref: "instance:b", value: null, unit: "g", confidence: "unknown", need_id: null, basis: "selected", derived_from: [], calculation_id: null }
    ];
    expect(calculateSumBudget(budget, allocations)).toMatchObject({ knownSum: 90, complete: false, over: null, ratio: 0.9 });
  });

  it("calculates partial inventory without double-counting installed units", () => {
    const result = planInventory(6, [{ id: "lot-a", partId: "part-a", usableQty: 3 }], [{ lotId: "lot-a", instanceId: "old", state: "installed", qty: 1 }]);
    expect(result).toEqual({ reserved: [{ lotId: "lot-a", qty: 2 }], ownedQty: 2, buyQty: 4 });
  });

  it("evaluates scalar, set and unknown requirements", () => {
    const scalar: Requirement = { id: "01994f9a-d364-7a5d-8cee-6867bcfe1720", field: "mass_g", type: "scalar", op: "lte", value: 100, unit: "g" };
    const set: Requirement = { id: "01994f9a-d364-7a5d-8cee-6867bcfe1721", field: "interfaces", type: "set", op: "contains_all", value: ["i2c"], unit: null };
    expect(evaluateRequirement(scalar, 80)).toMatchObject({ satisfies: true, margin: 20 });
    expect(evaluateRequirement(set, ["i2c", "uart"])).toMatchObject({ satisfies: true, margin: null });
    expect(evaluateRequirement(scalar, null).satisfies).toBeNull();
  });

  it("limits unacknowledged assumptions to three", () => {
    const slots = ["power", "wireless", "sensing"] as const;
    const records = slots.map((key, index) => ({ ...base, id: `01994f9a-d364-7a5d-8cee-6867bcfe17${30 + index}`, key, label: key, status: "assumed", value_text: null, assumption: "가정", acknowledged: false, unlocks: [] })) as SpecSlot[];
    expect(() => validateAssumptionLimit(records, [{ key: "form", status: "assumed", acknowledged: false }])).toThrow(/최대 3개/);
  });

  it("rebuilds projections to the same semantic state", () => {
    const store = new InMemoryEventStore();
    const entityId = "01994f9a-d364-7a5d-8cee-6867bcfe1740";
    store.append({ project_id: projectId, type: "slot.created", entity: "SpecSlot", entity_id: entityId, entity_version: 1, payload: { value: "one" }, schema_version: 1, caused_by: { turn_id: null, step_key: "seed", call_id: null, actor: "system" }, created_at: now });
    store.append({ project_id: projectId, type: "slot.updated", entity: "SpecSlot", entity_id: entityId, entity_version: 2, payload: { value: "two" }, schema_version: 1, caused_by: { turn_id: null, step_key: "update", call_id: null, actor: "user" }, created_at: now });
    expect(store.projectionHash()).toBe(store.rebuiltHash());
    expect(store.get("SpecSlot", entityId)).toEqual({ value: "two" });
  });

  it("prices model usage and blocks calls without an approved budget", () => {
    expect(calculateModelCost({ input: 2, cachedInput: 0.2, output: 12 }, { inputTokens: 10_000, cachedInputTokens: 2_000, outputTokens: 1_000 })).toBe(0.0284);
    expect(canReserveCost({ settledUsd: 0, unknownReservedUsd: 0, newMaxUsd: 0.02, turnLimitUsd: 0, dayLimitUsd: 1, daySettledUsd: 0, dayReservedUsd: 0 })).toBe(false);
    expect(canReserveCost({ settledUsd: 0.01, unknownReservedUsd: 0.01, newMaxUsd: 0.02, turnLimitUsd: 0.05, dayLimitUsd: 1, daySettledUsd: 0.2, dayReservedUsd: 0.1 })).toBe(true);
  });
});
