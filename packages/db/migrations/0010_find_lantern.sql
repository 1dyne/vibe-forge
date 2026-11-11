-- 소원 등불: 누구를 위해 · 기원 한 줄. 같은 소원(같은 대상 갈래·감지·반응)끼리 소원 줄로 꿰인다. apps/web/lib/find/store.ts 의 FIND_SCHEMA와 같아야 한다.
CREATE TABLE IF NOT EXISTS find_lantern (id text PRIMARY KEY, forge_id text NOT NULL, fire_id text, target text NOT NULL, wish text NOT NULL, hide_target boolean NOT NULL DEFAULT false, private boolean NOT NULL DEFAULT false, share_card boolean NOT NULL DEFAULT false, group_key text NOT NULL, status text NOT NULL DEFAULT 'lit', created_at timestamptz NOT NULL DEFAULT now(), done_at timestamptz);
CREATE INDEX IF NOT EXISTS find_lantern_group ON find_lantern(group_key);
CREATE INDEX IF NOT EXISTS find_lantern_forge ON find_lantern(forge_id);
CREATE TABLE IF NOT EXISTS find_lantern_maker (lantern_id text NOT NULL, forge_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (lantern_id, forge_id));
