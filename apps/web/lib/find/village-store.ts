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
