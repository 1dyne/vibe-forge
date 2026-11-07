-- 도깨비불 주인 닉네임(공개, 욕설 필터 통과 값). apps/web/lib/find/store.ts 의 FIND_SCHEMA와 같아야 한다.
ALTER TABLE find_fires ADD COLUMN IF NOT EXISTS nickname text;
