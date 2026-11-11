-- 도깨비의 질문(하루 한 번 답) · 본관 기와(대장간당 1장). apps/web/lib/find/store.ts 의 FIND_SCHEMA와 같아야 한다.
CREATE TABLE IF NOT EXISTS find_question (forge_id text NOT NULL, day text NOT NULL, fire_id text NOT NULL, chip_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (forge_id, day));
CREATE TABLE IF NOT EXISTS find_giwa (forge_id text PRIMARY KEY, wish text NOT NULL, hidden boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
