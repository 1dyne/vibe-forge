-- 도깨비 마을 Phase 2: 내 대장간·우체통·마을 소식. apps/web/lib/find/store.ts 의 FIND_SCHEMA와 같아야 한다.
ALTER TABLE find_fires ADD COLUMN IF NOT EXISTS forge_id text;
CREATE INDEX IF NOT EXISTS find_fires_forge ON find_fires(forge_id);
CREATE TABLE IF NOT EXISTS find_forges (
  id text PRIMARY KEY, owner_hash text NOT NULL UNIQUE, nickname text NOT NULL, theme text NOT NULL, alley_seq integer NOT NULL, plot_no integer NOT NULL,
  visibility text NOT NULL DEFAULT 'public', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (theme, alley_seq, plot_no)
);
CREATE TABLE IF NOT EXISTS find_mail (
  id text PRIMARY KEY, forge_id text, kind text NOT NULL, body text NOT NULL, context jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'new', reply text,
  reply_seen boolean NOT NULL DEFAULT false, notion_page_id text, notion_synced boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS find_mail_forge ON find_mail(forge_id);
CREATE TABLE IF NOT EXISTS find_notices (id bigserial PRIMARY KEY, title text NOT NULL, body text NOT NULL, kind text NOT NULL DEFAULT 'update', published_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS find_meta (key text PRIMARY KEY, value text NOT NULL);
