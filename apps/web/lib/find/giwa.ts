// 본관 기와 새기기: 옛 절집 중창 때 기와 시주하듯, 대장간마다 기와 한 장에 이름과 한 줄 기원을 새긴다. 무료, 대장간당 1장.
import { lanternTextProblem } from "./lantern";
import { db, readData, serial, storageKind, writeData } from "./store";

export const GIWA_MAX = 20;
export type Giwa = { forgeId: string; nickname: string; wish: string; createdAt: string };

const pg = () => storageKind() === "postgres";
const toGiwa = (r: Record<string, unknown>): Giwa => ({ forgeId: r.forge_id as string, nickname: (r.nickname as string) ?? "이름 없는 도깨비", wish: r.wish as string, createdAt: new Date(r.created_at as string).toISOString() });
async function file() { const d = await readData(); const social = (d.social ??= {}) as Record<string, unknown[]>; return { d, list: (social.giwa ??= []) as Array<Omit<Giwa, "nickname"> & { hidden?: boolean }> }; }

export const giwaProblem = (wish: string) => lanternTextProblem(wish, GIWA_MAX, "기원 한 줄");

/** 공개된 기와(가려진 것 제외), 최근 것부터 */
export async function listGiwa(limit = 60): Promise<{ list: Giwa[]; total: number }> {
  if (pg()) {
    const c = await db();
    const [rows, n] = await Promise.all([
      c.query("SELECT g.forge_id, g.wish, g.created_at, f.nickname FROM find_giwa g JOIN find_forges f ON f.id = g.forge_id WHERE NOT g.hidden ORDER BY g.created_at DESC LIMIT $1", [limit]),
      c.query("SELECT count(*)::int AS n FROM find_giwa WHERE NOT hidden")
    ]);
    return { list: rows.rows.map(toGiwa), total: n.rows[0].n as number };
  }
  return serial(async () => {
    const f = await file();
    const forges = (f.d.forges ?? []) as Array<{ id: string; nickname: string }>;
    const shown = f.list.filter((g) => !g.hidden);
    return { list: shown.slice().reverse().slice(0, limit).map((g) => ({ ...g, nickname: forges.find((x) => x.id === g.forgeId)?.nickname ?? "이름 없는 도깨비" })), total: shown.length };
  });
}

export async function myGiwa(forgeId: string): Promise<{ wish: string } | null> {
  if (pg()) { const r = await (await db()).query("SELECT wish FROM find_giwa WHERE forge_id = $1", [forgeId]); return r.rows[0] ? { wish: r.rows[0].wish } : null; }
  return serial(async () => { const g = (await file()).list.find((x) => x.forgeId === forgeId); return g ? { wish: g.wish } : null; });
}

/** 한 장만: 이미 새겼으면 false */
export async function carveGiwa(forgeId: string, wish: string): Promise<boolean> {
  if (pg()) return ((await (await db()).query("INSERT INTO find_giwa (forge_id, wish) VALUES ($1,$2) ON CONFLICT DO NOTHING", [forgeId, wish])).rowCount ?? 0) > 0;
  return serial(async () => {
    const f = await file();
    if (f.list.some((g) => g.forgeId === forgeId)) return false;
    f.list.push({ forgeId, wish, createdAt: new Date().toISOString() });
    await writeData(f.d); return true;
  });
}

/** 운영: 신고된 기와 가리기 */
export async function hideGiwa(forgeId: string, hidden = true) {
  if (pg()) { await (await db()).query("UPDATE find_giwa SET hidden = $2 WHERE forge_id = $1", [forgeId, hidden]); return; }
  await serial(async () => { const f = await file(); const g = f.list.find((x) => x.forgeId === forgeId); if (g) { g.hidden = hidden; await writeData(f.d); } });
}
