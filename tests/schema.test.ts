import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FieldValue, HumanTask, SpecSlot } from "@dalgeurak/schema";

const base = {
  id: "01994f9a-d364-7a5d-8cee-6867bcfe1701", project_id: "01994f9a-d364-7a5d-8cee-6867bcfe1702",
  scope: "personal" as const, version: 1, active: true, created_at: "2026-09-16T00:00:00.000Z", updated_at: "2026-09-16T00:00:00.000Z",
  created_by: "user", source: { call_id: null, model: null }
};

describe("strict record schemas", () => {
  it("requires unknown values to be null", () => {
    const schema = FieldValue(z.number());
    expect(() => schema.parse({ value: 3, confidence: "unknown", source: { kind: "user_input", url: null, locator: null, tool_call_id: null, evidence_id: null, note: null }, checked_at: "2026-09-16T00:00:00.000Z" })).toThrow();
  });

  it("rejects invalid empty and assumed slots", () => {
    expect(() => SpecSlot.parse({ ...base, key: "power", label: "전원", status: "empty", value_text: "USB", assumption: null, acknowledged: false, unlocks: [] })).toThrow();
    expect(() => SpecSlot.parse({ ...base, key: "power", label: "전원", status: "assumed", value_text: null, assumption: null, acknowledged: false, unlocks: [] })).toThrow();
  });

  it("accepts an explicit human measurement task", () => {
    const task = HumanTask.parse({ ...base, kind: "measure", title: "전압 측정", plain: "전원 레일을 확인합니다.", reason_ref: `project:${base.project_id}`, target_refs: [], dependencies: [], prerequisite_task_ids: [], required_tools: ["multimeter"], procedure: [{ order: 1, instruction: "DC 전압 모드로 두 점을 측정하세요.", target_refs: [], power_state: "on", tool_mode: "DC voltage", probe_positive_ref: null, probe_negative_ref: null }], expected_results: [], report_schema: [{ key: "voltage", label: "측정 전압", type: "number", unit: "V", required: true, choices: null }], stop_conditions: ["발열이 느껴지면 중단"], alternative_if_unavailable: "어댑터 라벨을 알려주세요.", status: "ready", blocking_for: [], artifact_ids: [], attempt_count: 0 });
    expect(task.kind).toBe("measure");
  });
});
