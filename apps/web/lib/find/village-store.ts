import { createHash } from "node:crypto";
import { db, newId, readData, rowToFire, serial, storageKind, writeData, type FireRecord } from "./store";
import { pickTheme, plotFor } from "./village";

// 내 대장간 · 우체통 · 마을 소식. store.ts와 같이 Postgres가 있으면 Postgres, 없으면 .data/find.json.

export type Visibility = "public" | "link" | "private";
export type ForgeRecord = { id: string; ownerHash: string; nickname: string; theme: string; alleySeq: number; plotNo: number; visibility: Visibility; createdAt: string };
export type MailStatus = "new" | "reading" | "planned" | "done" | "wontdo";
export type MailKind = "feature" | "bug" | "decor" | "chat";
export type MailRecord = {
  id: string; forgeId: string | null; kind: MailKind; body: string; context: Record<string, string>;
  status: MailStatus; reply: string | null; replySeen: boolean; notionPageId: string | null; notionSynced: boolean; createdAt: string; updatedAt: string;
};
export type NoticeRecord = { id: number; title: string; body: string; kind: "update" | "alley" | "fix" | "event"; publishedAt: string };

export const hashToken = (token: string) => createHash("sha256").update(`find-owner:${token}`).digest("hex");

const pg = () => storageKind() === "postgres";
const toForge = (r: Record<string, unknown>): ForgeRecord => ({ id: r.id as string, ownerHash: r.owner_hash as string, nickname: r.nickname as string, theme: r.theme as string, alleySeq: r.alley_seq as number, plotNo: r.plot_no as number, visibility: r.visibility as Visibility, createdAt: new Date(r.created_at as string).toISOString() });
const toMail = (r: Record<string, unknown>): MailRecord => ({ id: r.id as string, forgeId: (r.forge_id as string) ?? null, kind: r.kind as MailKind, body: r.body as string, context: (r.context as Record<string, string>) ?? {}, status: r.status as MailStatus, reply: (r.reply as string) ?? null, replySeen: Boolean(r.reply_seen), notionPageId: (r.notion_page_id as string) ?? null, notionSynced: Boolean(r.notion_synced), createdAt: new Date(r.created_at as string).toISOString(), updatedAt: new Date(r.updated_at as string).toISOString() });
const toNotice = (r: Record<string, unknown>): NoticeRecord => ({ id: Number(r.id), title: r.title as string, body: r.body as string, kind: r.kind as NoticeRecord["kind"], publishedAt: new Date(r.published_at as string).toISOString() });

// ── 대장간 ─────────────────────────────────────────────
export async function forgeForOwner(ownerHash: string): Promise<ForgeRecord | null> {
  if (pg()) { const { rows } = await (await db()).query("SELECT * FROM find_forges WHERE owner_hash = $1", [ownerHash]); return rows[0] ? toForge(rows[0]) : null; }
  return serial(async () => ((await readData()).forges as ForgeRecord[] | undefined)?.find((f) => f.ownerHash === ownerHash) ?? null);
}

export async function getForge(id: string): Promise<ForgeRecord | null> {
  if (!/^[A-Za-z0-9]{4,16}$/.test(id)) return null;
  if (pg()) { const { rows } = await (await db()).query("SELECT * FROM find_forges WHERE id = $1", [id]); return rows[0] ? toForge(rows[0]) : null; }
  return serial(async () => ((await readData()).forges as ForgeRecord[] | undefined)?.find((f) => f.id === id) ?? null);
}

/** 이 기기 주인의 대장간. 없으면 장작과 가장 맞는 골목의 다음 빈 터에 새로 짓는다. */
export async function ensureForge(ownerHash: string, nickname: string, picked: string[]): Promise<{ forge: ForgeRecord; isNew: boolean; left: number }> {
  if (pg()) {
    const client = await (await db()).connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('find_forges'))");
      const existing = await client.query("SELECT * FROM find_forges WHERE owner_hash = $1", [ownerHash]);
      if (existing.rows[0]) {
        if (nickname && existing.rows[0].nickname !== nickname) await client.query("UPDATE find_forges SET nickname = $2 WHERE id = $1", [existing.rows[0].id, nickname]);
        await client.query("COMMIT");
        const f = toForge({ ...existing.rows[0], nickname: nickname || existing.rows[0].nickname });
        return { forge: f, isNew: false, left: -1 };
      }
      const counts = Object.fromEntries((await client.query("SELECT theme, count(*)::int AS n FROM find_forges GROUP BY theme")).rows.map((r) => [r.theme, r.n]));
      const theme = pickTheme(picked, counts);
      const { seq, plotNo, left } = plotFor(counts[theme.id] ?? 0);
      const { rows } = await client.query("INSERT INTO find_forges (id, owner_hash, nickname, theme, alley_seq, plot_no) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [newId(), ownerHash, nickname, theme.id, seq, plotNo]);
      await client.query("COMMIT");
      return { forge: toForge(rows[0]), isNew: true, left };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  return serial(async () => {
    const d = await readData();
    const forges = (d.forges ??= []) as ForgeRecord[];
    const existing = forges.find((f) => f.ownerHash === ownerHash);
    if (existing) { if (nickname) existing.nickname = nickname; await writeData(d); return { forge: existing, isNew: false, left: -1 }; }
    const counts: Record<string, number> = {};
    for (const f of forges) counts[f.theme] = (counts[f.theme] ?? 0) + 1;
    const theme = pickTheme(picked, counts);
    const { seq, plotNo, left } = plotFor(counts[theme.id] ?? 0);
    const forge: ForgeRecord = { id: newId(), ownerHash, nickname, theme: theme.id, alleySeq: seq, plotNo, visibility: "public", createdAt: new Date().toISOString() };
    forges.push(forge);
    await writeData(d);
    return { forge, isNew: true, left };
  });
}

/** 대장간 선반의 도깨비불들 (최근 것부터) */
export async function forgeFires(forgeId: string): Promise<FireRecord[]> {
  if (pg()) return (await (await db()).query("SELECT * FROM find_fires WHERE forge_id = $1 ORDER BY created_at DESC LIMIT 60", [forgeId])).rows.map(rowToFire);
  return serial(async () => (await readData()).fires.filter((f) => f.forgeId === forgeId).reverse().slice(0, 60));
}

export async function setVisibility(forgeId: string, visibility: Visibility) {
  if (pg()) { await (await db()).query("UPDATE find_forges SET visibility = $2 WHERE id = $1", [forgeId, visibility]); return; }
  await serial(async () => { const d = await readData(); const f = (d.forges as ForgeRecord[] | undefined)?.find((x) => x.id === forgeId); if (f) f.visibility = visibility; await writeData(d); });
}

// ── 우체통 ─────────────────────────────────────────────
export async function createMail(input: { forgeId: string | null; kind: MailKind; body: string; context: Record<string, string> }): Promise<MailRecord> {
  const now = new Date().toISOString();
  const mail: MailRecord = { id: newId(8), ...input, status: "new", reply: null, replySeen: false, notionPageId: null, notionSynced: false, createdAt: now, updatedAt: now };
  if (pg()) {
    await (await db()).query("INSERT INTO find_mail (id, forge_id, kind, body, context, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)", [mail.id, mail.forgeId, mail.kind, mail.body, JSON.stringify(mail.context), now]);
    return mail;
  }
  return serial(async () => { const d = await readData(); ((d.mails ??= []) as MailRecord[]).push(mail); await writeData(d); return mail; });
}

export async function listMail(): Promise<MailRecord[]> {
  if (pg()) return (await (await db()).query("SELECT * FROM find_mail ORDER BY created_at DESC LIMIT 500")).rows.map(toMail);
  return serial(async () => [...((await readData()).mails as MailRecord[] | undefined ?? [])].reverse());
}

export async function updateMail(id: string, patch: Partial<Pick<MailRecord, "status" | "reply" | "notionPageId" | "notionSynced" | "replySeen">>) {
  if (pg()) {
    const cols: Record<string, string> = { status: "status", reply: "reply", notionPageId: "notion_page_id", notionSynced: "notion_synced", replySeen: "reply_seen" };
    const keys = Object.keys(patch) as Array<keyof typeof patch>;
    if (!keys.length) return;
    const sets = keys.map((k, i) => `${cols[k]} = $${i + 2}`).join(", ");
    await (await db()).query(`UPDATE find_mail SET ${sets}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => patch[k])]);
    return;
  }
  await serial(async () => { const d = await readData(); const m = (d.mails as MailRecord[] | undefined)?.find((x) => x.id === id); if (m) Object.assign(m, patch, { updatedAt: new Date().toISOString() }); await writeData(d); });
}

/** 반영 완료됐는데 주인이 아직 못 본 답장 */
export async function unseenReplies(forgeId: string): Promise<MailRecord[]> {
  return (await listMail()).filter((m) => m.forgeId === forgeId && m.status === "done" && m.reply && !m.replySeen);
}

// ── 마을 소식 ───────────────────────────────────────────
export async function createNotice(input: Omit<NoticeRecord, "id" | "publishedAt">): Promise<NoticeRecord> {
  if (pg()) return toNotice((await (await db()).query("INSERT INTO find_notices (title, body, kind) VALUES ($1,$2,$3) RETURNING *", [input.title, input.body, input.kind])).rows[0]);
  return serial(async () => {
    const d = await readData();
    const list = (d.notices ??= []) as NoticeRecord[];
    const n: NoticeRecord = { ...input, id: (list.at(-1)?.id ?? 0) + 1, publishedAt: new Date().toISOString() };
    list.push(n); await writeData(d); return n;
  });
}

export async function latestNotices(limit = 5): Promise<NoticeRecord[]> {
  if (pg()) return (await (await db()).query("SELECT * FROM find_notices ORDER BY id DESC LIMIT $1", [limit])).rows.map(toNotice);
  return serial(async () => [...((await readData()).notices as NoticeRecord[] | undefined ?? [])].reverse().slice(0, limit));
}

// ── 설정값 (노션 동기화 시각 등) ─────────────────────────
export async function getMeta(key: string): Promise<string | null> {
  if (pg()) return (await (await db()).query("SELECT value FROM find_meta WHERE key = $1", [key])).rows[0]?.value ?? null;
  return serial(async () => (await readData()).meta?.[key] ?? null);
}
export async function setMeta(key: string, value: string) {
  if (pg()) { await (await db()).query("INSERT INTO find_meta (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, value]); return; }
  await serial(async () => { const d = await readData(); (d.meta ??= {})[key] = value; await writeData(d); });
}

// ── 놀러 가기: 장작 · 나도 갖고 싶어 · 정해진 말 · 이웃 · 도감 · 방문 ─────────
// 자유 입력·DM은 없다. 정해진 말만 남길 수 있다 (2차 피해 방지).
export const PHRASES = ["나도 갖고 싶어", "이거 천재다", "만들면 알려줘!", "장작 넣고 감", "응원해"] as const;

type Social = { fuel: Array<{ from: string; to: string; day: string; at: string }>; want: Array<{ from: string; to: string; at: string }>; note: Array<{ from: string; to: string; phrase: string; day: string; at: string }>; neighbor: Array<{ follower: string; followee: string; at: string }>; dex: Array<{ owner: string; fireId: string; at: string }>; visit: Array<{ visitor: string | null; host: string; at: string }> };
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // 한국 날짜 기준 하루 1번

async function fileSocial<T>(op: (s: Social) => T, save = false): Promise<T> {
  return serial(async () => {
    const d = await readData();
    const raw = (d.social ??= {}) as Record<string, unknown[]>;
    for (const k of ["fuel", "want", "note", "neighbor", "dex", "visit"]) raw[k] ??= [];
    const out = op(raw as unknown as Social);
    if (save) await writeData(d);
    return out;
  });
}

/** 장작 넣기: 같은 방문자는 같은 집에 하루 1번. 이미 넣었으면 false */
export async function giveFuel(from: string, to: string): Promise<boolean> {
  if (from === to) return false;
  const day = today();
  if (pg()) return ((await (await db()).query("INSERT INTO find_fuel (from_forge, to_forge, day) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [from, to, day])).rowCount ?? 0) > 0;
  return fileSocial((s) => { if (s.fuel.some((f) => f.from === from && f.to === to && f.day === day)) return false; s.fuel.push({ from, to, day, at: new Date().toISOString() }); return true; }, true);
}

export async function giveWant(from: string, to: string): Promise<boolean> {
  if (from === to) return false;
  if (pg()) return ((await (await db()).query("INSERT INTO find_want (from_forge, to_forge) VALUES ($1,$2) ON CONFLICT DO NOTHING", [from, to])).rowCount ?? 0) > 0;
  return fileSocial((s) => { if (s.want.some((w) => w.from === from && w.to === to)) return false; s.want.push({ from, to, at: new Date().toISOString() }); return true; }, true);
}

/** 정해진 말 남기기: 같은 집에 하루 한 마디 */
export async function leaveNote(from: string, to: string, phrase: string): Promise<boolean> {
  if (from === to || !(PHRASES as readonly string[]).includes(phrase)) return false;
  const day = today();
  if (pg()) return ((await (await db()).query("INSERT INTO find_note (from_forge, to_forge, phrase, day) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [from, to, phrase, day])).rowCount ?? 0) > 0;
  return fileSocial((s) => { if (s.note.some((n) => n.from === from && n.to === to && n.day === day)) return false; s.note.push({ from, to, phrase, day, at: new Date().toISOString() }); return true; }, true);
}

export async function setNeighbor(follower: string, followee: string, on: boolean) {
  if (follower === followee) return;
  if (pg()) {
    if (on) await (await db()).query("INSERT INTO find_neighbor (follower, followee) VALUES ($1,$2) ON CONFLICT DO NOTHING", [follower, followee]);
    else await (await db()).query("DELETE FROM find_neighbor WHERE follower = $1 AND followee = $2", [follower, followee]);
    return;
  }
  await fileSocial((s) => { s.neighbor = s.neighbor.filter((n) => !(n.follower === follower && n.followee === followee)); if (on) s.neighbor.push({ follower, followee, at: new Date().toISOString() }); }, true);
}

/** 들른 집의 도깨비불을 내 도감에 한 칸 추가 + 방문 기록. 새로 들어간 도감 칸 수를 돌려준다. */
export async function recordVisit(visitor: string | null, host: string, fireIds: string[]): Promise<number> {
  if (pg()) {
    const pool = await db();
    await pool.query("INSERT INTO find_visit (visitor_forge, host_forge) VALUES ($1,$2)", [visitor, host]);
    if (!visitor || visitor === host || !fireIds.length) return 0;
    const r = await pool.query("INSERT INTO find_dex (owner_forge, fire_id) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING", [visitor, fireIds]);
    return r.rowCount ?? 0;
  }
  return fileSocial((s) => {
    s.visit.push({ visitor, host, at: new Date().toISOString() });
    if (!visitor || visitor === host) return 0;
    let added = 0;
    for (const fireId of fireIds) if (!s.dex.some((x) => x.owner === visitor && x.fireId === fireId)) { s.dex.push({ owner: visitor, fireId, at: new Date().toISOString() }); added++; }
    return added;
  }, true);
}

export type SocialState = { fuelToday: number; fuelTotal: number; wants: number; notes: Array<{ phrase: string; from: string; nickname: string; at: string }>; neighbors: number; visitsWeek: number; mine: { fuelGivenToday: boolean; wanted: boolean; notedToday: boolean; neighbor: boolean } };

export async function socialState(host: string, viewer: string | null): Promise<SocialState> {
  const day = today();
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  if (pg()) {
    const pool = await db();
    const [counts, notes, mine] = await Promise.all([
      pool.query(`SELECT
        (SELECT count(*)::int FROM find_fuel WHERE to_forge = $1 AND day = $2) AS fuel_today,
        (SELECT count(*)::int FROM find_fuel WHERE to_forge = $1) AS fuel_total,
        (SELECT count(*)::int FROM find_want WHERE to_forge = $1) AS wants,
        (SELECT count(*)::int FROM find_neighbor WHERE followee = $1) AS neighbors,
        (SELECT count(*)::int FROM find_visit WHERE host_forge = $1 AND at > $3 AND visitor_forge IS DISTINCT FROM $1) AS visits`, [host, day, weekAgo]),
      pool.query("SELECT n.phrase, n.from_forge, n.created_at, f.nickname FROM find_note n LEFT JOIN find_forges f ON f.id = n.from_forge WHERE n.to_forge = $1 ORDER BY n.created_at DESC LIMIT 20", [host]),
      viewer ? pool.query(`SELECT
        EXISTS(SELECT 1 FROM find_fuel WHERE from_forge = $1 AND to_forge = $2 AND day = $3) AS fuel,
        EXISTS(SELECT 1 FROM find_want WHERE from_forge = $1 AND to_forge = $2) AS want,
        EXISTS(SELECT 1 FROM find_note WHERE from_forge = $1 AND to_forge = $2 AND day = $3) AS note,
        EXISTS(SELECT 1 FROM find_neighbor WHERE follower = $1 AND followee = $2) AS neighbor`, [viewer, host, day]) : null
    ]);
    const c = counts.rows[0], m = mine?.rows[0];
    return {
      fuelToday: c.fuel_today, fuelTotal: c.fuel_total, wants: c.wants, neighbors: c.neighbors, visitsWeek: c.visits,
      notes: notes.rows.map((r) => ({ phrase: r.phrase, from: r.from_forge, nickname: r.nickname ?? "이름 없는 도깨비", at: new Date(r.created_at).toISOString() })),
      mine: { fuelGivenToday: Boolean(m?.fuel), wanted: Boolean(m?.want), notedToday: Boolean(m?.note), neighbor: Boolean(m?.neighbor) }
    };
  }
  const forges = (await serial(async () => (await readData()).forges as ForgeRecord[] | undefined)) ?? [];
  return fileSocial((s) => ({
    fuelToday: s.fuel.filter((f) => f.to === host && f.day === day).length,
    fuelTotal: s.fuel.filter((f) => f.to === host).length,
    wants: s.want.filter((w) => w.to === host).length,
    neighbors: s.neighbor.filter((n) => n.followee === host).length,
    visitsWeek: s.visit.filter((v) => v.host === host && v.at > weekAgo && v.visitor !== host).length,
    notes: s.note.filter((n) => n.to === host).reverse().slice(0, 20).map((n) => ({ phrase: n.phrase, from: n.from, nickname: forges.find((f) => f.id === n.from)?.nickname ?? "이름 없는 도깨비", at: n.at })),
    mine: {
      fuelGivenToday: Boolean(viewer && s.fuel.some((f) => f.from === viewer && f.to === host && f.day === day)),
      wanted: Boolean(viewer && s.want.some((w) => w.from === viewer && w.to === host)),
      notedToday: Boolean(viewer && s.note.some((n) => n.from === viewer && n.to === host && n.day === day)),
      neighbor: Boolean(viewer && s.neighbor.some((n) => n.follower === viewer && n.followee === host))
    }
  }));
}

/** 내 이웃 대장간들 */
export async function neighborsOf(forgeId: string): Promise<ForgeRecord[]> {
  if (pg()) return (await (await db()).query("SELECT f.* FROM find_neighbor n JOIN find_forges f ON f.id = n.followee WHERE n.follower = $1 ORDER BY n.created_at DESC", [forgeId])).rows.map(toForge);
  const ids = await fileSocial((s) => s.neighbor.filter((n) => n.follower === forgeId).map((n) => n.followee));
  const forges = (await serial(async () => (await readData()).forges as ForgeRecord[] | undefined)) ?? [];
  return ids.map((id) => forges.find((f) => f.id === id)).filter((f): f is ForgeRecord => Boolean(f));
}

/** 내 도감: 들른 집에서 만난 도깨비불들 */
export async function dexOf(forgeId: string): Promise<FireRecord[]> {
  if (pg()) return (await (await db()).query("SELECT f.* FROM find_dex d JOIN find_fires f ON f.id = d.fire_id WHERE d.owner_forge = $1 ORDER BY d.first_seen_at DESC LIMIT 300", [forgeId])).rows.map(rowToFire);
  const ids = await fileSocial((s) => s.dex.filter((x) => x.owner === forgeId).map((x) => x.fireId).reverse());
  const fires = await serial(async () => (await readData()).fires);
  return ids.map((id) => fires.find((f) => f.id === id)).filter((f): f is FireRecord => Boolean(f));
}

/** 아무 집이나: 공개된 대장간 하나 (나 빼고) */
export async function randomForge(except: string | null): Promise<ForgeRecord | null> {
  if (pg()) { const { rows } = await (await db()).query("SELECT * FROM find_forges WHERE visibility = 'public' AND id IS DISTINCT FROM $1 ORDER BY random() LIMIT 1", [except]); return rows[0] ? toForge(rows[0]) : null; }
  const forges = ((await serial(async () => (await readData()).forges as ForgeRecord[] | undefined)) ?? []).filter((f) => f.visibility === "public" && f.id !== except);
  return forges.length ? forges[Math.floor(Math.random() * forges.length)] : null;
}

/** 대기 순번용: 도깨비불별로 그 불이 사는 대장간이 받은 장작 수 */
export async function fuelByFire(fireIds: string[]): Promise<Map<string, number>> {
  if (!fireIds.length) return new Map();
  if (pg()) {
    const { rows } = await (await db()).query("SELECT f.id, count(fu.*)::int AS n FROM find_fires f JOIN find_fuel fu ON fu.to_forge = f.forge_id WHERE f.id = ANY($1::text[]) GROUP BY f.id", [fireIds]);
    return new Map(rows.map((r) => [r.id as string, r.n as number]));
  }
  const fires = await serial(async () => (await readData()).fires);
  const counts = await fileSocial((s) => { const m = new Map<string, number>(); for (const f of s.fuel) m.set(f.to, (m.get(f.to) ?? 0) + 1); return m; });
  return new Map(fireIds.map((id) => [id, counts.get(fires.find((f) => f.id === id)?.forgeId ?? "") ?? 0]));
}

// ── Phase 4: 손바닥 마을 ─────────────────────────────────
export type HouseView = {
  forgeId: string | null; plotNo: number; nickname: string; locked: boolean;
  color: string; reactKind: string; peak: number; fuel: number; wants: number; visits7: number; fires: number;
};

type AllSocial = { forges: ForgeRecord[]; fires: FireRecord[]; fuel: Array<{ to: string; from: string }>; want: Array<{ to: string; at: string }>; visit: Array<{ host: string; visitor: string | null; at: string }>; neighbor: Array<{ follower: string; followee: string }> };

async function snapshot(): Promise<AllSocial> {
  if (pg()) {
    const pool = await db();
    const [forges, fires, fuel, want, visit, neighbor] = await Promise.all([
      pool.query("SELECT * FROM find_forges"),
      pool.query("SELECT DISTINCT ON (forge_id) * FROM find_fires WHERE forge_id IS NOT NULL ORDER BY forge_id, created_at DESC"),
      pool.query("SELECT from_forge, to_forge FROM find_fuel"),
      pool.query("SELECT to_forge, created_at FROM find_want"),
      pool.query("SELECT host_forge, visitor_forge, at FROM find_visit WHERE at > now() - interval '7 days'"),
      pool.query("SELECT follower, followee FROM find_neighbor")
    ]);
    return {
      forges: forges.rows.map(toForge), fires: fires.rows.map(rowToFire),
      fuel: fuel.rows.map((r) => ({ from: r.from_forge, to: r.to_forge })), want: want.rows.map((r) => ({ to: r.to_forge, at: new Date(r.created_at).toISOString() })),
      visit: visit.rows.map((r) => ({ host: r.host_forge, visitor: r.visitor_forge, at: new Date(r.at).toISOString() })), neighbor: neighbor.rows
    };
  }
  return serial(async () => {
    const d = await readData();
    const social = (d.social ?? {}) as Partial<Social>;
    const latest = new Map<string, FireRecord>();
    for (const f of d.fires) if (f.forgeId) latest.set(f.forgeId, f);
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    return {
      forges: (d.forges as ForgeRecord[] | undefined) ?? [], fires: [...latest.values()],
      fuel: (social.fuel ?? []).map((f) => ({ from: f.from, to: f.to })), want: (social.want ?? []).map((w) => ({ to: w.to, at: w.at })),
      visit: (social.visit ?? []).filter((v) => v.at > weekAgo), neighbor: social.neighbor ?? []
    };
  });
}

function countBy<T>(list: T[], key: (x: T) => string) {
  const m = new Map<string, number>();
  for (const x of list) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return m;
}

/** 마을 전체: 골목별 주민 수, 마을 장작 총합, 이번 주 가장 갖고 싶은 발명품 */
export async function villageOverview() {
  const s = await snapshot();
  const alleys = new Map<string, { theme: string; seq: number; residents: number }>();
  for (const f of s.forges) {
    const key = `${f.theme}:${f.alleySeq}`;
    const a = alleys.get(key) ?? { theme: f.theme, seq: f.alleySeq, residents: 0 };
    a.residents++; alleys.set(key, a);
  }
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const wantsWeek = countBy(s.want.filter((w) => w.at > weekAgo), (w) => w.to);
  const top = [...wantsWeek.entries()].sort((a, b) => b[1] - a[1])[0];
  const topForge = top ? s.forges.find((f) => f.id === top[0] && f.visibility === "public") : null;
  const topFire = topForge ? s.fires.find((f) => f.forgeId === topForge.id) : null;
  const activeVisitors = new Set(s.visit.filter((v) => v.at > new Date(Date.now() - 30 * 60_000).toISOString()).map((v) => v.visitor ?? `anon:${v.host}`)).size;
  return {
    alleys: [...alleys.values()].sort((a, b) => a.theme.localeCompare(b.theme) || a.seq - b.seq),
    totalFuel: s.fuel.length,
    totalForges: s.forges.length,
    totalFires: s.fires.length,
    // "지금 마을에 떠 있는 도깨비불" 근사치: 최근 30분 방문자 + 최근 활동한 집 (실시간 위치 동기화 아님)
    floating: Math.max(activeVisitors, Math.min(s.forges.length, 3 + activeVisitors * 2)),
    topWant: topForge && topFire ? { forgeId: topForge.id, nickname: topForge.nickname, fireName: topFire.name, color: topFire.color, wants: top![1] } : null
  };
}

/** 골목 지도: 터 번호 순서대로 집들 + 이웃 끈. 비공개·링크 전용 집은 '잠긴 집'으로 자리만 보인다. */
export async function alleyHouses(theme: string, seq: number) {
  const s = await snapshot();
  const fuel = countBy(s.fuel, (f) => f.to);
  const wants = countBy(s.want, (w) => w.to);
  const visits = countBy(s.visit.filter((v) => v.visitor !== v.host), (v) => v.host);
  const forges = s.forges.filter((f) => f.theme === theme && f.alleySeq === seq).sort((a, b) => a.plotNo - b.plotNo);
  const ids = new Set(forges.map((f) => f.id));
  const houses: HouseView[] = forges.map((f) => {
    const fire = s.fires.find((x) => x.forgeId === f.id);
    const locked = f.visibility !== "public";
    return {
      forgeId: locked ? null : f.id, plotNo: f.plotNo, nickname: locked ? "잠긴 집" : f.nickname, locked,
      color: fire?.color ?? "#4FB3A6", reactKind: fire?.reactKind ?? "none", peak: fire?.peak ?? 20,
      fuel: fuel.get(f.id) ?? 0, wants: wants.get(f.id) ?? 0, visits7: visits.get(f.id) ?? 0, fires: 0
    };
  });
  const publicIds = new Set(houses.filter((h) => h.forgeId).map((h) => h.forgeId!));
  const strings = s.neighbor.filter((n) => ids.has(n.follower) && ids.has(n.followee) && publicIds.has(n.follower) && publicIds.has(n.followee)).map((n) => ({ follower: n.follower, followee: n.followee }));
  return { houses, strings };
}

// ── 공사 계획판: 다인이 후보를 올리면 주민이 자기 장작으로 투표 ─────
export type PlanView = { id: number; title: string; description: string; status: "voting" | "building" | "done"; fuel: number; mine: number };
export const PLAN_MAX_PER_PLAN = Math.max(1, Number(process.env.FIND_PLAN_MAX ?? 3));

export async function listPlans(viewer: string | null): Promise<PlanView[]> {
  if (pg()) {
    const { rows } = await (await db()).query(`SELECT p.*, COALESCE(sum(v.fuel), 0)::int AS fuel, COALESCE(max(CASE WHEN v.forge_id = $1 THEN v.fuel END), 0)::int AS mine
      FROM find_plan p LEFT JOIN find_plan_vote v ON v.plan_id = p.id GROUP BY p.id ORDER BY p.status = 'voting' DESC, fuel DESC, p.id DESC`, [viewer]);
    return rows.map((r) => ({ id: Number(r.id), title: r.title, description: r.description, status: r.status, fuel: r.fuel, mine: r.mine }));
  }
  return serial(async () => {
    const d = await readData();
    const plans = ((d.social?.plan ?? []) as Array<{ id: number; title: string; description: string; status: PlanView["status"] }>);
    const votes = ((d.social?.planVote ?? []) as Array<{ planId: number; forgeId: string; fuel: number }>);
    return plans.map((p) => ({ ...p, fuel: votes.filter((v) => v.planId === p.id).reduce((n, v) => n + v.fuel, 0), mine: votes.find((v) => v.planId === p.id && v.forgeId === viewer)?.fuel ?? 0 }))
      .sort((a, b) => Number(b.status === "voting") - Number(a.status === "voting") || b.fuel - a.fuel);
  });
}

/** 투표에 쓸 수 있는 장작 = 1 + 내 대장간이 받은 장작. 후보 하나에 최대 PLAN_MAX_PER_PLAN개 */
export async function voteBudget(forgeId: string): Promise<{ total: number; used: number }> {
  if (pg()) {
    const { rows } = await (await db()).query("SELECT (SELECT count(*)::int FROM find_fuel WHERE to_forge = $1) AS got, (SELECT COALESCE(sum(fuel), 0)::int FROM find_plan_vote WHERE forge_id = $1) AS used", [forgeId]);
    return { total: 1 + rows[0].got, used: rows[0].used };
  }
  return serial(async () => {
    const d = await readData();
    const got = ((d.social?.fuel ?? []) as Array<{ to: string }>).filter((f) => f.to === forgeId).length;
    const used = ((d.social?.planVote ?? []) as Array<{ forgeId: string; fuel: number }>).filter((v) => v.forgeId === forgeId).reduce((n, v) => n + v.fuel, 0);
    return { total: 1 + got, used };
  });
}

export async function setPlanVote(planId: number, forgeId: string, fuel: number): Promise<{ ok: boolean; reason?: string }> {
  const plans = await listPlans(forgeId);
  const plan = plans.find((p) => p.id === planId);
  if (!plan || plan.status !== "voting") return { ok: false, reason: "투표 중인 후보가 아니야." };
  const want = Math.max(0, Math.min(PLAN_MAX_PER_PLAN, Math.floor(fuel)));
  const budget = await voteBudget(forgeId);
  if (budget.used - plan.mine + want > budget.total) return { ok: false, reason: `장작이 모자라. 친구가 네 대장간에 장작을 넣어주면 더 쓸 수 있어. (가진 장작 ${budget.total}개)` };
  if (pg()) {
    if (want === 0) await (await db()).query("DELETE FROM find_plan_vote WHERE plan_id = $1 AND forge_id = $2", [planId, forgeId]);
    else await (await db()).query("INSERT INTO find_plan_vote (plan_id, forge_id, fuel) VALUES ($1,$2,$3) ON CONFLICT (plan_id, forge_id) DO UPDATE SET fuel = EXCLUDED.fuel, updated_at = now()", [planId, forgeId, want]);
    return { ok: true };
  }
  await serial(async () => {
    const d = await readData();
    const social = (d.social ??= {}) as Record<string, unknown[]>;
    const votes = ((social.planVote ??= []) as Array<{ planId: number; forgeId: string; fuel: number }>).filter((v) => !(v.planId === planId && v.forgeId === forgeId));
    if (want > 0) votes.push({ planId, forgeId, fuel: want });
    social.planVote = votes;
    await writeData(d);
  });
  return { ok: true };
}

export async function createPlan(title: string, description: string) {
  if (pg()) { await (await db()).query("INSERT INTO find_plan (title, description) VALUES ($1,$2)", [title, description]); return; }
  await serial(async () => { const d = await readData(); const plans = ((d.social ??= {}).plan ??= []) as Array<{ id: number }>; plans.push({ id: (plans.at(-1)?.id ?? 0) + 1, title, description, status: "voting" } as never); await writeData(d); });
}

export async function setPlanStatus(id: number, status: PlanView["status"]) {
  if (pg()) { await (await db()).query("UPDATE find_plan SET status = $2 WHERE id = $1", [id, status]); return; }
  await serial(async () => { const d = await readData(); const p = ((d.social?.plan ?? []) as Array<{ id: number; status: string }>).find((x) => x.id === id); if (p) p.status = status; await writeData(d); });
}

// ── 집 신고 ─────────────────────────────────────────────
export const REPORT_REASONS = ["불쾌한 이름", "개인정보가 보여요", "광고·도배", "기타"] as const;
export async function createReport(forgeId: string, reporter: string | null, reason: string) {
  if (pg()) { await (await db()).query("INSERT INTO find_report (forge_id, reporter, reason) VALUES ($1,$2,$3)", [forgeId, reporter, reason]); return; }
  await serial(async () => { const d = await readData(); ((d.social ??= {}).report ??= []).push({ id: Date.now(), forgeId, reporter, reason, resolved: false, at: new Date().toISOString() }); await writeData(d); });
}
export async function listReports(): Promise<Array<{ id: number; forgeId: string; reason: string; resolved: boolean; at: string }>> {
  if (pg()) return (await (await db()).query("SELECT * FROM find_report ORDER BY created_at DESC LIMIT 200")).rows.map((r) => ({ id: Number(r.id), forgeId: r.forge_id, reason: r.reason, resolved: r.resolved, at: new Date(r.created_at).toISOString() }));
  return serial(async () => [...(((await readData()).social?.report ?? []) as Array<{ id: number; forgeId: string; reason: string; resolved: boolean; at: string }>)].reverse());
}
export async function resolveReport(id: number) {
  if (pg()) { await (await db()).query("UPDATE find_report SET resolved = true WHERE id = $1", [id]); return; }
  await serial(async () => { const d = await readData(); const r = ((d.social?.report ?? []) as Array<{ id: number; resolved: boolean }>).find((x) => x.id === id); if (r) r.resolved = true; await writeData(d); });
}
