// 도깨비의 질문: 하루 한 번, 화덕 도깨비가 도깨비불 하나에 질문을 하나 던진다.
// 장작을 하나 더 고르면 그 불의 설계 한 줄이 자라고(장작이 늘면 집 단계도 오를 수 있다), 화력도 조금 오른다.
import { byCat, CATS, compose, fireGain, FIRE, FOLLOW, lookup, ROOTS, toChip, type Cat, type Chip } from "./chips";
import { db, readData, serial, storageKind, writeData, type FireRecord } from "./store";

const tree = { root: ROOTS.map(toChip), follow: FOLLOW };
export const findChip = lookup(tree);

/** 한국 시간 날짜 (하루의 경계) */
export const todayKst = (now = Date.now()) => new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
const dayNo = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400_000);

const ASK: Record<Cat, string> = {
  형태: "이건 어디에 두고 쓰는 물건이야?",
  감지: "이 물건은 무엇을 알아채야 해?",
  반응: "알아채면 어떻게 알려줄까?",
  누구: "누구를 위해 만드는 거야?"
};

export type Question = { fireId: string; fireName: string; ask: string; options: Array<{ id: string; label: string }> };

/** 불 하나에 대한 질문: 비어 있는 갈래가 있으면 그 갈래, 없으면 고른 장작의 다음 장작 */
export function questionFor(fire: Pick<FireRecord, "id" | "name" | "picked">, seed = 0): Question | null {
  const picked = new Set(fire.picked);
  const have = byCat(fire.picked, findChip);
  const missing = CATS.filter((c) => !have[c]);
  if (missing.length) {
    const cat = missing[seed % missing.length];
    const opts = ROOTS.filter((r) => r.cat === cat && !picked.has(r.id))
      .sort((a, b) => (a.fallbackRank ?? 9) - (b.fallbackRank ?? 9)).slice(0, 3);
    if (opts.length) return { fireId: fire.id, fireName: fire.name, ask: ASK[cat], options: opts.map((o) => ({ id: o.id, label: o.label })) };
  }
  const next: Chip[] = [];
  for (const id of fire.picked) for (const c of FOLLOW[id] ?? []) if (!picked.has(c.id) && !next.some((n) => n.id === c.id)) next.push(c);
  if (!next.length) return null;
  const start = seed % next.length;
  const opts = [...next.slice(start), ...next.slice(0, start)].slice(0, 3);
  return { fireId: fire.id, fireName: fire.name, ask: "조금 더 자세히 정해볼까?", options: opts.map((o) => ({ id: o.id, label: o.label })) };
}

/** 오늘의 질문: 날짜마다 불을 돌아가며 고른다 */
export function questionOfDay(fires: FireRecord[], day = todayKst()): Question | null {
  if (!fires.length) return null;
  const n = dayNo(day);
  for (let k = 0; k < fires.length; k++) {
    const q = questionFor(fires[(n + k) % fires.length], n);
    if (q) return q;
  }
  return null;
}

/** 고른 장작을 불에 더한 결과 (저장 전 계산) */
export function grow(fire: FireRecord, chipId: string): Pick<FireRecord, "picked" | "labels" | "sentence" | "peak"> | null {
  const chip = findChip(chipId);
  if (!chip || fire.picked.includes(chipId)) return null;
  const isFollow = !ROOTS.some((r) => r.id === chipId);
  const picked = [...fire.picked, chipId];
  return {
    picked,
    labels: [...fire.labels, chip.label],
    sentence: compose(picked, findChip),
    peak: Math.min(FIRE.max, fire.peak + fireGain(chip, fire.picked, findChip, isFollow))
  };
}

const pg = () => storageKind() === "postgres";
type Answer = { forgeId: string; day: string; fireId: string; chipId: string };
async function file() { const d = await readData(); const social = (d.social ??= {}) as Record<string, unknown[]>; return { d, answers: (social.questions ??= []) as Answer[] }; }

export async function answeredOn(forgeId: string, day = todayKst()): Promise<boolean> {
  if (pg()) return ((await (await db()).query("SELECT 1 FROM find_question WHERE forge_id = $1 AND day = $2", [forgeId, day])).rowCount ?? 0) > 0;
  return serial(async () => (await file()).answers.some((a) => a.forgeId === forgeId && a.day === day));
}

/** 하루 한 번만: 이미 답했으면 false */
export async function saveAnswer(forgeId: string, fire: FireRecord, chipId: string, day = todayKst()): Promise<FireRecord | null> {
  const g = grow(fire, chipId);
  if (!g) return null;
  if (pg()) {
    const client = await db();
    const ins = await client.query("INSERT INTO find_question (forge_id, day, fire_id, chip_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [forgeId, day, fire.id, chipId]);
    if (!ins.rowCount) return null;
    await client.query("UPDATE find_fires SET picked = $2, labels = $3, sentence = $4, peak = $5 WHERE id = $1", [fire.id, JSON.stringify(g.picked), JSON.stringify(g.labels), g.sentence, g.peak]);
    return { ...fire, ...g };
  }
  return serial(async () => {
    const f = await file();
    if (f.answers.some((a) => a.forgeId === forgeId && a.day === day)) return null;
    f.answers.push({ forgeId, day, fireId: fire.id, chipId });
    const rec = f.d.fires.find((x) => x.id === fire.id);
    if (rec) Object.assign(rec, g);
    await writeData(f.d);
    return { ...fire, ...g };
  });
}
