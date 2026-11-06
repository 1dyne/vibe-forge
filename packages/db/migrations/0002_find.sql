-- 도깨비불 찾기(/find) 온보딩 페이지. apps/web/lib/find/store.ts 의 FIND_SCHEMA와 같아야 한다.
CREATE TABLE IF NOT EXISTS find_fires (
  id text PRIMARY KEY, idea text NOT NULL, sentence text NOT NULL, picked jsonb NOT NULL, labels jsonb NOT NULL,
  peak integer NOT NULL, color text NOT NULL, react_kind text NOT NULL, name text NOT NULL, matches jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS find_waitlist (
  seq bigserial UNIQUE, id text PRIMARY KEY, email text NOT NULL UNIQUE, fire_id text REFERENCES find_fires(id) ON DELETE SET NULL,
  idea text, sentence text, picked jsonb NOT NULL DEFAULT '[]', peak_fire integer, fire_color text,
  referral_code text NOT NULL UNIQUE, referred_by text, consented_at timestamptz NOT NULL, marketing_consent boolean NOT NULL DEFAULT false,
  coupon_sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS find_events (
  id bigserial PRIMARY KEY, name text NOT NULL, session text, props jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS find_events_name ON find_events(name);
