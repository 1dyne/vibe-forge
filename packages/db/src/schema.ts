import { bigint, boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const events = pgTable("events", {
  seq: bigint("seq", { mode: "number" }).primaryKey(),
  id: uuid("id").notNull().unique(), projectId: uuid("project_id"), type: text("type").notNull(), entity: text("entity").notNull(), entityId: uuid("entity_id").notNull(),
  entityVersion: integer("entity_version").notNull(), payload: jsonb("payload").notNull(), schemaVersion: integer("schema_version").notNull(), causedBy: jsonb("caused_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => [uniqueIndex("events_entity_version").on(table.entity, table.entityId, table.entityVersion), index("events_project_seq").on(table.projectId, table.seq)]);

export const projections = pgTable("projections", {
  entity: text("entity").notNull(), entityId: uuid("entity_id").notNull(), projectId: uuid("project_id"), version: integer("version").notNull(), payload: jsonb("payload").notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
}, (table) => [uniqueIndex("projections_entity_id").on(table.entity, table.entityId), index("projections_project").on(table.projectId)]);

export const commands = pgTable("commands", {
  id: uuid("id").primaryKey(), projectId: uuid("project_id").notNull(), kind: text("kind").notNull(), payload: jsonb("payload").notNull(), idempotencyKey: text("idempotency_key").notNull(), expectedRevision: integer("expected_revision"), createdAt: timestamp("created_at", { withTimezone: true }).notNull()
}, (table) => [uniqueIndex("commands_idempotency").on(table.projectId, table.idempotencyKey)]);

export const turns = pgTable("turns", {
  id: uuid("id").primaryKey(), projectId: uuid("project_id").notNull(), commandId: uuid("command_id").notNull(), kind: text("kind").notNull(), input: jsonb("input").notNull(), snapshotSeq: bigint("snapshot_seq", { mode: "number" }).notNull(),
  designRevisionBefore: integer("design_revision_before").notNull(), designRevisionAfter: integer("design_revision_after"), status: text("status").notNull(), stepStates: jsonb("step_states").notNull(), producedEventIds: jsonb("produced_event_ids").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }), endedAt: timestamp("ended_at", { withTimezone: true })
}, (table) => [index("turns_project").on(table.projectId)]);

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey(), turnId: uuid("turn_id").notNull(), projectId: uuid("project_id").notNull(), status: text("status").notNull(), leaseOwner: text("lease_owner"), leaseUntil: timestamp("lease_until", { withTimezone: true }), fencingToken: integer("fencing_token").notNull().default(0), attempt: integer("attempt").notNull().default(0), checkpointStepKey: text("checkpoint_step_key"), availableAt: timestamp("available_at", { withTimezone: true }).notNull(), error: text("error")
}, (table) => [index("jobs_ready").on(table.status, table.availableAt), index("jobs_project").on(table.projectId)]);

export const llmAttempts = pgTable("llm_attempts", {
  id: uuid("id").primaryKey(), logicalCallId: uuid("logical_call_id").notNull(), attempt: integer("attempt").notNull(), provider: text("provider").notNull(), model: text("model").notNull(), parsedJson: jsonb("parsed_json"), schemaValid: boolean("schema_valid").notNull(), error: text("error"), inputTokens: integer("input_tokens").notNull().default(0), outputTokens: integer("output_tokens").notNull().default(0), latencyMs: integer("latency_ms").notNull(), costUsd: numeric("cost_usd", { precision: 12, scale: 6 }), pricingVersion: text("pricing_version"), createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});
