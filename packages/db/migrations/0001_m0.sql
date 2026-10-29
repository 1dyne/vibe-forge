CREATE TABLE IF NOT EXISTS event_seq_counter (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_seq bigint NOT NULL DEFAULT 0
);
INSERT INTO event_seq_counter(singleton, last_seq) VALUES (true, 0) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS events (
  seq bigint PRIMARY KEY,
  id uuid NOT NULL UNIQUE,
  project_id uuid,
  type text NOT NULL,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  entity_version integer NOT NULL CHECK (entity_version > 0),
  payload jsonb NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  caused_by jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(entity, entity_id, entity_version)
);
CREATE INDEX IF NOT EXISTS events_project_seq ON events(project_id, seq);

CREATE TABLE IF NOT EXISTS projections (
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  project_id uuid,
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(entity, entity_id)
);
CREATE INDEX IF NOT EXISTS projections_project ON projections(project_id);

CREATE TABLE IF NOT EXISTS commands (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL,
  expected_revision integer,
  created_at timestamptz NOT NULL,
  UNIQUE(project_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS turns (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  command_id uuid NOT NULL REFERENCES commands(id),
  kind text NOT NULL,
  input jsonb NOT NULL,
  snapshot_seq bigint NOT NULL,
  design_revision_before integer NOT NULL,
  design_revision_after integer,
  status text NOT NULL,
  step_states jsonb NOT NULL DEFAULT '[]'::jsonb,
  produced_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz,
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS turns_project ON turns(project_id);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY,
  turn_id uuid NOT NULL REFERENCES turns(id),
  project_id uuid NOT NULL,
  status text NOT NULL,
  lease_owner text,
  lease_until timestamptz,
  fencing_token integer NOT NULL DEFAULT 0,
  attempt integer NOT NULL DEFAULT 0,
  checkpoint_step_key text,
  available_at timestamptz NOT NULL,
  error text
);
CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(status, available_at);
CREATE INDEX IF NOT EXISTS jobs_project ON jobs(project_id);

CREATE TABLE IF NOT EXISTS logical_calls (
  id uuid PRIMARY KEY,
  turn_id uuid NOT NULL REFERENCES turns(id),
  step_key text NOT NULL,
  role_or_tool text NOT NULL,
  subject_ref text NOT NULL,
  ordinal integer NOT NULL,
  input_hash text NOT NULL,
  status text NOT NULL,
  result_asset_id uuid,
  UNIQUE(turn_id, step_key, role_or_tool, subject_ref, ordinal, input_hash)
);

CREATE TABLE IF NOT EXISTS llm_attempts (
  id uuid PRIMARY KEY,
  logical_call_id uuid NOT NULL REFERENCES logical_calls(id),
  attempt integer NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  parsed_json jsonb,
  schema_valid boolean NOT NULL,
  error text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL,
  cost_usd numeric(12,6),
  pricing_version text,
  created_at timestamptz NOT NULL,
  UNIQUE(logical_call_id, attempt)
);

CREATE TABLE IF NOT EXISTS cost_reservations (
  id uuid PRIMARY KEY,
  logical_call_id uuid NOT NULL REFERENCES logical_calls(id),
  turn_id uuid NOT NULL REFERENCES turns(id),
  attempt integer NOT NULL,
  utc_day date NOT NULL,
  max_usd numeric(12,6) NOT NULL CHECK (max_usd >= 0),
  settled_usd numeric(12,6),
  state text NOT NULL,
  UNIQUE(logical_call_id, attempt)
);

-- Event append transaction contract:
-- 1. SELECT last_seq FROM event_seq_counter WHERE singleton FOR UPDATE;
-- 2. Reserve a contiguous range and update last_seq.
-- 3. Insert events and update projections in the same transaction.
