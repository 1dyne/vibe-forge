-- 마을의 기척: 주인이 마지막으로 마을·대장간을 본 시각. apps/web/lib/find/store.ts 의 FIND_SCHEMA와 같아야 한다.
ALTER TABLE find_forges ADD COLUMN IF NOT EXISTS last_seen timestamptz;
