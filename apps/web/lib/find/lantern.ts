// 소원 등불. "누구를 위해" + 기원 한 줄을 적어 마을에 거는 한지 초롱.
// - 같은 소원(같은 대상 갈래·감지·반응 장작)끼리 한 줄에 꿰여 호수 위 '소원 줄'이 된다(하회 줄불처럼).
// - 솜씨 도깨비(메이커)는 "만들어볼게"를 누를 수 있다. 완성 인증(사진)은 받지 않는다 — 관리 부담이 없게.
// - 주인이 "이뤄졌어"를 누르면 등불은 호수에 띄운 유등이 된다(진주 남강유등처럼).
// - 무료 등불: 내 대장간의 도깨비불 수만큼(최소 1개). 공개 범위: 전체 / 대상 이름 가리기 / 나만 보기, 도깨비불 카드 함께 공개는 선택.
import { FOLLOW, ROOTS, type Chip } from "./chips";
import { nicknameProblem } from "./nickname";
import { db, newId, readData, serial, storageKind, writeData } from "./store";

export const TARGET_MAX = 12;
export const WISH_MAX = 30;

export type LanternStatus = "lit" | "done";
export type LanternRecord = {
  id: string; forgeId: string; fireId: string | null; target: string; wish: string;
  hideTarget: boolean; private: boolean; shareCard: boolean; groupKey: string; status: LanternStatus; createdAt: string; doneAt: string | null;
};
type MakerRecord = { lanternId: string; forgeId: string; at: string };

const ALL: Chip[] = [...ROOTS, ...Object.values(FOLLOW).flat()];
const chip = (id: string) => ALL.find((c) => c.id === id);
const pg = () => storageKind() === "postgres";

/** 등불 글 검사: 욕설·주소, 전화번호처럼 보이는 숫자열 */
export function lanternTextProblem(text: string, max: number, what: string): string | null {
  const t = text.trim();
  if (!t) return `‘${what}’를 적어줘.`;
  if (/\d[\d\s-]{3,}\d/.test(t)) return "전화번호 같은 숫자는 못 적어.";
  if (t.length > max) return `‘${what}’는 ${max}자까지만 돼.`;
  const p = nicknameProblem(t.slice(0, 12));
  if (p) return p.includes("주소") ? "주소나 연락처는 적을 수 없어." : "그 말은 좀… 다르게 적어줘.";
  if (t.length > 12 && nicknameProblem(t.slice(12).slice(0, 12))) return "그 말은 좀… 다르게 적어줘.";
  return null;
}

/** 같은 소원 판정: 뿌리 장작 중 누구(w)·감지(s)·반응(r) 첫 번째 */
export function groupKeyOf(picked: string[]): string {
  const first = (prefix: string) => picked.find((id) => id.startsWith(prefix) && ROOTS.some((r) => r.id === id)) ?? picked.find((id) => id.startsWith(prefix)) ?? "*";
  return `${first("w_")}|${first("s_")}|${first("r_")}`;
}
export function groupLabel(key: string): string {
  const [w, s, r] = key.split("|");
  const parts = [w !== "*" ? chip(w)?.label : "누군가를 위해", s !== "*" ? chip(s)?.label : null, r !== "*" ? chip(r)?.label : null].filter(Boolean);
  return parts.join(" · ") || "소원";
}

export function lanternAllowance(fireCount: number) { return Math.max(1, fireCount); }

const toLantern = (r: Record<string, unknown>): LanternRecord => ({
  id: r.id as string, forgeId: r.forge_id as string, fireId: (r.fire_id as string) ?? null, target: r.target as string, wish: r.wish as string,
  hideTarget: Boolean(r.hide_target), private: Boolean(r.private), shareCard: Boolean(r.share_card), groupKey: r.group_key as string,
  status: r.status as LanternStatus, createdAt: new Date(r.created_at as string).toISOString(), doneAt: r.done_at ? new Date(r.done_at as string).toISOString() : null
});

async function fileState() {
  const d = await readData();
  const social = (d.social ??= {}) as Record<string, unknown[]>;
  return { d, lanterns: (social.lanterns ??= []) as LanternRecord[], makers: (social.lanternMakers ??= []) as MakerRecord[] };
}

export async function forgeLanterns(forgeId: string): Promise<LanternRecord[]> {
  if (pg()) return (await (await db()).query("SELECT * FROM find_lantern WHERE forge_id = $1 ORDER BY created_at DESC", [forgeId])).rows.map(toLantern);
  return serial(async () => (await fileState()).lanterns.filter((l) => l.forgeId === forgeId).reverse());
}

export async function createLantern(input: Omit<LanternRecord, "id" | "status" | "createdAt" | "doneAt">): Promise<LanternRecord> {
  const rec: LanternRecord = { ...input, id: newId(8), status: "lit", createdAt: new Date().toISOString(), doneAt: null };
  if (pg()) {
    await (await db()).query("INSERT INTO find_lantern (id, forge_id, fire_id, target, wish, hide_target, private, share_card, group_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [rec.id, rec.forgeId, rec.fireId, rec.target, rec.wish, rec.hideTarget, rec.private, rec.shareCard, rec.groupKey]);
    return rec;
  }
  return serial(async () => { const s = await fileState(); s.lanterns.push(rec); await writeData(s.d); return rec; });
}

export async function getLantern(id: string): Promise<LanternRecord | null> {
  if (pg()) { const { rows } = await (await db()).query("SELECT * FROM find_lantern WHERE id = $1", [id]); return rows[0] ? toLantern(rows[0]) : null; }
  return serial(async () => (await fileState()).lanterns.find((l) => l.id === id) ?? null);
}

export async function markDone(id: string) {
  if (pg()) { await (await db()).query("UPDATE find_lantern SET status = 'done', done_at = now() WHERE id = $1", [id]); return; }
  await serial(async () => { const s = await fileState(); const l = s.lanterns.find((x) => x.id === id); if (l) { l.status = "done"; l.doneAt = new Date().toISOString(); } await writeData(s.d); });
}
export async function removeLantern(id: string) {
  if (pg()) { const pool = await db(); await pool.query("DELETE FROM find_lantern_maker WHERE lantern_id = $1", [id]); await pool.query("DELETE FROM find_lantern WHERE id = $1", [id]); return; }
  await serial(async () => { const s = await fileState(); s.lanterns.splice(0, s.lanterns.length, ...s.lanterns.filter((l) => l.id !== id)); s.makers.splice(0, s.makers.length, ...s.makers.filter((m) => m.lanternId !== id)); await writeData(s.d); });
}
export async function setMaker(lanternId: string, forgeId: string, on: boolean) {
  if (pg()) {
    if (on) await (await db()).query("INSERT INTO find_lantern_maker (lantern_id, forge_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [lanternId, forgeId]);
    else await (await db()).query("DELETE FROM find_lantern_maker WHERE lantern_id = $1 AND forge_id = $2", [lanternId, forgeId]);
    return;
  }
  await serial(async () => {
    const s = await fileState();
    const has = s.makers.some((m) => m.lanternId === lanternId && m.forgeId === forgeId);
    if (on && !has) s.makers.push({ lanternId, forgeId, at: new Date().toISOString() });
    if (!on && has) s.makers.splice(0, s.makers.length, ...s.makers.filter((m) => !(m.lanternId === lanternId && m.forgeId === forgeId)));
    await writeData(s.d);
  });
}

export type PublicLantern = { id: string; target: string | null; wish: string; nickname: string; forgeId: string | null; fireName: string | null; status: LanternStatus; makers: number; iMake: boolean; mine: boolean };
export type LanternGroup = { key: string; label: string; count: number; done: number; lanterns: PublicLantern[] };

/** 마을에 보이는 등불: 공개 대장간의, '나만 보기'가 아닌 등불을 소원 줄별로. 대상 이름 가리기·카드 공개 여부를 반영한다. */
export async function publicLanternGroups(viewerForgeId: string | null): Promise<LanternGroup[]> {
  let lanterns: LanternRecord[]; let makers: MakerRecord[]; let forges: Array<{ id: string; nickname: string; visibility: string }>; let fires: Array<{ id: string; name: string }>;
  if (pg()) {
    const pool = await db();
    const [l, m, f, fi] = await Promise.all([
      pool.query("SELECT * FROM find_lantern WHERE NOT private ORDER BY created_at"),
      pool.query("SELECT lantern_id, forge_id, created_at FROM find_lantern_maker"),
      pool.query("SELECT id, nickname, visibility FROM find_forges"),
      pool.query("SELECT id, name FROM find_fires WHERE id IN (SELECT fire_id FROM find_lantern WHERE share_card AND fire_id IS NOT NULL)")
    ]);
    lanterns = l.rows.map(toLantern); makers = m.rows.map((r) => ({ lanternId: r.lantern_id, forgeId: r.forge_id, at: new Date(r.created_at).toISOString() }));
    forges = f.rows; fires = fi.rows;
  } else {
    const s = await serial(async () => fileState());
    lanterns = s.lanterns.filter((x) => !x.private); makers = s.makers;
    forges = ((s.d.forges as Array<{ id: string; nickname: string; visibility: string }> | undefined) ?? []);
    fires = s.d.fires.map((x) => ({ id: x.id, name: x.name }));
  }
  const forgeBy = new Map(forges.map((f) => [f.id, f]));
  const fireBy = new Map(fires.map((f) => [f.id, f.name]));
  const groups = new Map<string, LanternGroup>();
  for (const l of lanterns) {
    const f = forgeBy.get(l.forgeId);
    if (!f || (f.visibility !== "public" && l.forgeId !== viewerForgeId)) continue;
    const g = groups.get(l.groupKey) ?? { key: l.groupKey, label: groupLabel(l.groupKey), count: 0, done: 0, lanterns: [] };
    const ms = makers.filter((m) => m.lanternId === l.id);
    g.lanterns.push({
      id: l.id, target: l.hideTarget ? null : l.target, wish: l.wish, nickname: f.nickname,
      forgeId: l.shareCard || l.forgeId === viewerForgeId ? l.forgeId : null, fireName: l.shareCard && l.fireId ? fireBy.get(l.fireId) ?? null : null,
      status: l.status, makers: ms.length, iMake: Boolean(viewerForgeId && ms.some((m) => m.forgeId === viewerForgeId)), mine: l.forgeId === viewerForgeId
    });
    g.count++; if (l.status === "done") g.done++;
    groups.set(l.groupKey, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}
