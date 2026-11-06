-- 도깨비불 카드: 등급 계산용 조합 키와 카드 내용. apps/web/lib/find/store.ts 의 FIND_SCHEMA와 같아야 한다.
ALTER TABLE find_fires ADD COLUMN IF NOT EXISTS combo_key text;
ALTER TABLE find_fires ADD COLUMN IF NOT EXISTS card jsonb;
CREATE INDEX IF NOT EXISTS find_fires_combo ON find_fires(combo_key);
