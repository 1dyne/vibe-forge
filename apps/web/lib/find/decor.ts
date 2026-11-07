// 대장간 꾸미기: 지붕 색 · 간판 모양 · 집 앞 꾸미기(최대 3개) · 마을에 내 기척 보이기.
// 기본 꾸미기는 처음부터, 몇 개는 이웃과 어울려야 열린다.

export const ROOF_COLORS = ["#8FB79A", "#E2574C", "#F2A65A", "#E8C25A", "#6C8EBF", "#34446E", "#9B7BFF", "#FF8C7A", "#7FD3CB", "#8D9599"] as const;
export const SIGNS = [
  { id: "plank", name: "나무판" },
  { id: "round", name: "둥근 간판" },
  { id: "banner", name: "깃발" },
  { id: "lantern", name: "등불" }
] as const;
export type SignId = (typeof SIGNS)[number]["id"];

export type YardUnlock = { neighbors?: number; fuel?: number; wants?: number; notes?: number };
export const YARD = [
  { id: "pot", name: "화분", hint: "" },
  { id: "mailbox", name: "우체통", hint: "" },
  { id: "fence", name: "울타리", hint: "" },
  { id: "bench", name: "벤치", hint: "이웃 3명이 생기면 열려", need: { neighbors: 3 } as YardUnlock },
  { id: "lamp", name: "가로등", hint: "장작 10개를 받으면 열려", need: { fuel: 10 } as YardUnlock },
  { id: "arch", name: "꽃 아치", hint: "'나도 갖고 싶어' 5개를 받으면 열려", need: { wants: 5 } as YardUnlock },
  { id: "chime", name: "풍경", hint: "놀러 온 도깨비가 말을 5번 남기면 열려", need: { notes: 5 } as YardUnlock }
] as const;
export type YardId = (typeof YARD)[number]["id"];
export const YARD_MAX = 3;

export type Decor = { roof?: string; sign?: SignId; yard?: YardId[]; hidePresence?: boolean };
export type DecorStats = { neighbors: number; fuel: number; wants: number; notes: number };

export function yardUnlocked(id: string, s: DecorStats) {
  const item = YARD.find((y) => y.id === id);
  if (!item) return false;
  const need = "need" in item ? item.need : undefined;
  if (!need) return true;
  return (need.neighbors ?? 0) <= s.neighbors && (need.fuel ?? 0) <= s.fuel && (need.wants ?? 0) <= s.wants && (need.notes ?? 0) <= s.notes;
}

/** 저장 전에 거른다: 모르는 값은 버리고, 안 열린 꾸미기는 뺀다 */
export function cleanDecor(input: Decor, s: DecorStats): Decor {
  const out: Decor = {};
  if (input.roof && (ROOF_COLORS as readonly string[]).includes(input.roof)) out.roof = input.roof;
  if (input.sign && SIGNS.some((x) => x.id === input.sign)) out.sign = input.sign;
  if (input.yard) out.yard = [...new Set(input.yard)].filter((y) => yardUnlocked(y, s)).slice(0, YARD_MAX) as YardId[];
  if (input.hidePresence) out.hidePresence = true;
  return out;
}
