import { z } from "zod";

export const Id = z.string().uuid();
export const Iso = z.string().datetime({ offset: true });
export const Scope = z.enum(["personal", "general"]);
export const Confidence = z.enum(["measured", "datasheet", "estimate", "guess", "unknown"]);
export type Confidence = z.infer<typeof Confidence>;
export const Domain = z.enum(["HW", "SW", "ME", "ID"]);
export type Domain = z.infer<typeof Domain>;
export const SlotKey = z.enum(["power", "wireless", "sensing", "actuation", "data_sink", "form", "runtime", "fab"]);
export type SlotKey = z.infer<typeof SlotKey>;

export const Source = z.object({ call_id: Id.nullable(), model: z.string().nullable() }).strict();
export const BaseRecord = z.object({
  id: Id,
  project_id: Id.nullable(),
  scope: Scope,
  version: z.number().int().positive(),
  active: z.boolean(),
  created_at: Iso,
  updated_at: Iso,
  created_by: z.string().min(1),
  source: Source
}).strict();

export const Dependency = z.object({
  ref: z.string().regex(/^[a-z_]+:[0-9a-f-]{36}$/),
  field: z.string().nullable(),
  version: z.number().int().positive(),
  value_hash: z.string().min(8)
}).strict();

export const Event = z.object({
  seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  id: Id,
  project_id: Id.nullable(),
  type: z.string().min(1),
  entity: z.string().min(1),
  entity_id: Id,
  entity_version: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()),
  schema_version: z.number().int().positive(),
  caused_by: z.object({ turn_id: Id.nullable(), step_key: z.string(), call_id: Id.nullable(), actor: z.string() }).strict(),
  created_at: Iso
}).strict();
export type Event = z.infer<typeof Event>;

export const FieldValue = <T extends z.ZodType>(value: T) => z.object({
  value: value.nullable(),
  confidence: Confidence,
  source: z.object({
    kind: z.enum(["datasheet", "shop_page", "marketplace_listing", "derived_estimate", "user_input", "user_measured"]),
    url: z.string().url().nullable(),
    locator: z.string().nullable(),
    tool_call_id: Id.nullable(),
    evidence_id: Id.nullable(),
    note: z.string().nullable()
  }).strict(),
  checked_at: Iso
}).strict().superRefine((item, ctx) => {
  if ((item.confidence === "unknown") !== (item.value === null)) {
    ctx.addIssue({ code: "custom", message: "unknown confidence must have null value, and null values must be unknown" });
  }
});

const RequirementId = { id: Id, field: z.string().min(1) };
export const ScalarRequirement = z.object({ ...RequirementId, type: z.literal("scalar"), op: z.enum(["lte", "gte", "eq", "range"]), value: z.union([z.number(), z.tuple([z.number(), z.number()])]), unit: z.string().min(1) }).strict();
export const RangeRequirement = z.object({ ...RequirementId, type: z.literal("range"), op: z.enum(["contains_value", "covers_range"]), value: z.union([z.number(), z.tuple([z.number(), z.number()])]), unit: z.string().min(1) }).strict();
export const BooleanRequirement = z.object({ ...RequirementId, type: z.literal("boolean"), op: z.literal("eq"), value: z.boolean(), unit: z.null() }).strict();
export const EnumRequirement = z.object({ ...RequirementId, type: z.literal("enum"), op: z.enum(["eq", "in"]), value: z.union([z.string(), z.array(z.string())]), unit: z.null() }).strict();
export const SetRequirement = z.object({ ...RequirementId, type: z.literal("set"), op: z.enum(["contains_all", "contains_any"]), value: z.array(z.string()), unit: z.null() }).strict();
export const Requirement = z.discriminatedUnion("type", [ScalarRequirement, RangeRequirement, BooleanRequirement, EnumRequirement, SetRequirement]);
export type Requirement = z.infer<typeof Requirement>;

export const SpecSlot = BaseRecord.extend({
  key: SlotKey,
  label: z.string(),
  status: z.enum(["empty", "assumed", "filled"]),
  value_text: z.string().nullable(),
  assumption: z.string().nullable(),
  acknowledged: z.boolean(),
  unlocks: z.array(z.string())
}).strict().superRefine((slot, ctx) => {
  if (slot.status === "empty" && (slot.value_text !== null || slot.assumption !== null || slot.acknowledged)) ctx.addIssue({ code: "custom", message: "empty slots cannot have a value, assumption, or acknowledgement" });
  if (slot.status === "assumed" && !slot.assumption) ctx.addIssue({ code: "custom", message: "assumed slots require assumption text" });
  if (slot.status === "filled" && !slot.value_text) ctx.addIssue({ code: "custom", message: "filled slots require value text" });
});
export type SpecSlot = z.infer<typeof SpecSlot>;

export const Budget = BaseRecord.extend({
  key: z.string().min(1), label: z.string().min(1), unit: z.string().min(1),
  subject_ref: z.string().nullable(), kind: z.enum(["sum", "envelope"]),
  limit: z.union([z.number(), z.object({ x: z.number(), y: z.number(), z: z.number() }).strict()]).nullable(),
  limit_source: z.string().nullable(), limit_confidence: Confidence
}).strict();
export type Budget = z.infer<typeof Budget>;

export const Allocation = BaseRecord.extend({
  budget_id: Id, owner_ref: z.string(), value: z.number().nullable(), unit: z.string(), confidence: Confidence,
  need_id: Id.nullable(), basis: z.enum(["estimate", "selected", "deferred", "reserved"]),
  derived_from: z.array(Dependency), calculation_id: Id.nullable()
}).strict().superRefine((allocation, ctx) => {
  if ((allocation.confidence === "unknown") !== (allocation.value === null)) ctx.addIssue({ code: "custom", message: "unknown allocation must have null value" });
});
export type Allocation = z.infer<typeof Allocation>;

export const PartCategory = z.enum(["compute", "sensor", "actuator", "power", "io", "passive", "mechanical", "fastener", "cable"]);
export const PartNeed = BaseRecord.extend({
  domain: Domain, need_key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), category: PartCategory,
  context: z.string(), quantity: z.number().int().positive(), must: z.array(Requirement), nice: z.array(Requirement),
  status: z.enum(["open", "searching", "carded", "resolved", "no_candidate", "needs_data", "search_failed", "cancelled"]),
  decision_id: Id.nullable()
}).strict();

export const HumanTask = BaseRecord.extend({
  kind: z.enum(["confirm_spec", "confirm_availability", "purchase", "report_delivery", "measure", "inspect_wiring", "assemble", "run_firmware", "report_log", "functional_test", "provide_info"]),
  title: z.string(), plain: z.string(), reason_ref: z.string(), target_refs: z.array(z.string()), dependencies: z.array(Dependency),
  prerequisite_task_ids: z.array(Id), required_tools: z.array(z.string()),
  procedure: z.array(z.object({ order: z.number().int().positive(), instruction: z.string(), target_refs: z.array(z.string()), power_state: z.enum(["off", "on", "not_applicable"]), tool_mode: z.string().nullable(), probe_positive_ref: z.string().nullable(), probe_negative_ref: z.string().nullable() }).strict()),
  expected_results: z.array(z.object({ description: z.string(), field: z.string().nullable(), comparator: z.enum(["eq", "range", "contains", "manual"]), value: z.union([z.number(), z.string(), z.boolean(), z.tuple([z.number(), z.number()])]).nullable(), unit: z.string().nullable(), basis_refs: z.array(z.string()), confidence: Confidence }).strict()),
  report_schema: z.array(z.object({ key: z.string(), label: z.string(), type: z.enum(["number", "text", "boolean", "file", "choice"]), unit: z.string().nullable(), required: z.boolean(), choices: z.array(z.string()).nullable() }).strict()),
  stop_conditions: z.array(z.string()), alternative_if_unavailable: z.string(),
  status: z.enum(["blocked", "ready", "in_progress", "submitted", "completed", "failed", "cancelled", "superseded"]),
  blocking_for: z.array(z.string()), artifact_ids: z.array(Id), attempt_count: z.number().int().nonnegative()
}).strict();
export type HumanTask = z.infer<typeof HumanTask>;

export const Evidence = BaseRecord.extend({
  task_id: Id.nullable(), kind: z.enum(["measurement", "text", "log_file", "compile_result", "upload_result", "runtime_result", "purchase_report", "delivery_report", "confirmation"]),
  target_refs: z.array(z.string()), design_revision: z.number().int().nonnegative(), artifact_id: Id.nullable(),
  captured_at: Iso, submitted_at: Iso, reported_by: z.enum(["user", "system"]), raw_text: z.string().nullable(), asset_ids: z.array(Id),
  values: z.array(z.object({ field: z.string(), value: z.union([z.number(), z.string(), z.boolean()]).nullable(), unit: z.string().nullable() }).strict()),
  conditions: z.string(), validation: z.enum(["pending", "accepted", "needs_clarification", "rejected"]), supersedes_id: Id.nullable()
}).strict();

export const Conflict = BaseRecord.extend({
  rule_id: z.string(), severity: z.enum(["blocking", "warning"]), fingerprint: z.string(), occurrence: z.number().int().positive(),
  subject_refs: z.array(z.string()), dependencies: z.array(Dependency),
  gap: z.object({ required: z.number(), allowed: z.number(), unit: z.string() }).strict().nullable(),
  message: z.string(), status: z.enum(["open", "resolved"]), resolved_at: Iso.nullable()
}).strict();
export type Conflict = z.infer<typeof Conflict>;

export const SlotLabels: Record<SlotKey, { label: string; unlocks: string[] }> = {
  power: { label: "전원", unlocks: ["에너지원", "전압 변환", "충전"] },
  wireless: { label: "무선 필요 여부", unlocks: ["연산 유닛 계열"] },
  sensing: { label: "감지 대상과 정밀도", unlocks: ["센서"] },
  actuation: { label: "움직임·표시", unlocks: ["액추에이터", "전류 예산"] },
  data_sink: { label: "데이터 행선지", unlocks: ["통신", "저장"] },
  form: { label: "폼팩터·환경 제약", unlocks: ["하우징", "재료"] },
  runtime: { label: "구동 시간", unlocks: ["에너지 용량", "절전 설계"] },
  fab: { label: "제작 방식", unlocks: ["조립 단계 전체"] }
};
