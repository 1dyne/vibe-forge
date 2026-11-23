-- 계정·프로젝트 저장소를 .data의 JSON 파일에서 Postgres로 옮긴다.
-- apps/web/lib/row-store.ts 의 SCHEMA와 같아야 한다 (앱이 뜰 때도 같은 문장을 실행한다).
--
-- data에 들어가는 것은 예전 JSON 파일에 들어가던 것과 같은 모양이다. 참여자의
-- 프로젝트·프로필은 봉인된 채로(AES-256-GCM) 들어간다 — 서버에는 열쇠가 없다.
-- forge_meta는 볼륨의 JSON 파일을 이미 옮겼는지 표시한다(id = 'import:<종류>:<파일 경로>').
CREATE TABLE IF NOT EXISTS forge_users (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS forge_invites (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS forge_projects (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS forge_profiles (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS forge_meta (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
