// 대장간 꾸미기: 지붕 재료 · 문패 모양 · 집 앞 꾸미기(최대 3개) · 마을에 내 기척 보이기.
// 조선 민가 문법에 맞춘 것만 고른다(고증: docs/FIND-WORLD.md). '내 색'은 지붕이 아니라 창호지 불빛 색(= 내 도깨비불 색)으로 드러난다.
// 기본 꾸미기는 처음부터, 몇 개는 이웃과 어울려야 열린다.

export const ROOFS = [
  { id: "thatch", name: "초가", color: "#B79E70" },
  { id: "reed", name: "갈대 이엉", color: "#C9B993" },
  { id: "giwa", name: "먹기와", color: "#3E3C42" },
  { id: "giwa-gray", name: "잿빛 기와", color: "#6D6B70" },
  { id: "neowa", name: "너와", color: "#7A6A58" }
] as const;
export type RoofId = (typeof ROOFS)[number]["id"];

export const SIGNS = [
  { id: "plank", name: "나무 문패" },
  { id: "round", name: "둥근 문패" },
  { id: "banner", name: "깃대" },
  { id: "lantern", name: "초롱" }
] as const;
export type SignId = (typeof SIGNS)[number]["id"];

export type YardUnlock = { neighbors?: number; fuel?: number; wants?: number; notes?: number };
export const YARD = [
  { id: "jar", name: "장독", hint: "" },
  { id: "fence", name: "싸리울", hint: "" },
  { id: "flower", name: "메밀꽃밭", hint: "" },
  { id: "pyeongsang", name: "평상", hint: "이웃 3명이 생기면 열려", need: { neighbors: 3 } as YardUnlock },
  { id: "chorong", name: "초롱 걸이", hint: "장작 10개를 받으면 열려", need: { fuel: 10 } as YardUnlock },
  { id: "sotdae", name: "작은 솟대", hint: "'나도 갖고 싶어' 5개를 받으면 열려", need: { wants: 5 } as YardUnlock },
  { id: "chime", name: "풍경", hint: "놀러 온 도깨비가 말을 5번 남기면 열려", need: { notes: 5 } as YardUnlock }
] as const;
export type YardId = (typeof YARD)[number]["id"];
export const YARD_MAX = 3;

/** 예전(서양식) 꾸미기 이름 → 지금 이름. 이미 저장된 집도 그대로 보이게 */
const LEGACY_YARD: Record<string, YardId> = { pot: "jar", mailbox: "flower", bench: "pyeongsang", lamp: "chorong", arch: "sotdae" };

export type Decor = { roof?: RoofId; sign?: SignId; yard?: YardId[]; hidePresence?: boolean };
export type DecorStats = { neighbors: number; fuel: number; wants: number; notes: number };

export function yardUnlocked(id: string, s: DecorStats) {
  const item = YARD.find((y) => y.id === id);
  if (!item) return false;
  const need = "need" in item ? item.need : undefined;
  if (!need) return true;
  return (need.neighbors ?? 0) <= s.neighbors && (need.fuel ?? 0) <= s.fuel && (need.wants ?? 0) <= s.wants && (need.notes ?? 0) <= s.notes;
}

/** 저장된 값 읽기: 예전 지붕 '색'은 버리고(마을 기본 재료), 예전 꾸미기 이름은 새 이름으로 */
export function readDecor(raw: unknown): Decor {
  const d = (raw ?? {}) as Record<string, unknown>;
  const out: Decor = {};
  if (typeof d.roof === "string" && ROOFS.some((r) => r.id === d.roof)) out.roof = d.roof as RoofId;
  if (typeof d.sign === "string" && SIGNS.some((x) => x.id === d.sign)) out.sign = d.sign as SignId;
  if (Array.isArray(d.yard)) out.yard = [...new Set(d.yard.map((y) => LEGACY_YARD[String(y)] ?? String(y)).filter((y) => YARD.some((x) => x.id === y)))].slice(0, YARD_MAX) as YardId[];
  if (d.hidePresence === true) out.hidePresence = true;
  return out;
}

/** 저장 전에 거른다: 모르는 값은 버리고, 안 열린 꾸미기는 뺀다 */
export function cleanDecor(input: Decor, s: DecorStats): Decor {
  const base = readDecor(input);
  if (base.yard) base.yard = base.yard.filter((y) => yardUnlocked(y, s));
  return base;
}
