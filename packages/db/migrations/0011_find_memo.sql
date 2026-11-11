-- 작업실 메모: 주인만 보는 도깨비불별 메모(글 + 선택 링크). apps/web/lib/find/store.ts 의 FIND_SCHEMA와 같아야 한다.
CREATE TABLE IF NOT EXISTS find_memo (id text PRIMARY KEY, forge_id text NOT NULL, fire_id text NOT NULL, body text NOT NULL, url text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS find_memo_forge ON find_memo(forge_id, fire_id);
