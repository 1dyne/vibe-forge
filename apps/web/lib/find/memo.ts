// 작업실 메모: 내 대장간 안에서 도깨비불마다 남기는 메모(글 + 선택 링크). 주인만 본다 — 손님·마을 어디에도 나오지 않는다.
// 나중에 한 번에 내보내서 달그락 대장간에서 실제로 만들 때 쓴다.
import { db, newId, readData, serial, storageKind, writeData, type FireRecord } from "./store";

export const MEMO_MAX = 300;
export const MEMO_LIMIT = 200; // 대장간 하나에 쌓을 수 있는 메모 수
export type MemoRecord = { id: string; forgeId: string; fireId: string; body: string; url: string | null; createdAt: string };

const pg = () => storageKind() === "postgres";
const toMemo = (r: Record<string, unknown>): MemoRecord => ({ id: r.id as string, forgeId: r.forge_id as string, fireId: r.fire_id as string, body: r.body as string, url: (r.url as string) ?? null, createdAt: new Date(r.created_at as string).toISOString() });
async function file() { const d = await readData(); const social = (d.social ??= {}) as Record<string, unknown[]>; return { d, memos: (social.memos ??= []) as MemoRecord[] }; }

/** 링크 검사: http(s) 주소만, 300자까지 */
export function cleanUrl(raw: string | null | undefined): string | null | "bad" {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (t.length > 300) return "bad";
  try { const u = new URL(t); return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "bad"; } catch { return "bad"; }
}

export async function forgeMemos(forgeId: string): Promise<MemoRecord[]> {
  if (pg()) return (await (await db()).query("SELECT * FROM find_memo WHERE forge_id = $1 ORDER BY created_at DESC", [forgeId])).rows.map(toMemo);
  return serial(async () => (await file()).memos.filter((m) => m.forgeId === forgeId).reverse());
}
export async function addMemo(input: Omit<MemoRecord, "id" | "createdAt">): Promise<MemoRecord> {
  const m: MemoRecord = { ...input, id: newId(8), createdAt: new Date().toISOString() };
  if (pg()) { await (await db()).query("INSERT INTO find_memo (id, forge_id, fire_id, body, url) VALUES ($1,$2,$3,$4,$5)", [m.id, m.forgeId, m.fireId, m.body, m.url]); return m; }
  return serial(async () => { const f = await file(); f.memos.push(m); await writeData(f.d); return m; });
}
export async function deleteMemo(forgeId: string, id: string): Promise<boolean> {
  if (pg()) return ((await (await db()).query("DELETE FROM find_memo WHERE id = $1 AND forge_id = $2", [id, forgeId])).rowCount ?? 0) > 0;
  return serial(async () => { const f = await file(); const n = f.memos.length; f.memos.splice(0, n, ...f.memos.filter((m) => !(m.id === id && m.forgeId === forgeId))); await writeData(f.d); return f.memos.length < n; });
}

/** 한 번에 내보내기: 도깨비불마다 처음 쓴 문장 · 설계 한 줄 · 고른 장작 · 만들 물건 구성 · 메모를 마크다운으로 */
export function exportMarkdown(forgeName: string, fires: FireRecord[], memos: MemoRecord[]): string {
  const lines = [`# ${forgeName}의 작업실 메모`, "", `내보낸 날: ${new Date().toISOString().slice(0, 10)}`, ""];
  for (const f of fires) {
    const mine = memos.filter((m) => m.fireId === f.id).slice().reverse();
    lines.push(`## ${f.name}`, "");
    lines.push(`- 처음 쓴 문장: ${f.idea}`);
    lines.push(`- 설계 한 줄: ${f.sentence}`);
    if (f.labels.length) lines.push(`- 고른 장작: ${f.labels.join(", ")}`);
    const parts = f.card?.build.parts ?? [];
    if (parts.length) lines.push(`- 만들 물건 구성: ${parts.map((p) => (typeof p === "string" ? p : `${p.role}(${p.does})`)).join(" / ")}`);
    lines.push("");
    if (mine.length) { lines.push("### 메모", ""); for (const m of mine) lines.push(`- ${m.createdAt.slice(0, 10)} ${m.body}${m.url ? ` — ${m.url}` : ""}`); lines.push(""); }
  }
  return lines.join("\n");
}
