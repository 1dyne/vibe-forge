import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

// 도깨비불 결과 · 대기열 · 이벤트 저장소.
// DATABASE_URL_WEB 또는 DATABASE_URL이 있으면 Postgres(Railway), 없으면 .data/find.json (로컬·테스트).

export type FireRecord = {
  id: string;
  idea: string;
  sentence: string;
  picked: string[];
  labels: string[];
  peak: number;
  color: string;
  reactKind: string;
  name: string;
  matches: Array<{ id: string; match: number }>;
  createdAt: string;
};

export type WaitlistRecord = {
  id: string;
  email: string;
  fireId: string | null;
  idea: string | null;
  sentence: string | null;
  picked: string[];
  peakFire: number | null;
  fireColor: string | null;
  referralCode: string;
  referredBy: string | null;
  consentedAt: string;
  marketingConsent: boolean;
  couponSentAt: string | null;
  createdAt: string;
};

export type EventRecord = { name: string; session: string | null; props: Record<string, unknown>; createdAt: string };

export type Standing = { code: string; position: number; total: number; referrals: number; alreadyJoined: boolean; fireName: string | null };

// 친구 1명(메밀묵 한 그릇)마다 앞당기는 칸 수
export const REFERRAL_BOOST = Number(process.env.FIND_REFERRAL_BOOST ?? 3);

export function newId(bytes = 6) {
  return randomBytes(bytes).toString("base64url").replace(/[-_]/g, "x");
}
function newCode(taken: Set<string>) {
  for (;;) {
    const code = randomBytes(6).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
    if (code.length === 6 && !taken.has(code)) return code;
  }
}

function rank(entries: Array<{ id: string; referralCode: string; referredBy: string | null }>, id: string) {
  const referrals = new Map<string, number>();
  for (const e of entries) if (e.referredBy) referrals.set(e.referredBy, (referrals.get(e.referredBy) ?? 0) + 1);
  const ordered = entries
    .map((e, index) => ({ e, index, key: index - REFERRAL_BOOST * (referrals.get(e.referralCode) ?? 0) }))
    .sort((a, b) => a.key - b.key || a.index - b.index);
  const me = entries.find((e) => e.id === id)!;
  return { position: ordered.findIndex((r) => r.e.id === id) + 1, referrals: referrals.get(me.referralCode) ?? 0 };
}

interface Backend {
  saveFire(fire: FireRecord): Promise<void>;
  getFire(id: string): Promise<FireRecord | null>;
  join(input: Omit<WaitlistRecord, "id" | "referralCode" | "couponSentAt" | "createdAt" | "consentedAt">): Promise<{ record: WaitlistRecord; alreadyJoined: boolean }>;
  allWaitlist(): Promise<WaitlistRecord[]>;
  markCoupon(id: string, sent: boolean): Promise<void>;
  /** 대기 신청 한 건과 그 사람이 만든 도깨비불을 지운다(삭제 요청·테스트 정리). */
  removeEntry(id: string): Promise<boolean>;
  clearEvents(): Promise<number>;
  event(e: EventRecord): Promise<void>;
  eventCounts(): Promise<Record<string, number>>;
}

// ── JSON 파일 ────────────────────────────────────────────
type FileData = { version: 1; fires: FireRecord[]; waitlist: WaitlistRecord[]; events: EventRecord[] };
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(op: () => Promise<T>): Promise<T> {
  const next = queue.then(op, op);
  queue = next.then(() => undefined, () => undefined);
  return next;
}
function dataFile() {
  if (process.env.FIND_TEST_DATA_FILE && process.env.NODE_ENV === "test") return process.env.FIND_TEST_DATA_FILE;
  const cwd = process.cwd();
  const workspace = path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps" ? path.resolve(cwd, "../..") : cwd;
  return path.join(workspace, ".data", "find.json");
}
async function readData(): Promise<FileData> {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ dataFile(), "utf8")) as FileData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, fires: [], waitlist: [], events: [] };
    throw error;
  }
}
async function writeData(data: FileData) {
  const file = dataFile();
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data), "utf8");
  await rename(tmp, file);
}

const fileBackend: Backend = {
  saveFire: (fire) => serial(async () => { const d = await readData(); d.fires.push(fire); await writeData(d); }),
  getFire: (id) => serial(async () => (await readData()).fires.find((f) => f.id === id) ?? null),
  join: (input) => serial(async () => {
    const d = await readData();
    const existing = d.waitlist.find((w) => w.email === input.email);
    if (existing) return { record: existing, alreadyJoined: true };
    const codes = new Set(d.waitlist.map((w) => w.referralCode));
    const now = new Date().toISOString();
    const record: WaitlistRecord = { ...input, id: newId(8), referralCode: newCode(codes), referredBy: input.referredBy && codes.has(input.referredBy) ? input.referredBy : null, consentedAt: now, couponSentAt: null, createdAt: now };
    d.waitlist.push(record);
    await writeData(d);
    return { record, alreadyJoined: false };
  }),
  allWaitlist: () => serial(async () => (await readData()).waitlist),
  markCoupon: (id, sent) => serial(async () => { const d = await readData(); const w = d.waitlist.find((x) => x.id === id); if (w) w.couponSentAt = sent ? new Date().toISOString() : null; await writeData(d); }),
  removeEntry: (id) => serial(async () => {
    const d = await readData();
    const w = d.waitlist.find((x) => x.id === id);
    if (!w) return false;
    d.waitlist = d.waitlist.filter((x) => x.id !== id);
    if (w.fireId) d.fires = d.fires.filter((f) => f.id !== w.fireId);
    await writeData(d);
    return true;
  }),
  clearEvents: () => serial(async () => { const d = await readData(); const n = d.events.length; d.events = []; await writeData(d); return n; }),
  event: (e) => serial(async () => { const d = await readData(); d.events.push(e); if (d.events.length > 50000) d.events.splice(0, d.events.length - 50000); await writeData(d); }),
  eventCounts: () => serial(async () => { const counts: Record<string, number> = {}; for (const e of (await readData()).events) counts[e.name] = (counts[e.name] ?? 0) + 1; return counts; })
};

// ── Postgres ────────────────────────────────────────────
export const FIND_SCHEMA = `
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
`;

let pool: pg.Pool | null = null;
let ready: Promise<void> | null = null;
function databaseUrl() {
  return process.env.DATABASE_URL_WEB?.trim() || process.env.DATABASE_URL?.trim() || "";
}
async function db() {
  pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 5, ssl: /sslmode=require/.test(databaseUrl()) ? { rejectUnauthorized: false } : undefined });
  ready ??= pool.query(FIND_SCHEMA).then(() => undefined).catch((error) => { ready = null; throw error; });
  await ready;
  return pool;
}

const rowToFire = (r: Record<string, unknown>): FireRecord => ({ id: r.id as string, idea: r.idea as string, sentence: r.sentence as string, picked: r.picked as string[], labels: r.labels as string[], peak: r.peak as number, color: r.color as string, reactKind: r.react_kind as string, name: r.name as string, matches: r.matches as FireRecord["matches"], createdAt: new Date(r.created_at as string).toISOString() });
const rowToWait = (r: Record<string, unknown>): WaitlistRecord => ({ id: r.id as string, email: r.email as string, fireId: (r.fire_id as string) ?? null, idea: (r.idea as string) ?? null, sentence: (r.sentence as string) ?? null, picked: (r.picked as string[]) ?? [], peakFire: (r.peak_fire as number) ?? null, fireColor: (r.fire_color as string) ?? null, referralCode: r.referral_code as string, referredBy: (r.referred_by as string) ?? null, consentedAt: new Date(r.consented_at as string).toISOString(), marketingConsent: Boolean(r.marketing_consent), couponSentAt: r.coupon_sent_at ? new Date(r.coupon_sent_at as string).toISOString() : null, createdAt: new Date(r.created_at as string).toISOString() });

const pgBackend: Backend = {
  async saveFire(f) {
    await (await db()).query("INSERT INTO find_fires (id, idea, sentence, picked, labels, peak, color, react_kind, name, matches, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [f.id, f.idea, f.sentence, JSON.stringify(f.picked), JSON.stringify(f.labels), f.peak, f.color, f.reactKind, f.name, JSON.stringify(f.matches), f.createdAt]);
  },
  async getFire(id) {
    const { rows } = await (await db()).query("SELECT * FROM find_fires WHERE id = $1", [id]);
    return rows[0] ? rowToFire(rows[0]) : null;
  },
  async join(input) {
    const client = await (await db()).connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('find_waitlist'))");
      const existing = await client.query("SELECT * FROM find_waitlist WHERE email = $1", [input.email]);
      if (existing.rows[0]) { await client.query("COMMIT"); return { record: rowToWait(existing.rows[0]), alreadyJoined: true }; }
      const taken = new Set((await client.query("SELECT referral_code FROM find_waitlist")).rows.map((r) => r.referral_code as string));
      const referredBy = input.referredBy && taken.has(input.referredBy) ? input.referredBy : null;
      const { rows } = await client.query(
        "INSERT INTO find_waitlist (id, email, fire_id, idea, sentence, picked, peak_fire, fire_color, referral_code, referred_by, consented_at, marketing_consent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11) RETURNING *",
        [newId(8), input.email, input.fireId, input.idea, input.sentence, JSON.stringify(input.picked), input.peakFire, input.fireColor, newCode(taken), referredBy, input.marketingConsent]
      );
      await client.query("COMMIT");
      return { record: rowToWait(rows[0]), alreadyJoined: false };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },
  async allWaitlist() {
    return (await (await db()).query("SELECT * FROM find_waitlist ORDER BY seq")).rows.map(rowToWait);
  },
  async markCoupon(id, sent) {
    await (await db()).query("UPDATE find_waitlist SET coupon_sent_at = $2 WHERE id = $1", [id, sent ? new Date() : null]);
  },
  async removeEntry(id) {
    const pool = await db();
    const { rows } = await pool.query("DELETE FROM find_waitlist WHERE id = $1 RETURNING fire_id", [id]);
    if (!rows[0]) return false;
    if (rows[0].fire_id) await pool.query("DELETE FROM find_fires WHERE id = $1", [rows[0].fire_id]);
    return true;
  },
  async clearEvents() {
    return (await (await db()).query("DELETE FROM find_events")).rowCount ?? 0;
  },
  async event(e) {
    await (await db()).query("INSERT INTO find_events (name, session, props, created_at) VALUES ($1,$2,$3,$4)", [e.name, e.session, JSON.stringify(e.props), e.createdAt]);
  },
  async eventCounts() {
    const { rows } = await (await db()).query("SELECT name, count(*)::int AS n FROM find_events GROUP BY name");
    return Object.fromEntries(rows.map((r) => [r.name, r.n]));
  }
};

export function backend(): Backend {
  return databaseUrl() ? pgBackend : fileBackend;
}
export function storageKind(): "postgres" | "file" {
  return databaseUrl() ? "postgres" : "file";
}

export const saveFire = (fire: FireRecord) => backend().saveFire(fire);
export const getFire = (id: string) => (/^[A-Za-z0-9]{4,16}$/.test(id) ? backend().getFire(id) : Promise.resolve(null));
export const recordEvent = (e: EventRecord) => backend().event(e);
export const eventCounts = () => backend().eventCounts();
export const allWaitlist = () => backend().allWaitlist();
export const markCoupon = (id: string, sent: boolean) => backend().markCoupon(id, sent);
export const removeEntry = (id: string) => backend().removeEntry(id);
export const clearEvents = () => backend().clearEvents();

export async function joinWaitlist(input: Parameters<Backend["join"]>[0]): Promise<Standing> {
  const b = backend();
  const { record, alreadyJoined } = await b.join({ ...input, email: input.email.trim().toLowerCase() });
  const all = await b.allWaitlist();
  const { position, referrals } = rank(all, record.id);
  const fire = record.fireId ? await b.getFire(record.fireId) : null;
  return { code: record.referralCode, position, total: all.length, referrals, alreadyJoined, fireName: fire?.name ?? null };
}

export async function endPool() {
  await pool?.end();
  pool = null;
  ready = null;
}
