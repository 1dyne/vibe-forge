-- 도깨비 마을 Phase 3: 장작·나도 갖고 싶어·정해진 말·이웃·도감·방문. apps/web/lib/find/store.ts 의 FIND_SCHEMA와 같아야 한다.
CREATE TABLE IF NOT EXISTS find_fuel (from_forge text NOT NULL, to_forge text NOT NULL, day date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (from_forge, to_forge, day));
CREATE INDEX IF NOT EXISTS find_fuel_to ON find_fuel(to_forge);
CREATE TABLE IF NOT EXISTS find_want (from_forge text NOT NULL, to_forge text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (from_forge, to_forge));
CREATE TABLE IF NOT EXISTS find_note (id bigserial PRIMARY KEY, from_forge text NOT NULL, to_forge text NOT NULL, phrase text NOT NULL, day date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (from_forge, to_forge, day));
CREATE INDEX IF NOT EXISTS find_note_to ON find_note(to_forge);
CREATE TABLE IF NOT EXISTS find_neighbor (follower text NOT NULL, followee text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (follower, followee));
CREATE TABLE IF NOT EXISTS find_dex (owner_forge text NOT NULL, fire_id text NOT NULL, first_seen_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (owner_forge, fire_id));
CREATE TABLE IF NOT EXISTS find_visit (id bigserial PRIMARY KEY, visitor_forge text, host_forge text NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS find_visit_host ON find_visit(host_forge, at);
