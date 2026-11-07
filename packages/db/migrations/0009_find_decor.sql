-- 대장간 꾸미기(지붕 색·간판·집 앞·기척 숨기기). apps/web/lib/find/store.ts 의 FIND_SCHEMA와 같아야 한다.
ALTER TABLE find_forges ADD COLUMN IF NOT EXISTS decor jsonb NOT NULL DEFAULT '{}';
