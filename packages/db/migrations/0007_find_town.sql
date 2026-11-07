-- 손바닥 마을 Phase 4: 공사 계획판·집 신고. apps/web/lib/find/store.ts 의 FIND_SCHEMA와 같아야 한다.
CREATE TABLE IF NOT EXISTS find_plan (id bigserial PRIMARY KEY, title text NOT NULL, description text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'voting', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS find_plan_vote (plan_id bigint NOT NULL, forge_id text NOT NULL, fuel integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (plan_id, forge_id));
CREATE TABLE IF NOT EXISTS find_report (id bigserial PRIMARY KEY, forge_id text NOT NULL, reporter text, reason text NOT NULL, resolved boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
