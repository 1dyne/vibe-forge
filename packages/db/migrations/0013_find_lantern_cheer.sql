-- 소원 등불 응원하기: 대장간 하나당 등불 하나에 한 번(글 없음). apps/web/lib/find/store.ts 의 FIND_SCHEMA와 같아야 한다.
CREATE TABLE IF NOT EXISTS find_lantern_cheer (lantern_id text NOT NULL, forge_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (lantern_id, forge_id));
