import { describe, expect, it } from "vitest";
import { CHIEF_COLOR, MAKER, fireMaker, fireReacts, tintMatrix, type MakerKind } from "../apps/web/lib/find/classify";
import { reactKinds, type Chip } from "../apps/web/lib/find/chips";

// 도깨비 그림의 몸 색(스프라이트의 민트). 그림이 바뀌면 이 값과 MAKER.tint를 같이 다시 구한다.
const SPRITE_MINT = [150, 198, 188];
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const paint = (key: string) => {
  const m = tintMatrix(key);
  return [0, 1, 2].map((r) => Math.round(m[r * 3] * SPRITE_MINT[0] + m[r * 3 + 1] * SPRITE_MINT[1] + m[r * 3 + 2] * SPRITE_MINT[2]));
};

describe("온보딩 도깨비 색", () => {
  it("도깨비 그림을 달그락 색 한 벌의 색으로 옮긴다", () => {
    for (const kind of Object.keys(MAKER) as MakerKind[]) {
      const got = paint(kind), want = rgb(MAKER[kind].color);
      for (let i = 0; i < 3; i++) expect(Math.abs(got[i] - want[i]), `${kind} ${got} ↔ ${want}`).toBeLessThanOrEqual(2);
    }
    const chief = paint("none"), want = rgb(CHIEF_COLOR);
    for (let i = 0; i < 3; i++) expect(Math.abs(chief[i] - want[i])).toBeLessThanOrEqual(2);
  });

  it("먹선과 흰색은 거의 그대로 둔다", () => {
    for (const kind of [...Object.keys(MAKER), "none"]) {
      const m = tintMatrix(kind);
      const white = [0, 1, 2].map((r) => (m[r * 3] + m[r * 3 + 1] + m[r * 3 + 2]) * 255);
      for (const v of white) expect(v).toBeGreaterThan(245);
      for (const v of white.map((x) => (x * 35) / 255)) expect(v).toBeLessThan(45);
    }
  });

  it("불을 맡은 달그락은 카드에 적힌 것을 먼저 쓰고, 없으면 아이디어로 가른다", () => {
    expect(fireMaker({ card: { maker: "design" }, idea: "가계부 앱" })).toBe("design");
    expect(fireMaker({ card: {}, idea: "가계부 앱" })).toBe("software");
    expect(fireMaker({ card: null, idea: "화분에 물 줄 때를 알려주는 것" })).toBe("hardware");
    expect(fireMaker({ card: null })).toBe("hardware");
  });

  it("반응은 색이 아니라 도형으로 보일 갈래 목록이 된다", () => {
    const chips: Chip[] = [
      { id: "a", cat: "형태", label: "책상 위", say: "책상 위", tags: [] },
      { id: "b", cat: "반응", label: "빛", say: "빛", tags: [], react: "light" },
      { id: "c", cat: "반응", label: "소리", say: "소리", tags: [], react: "sound" },
      { id: "d", cat: "반응", label: "깜빡", say: "깜빡", tags: [], react: "light" },
      { id: "e", cat: "반응", label: "폰", say: "폰", tags: [], react: "none" }
    ] as Chip[];
    const find = (id: string) => chips.find((c) => c.id === id);
    expect(reactKinds(["a", "b", "c", "d", "e"], find)).toEqual(["light", "sound"]);
    expect(fireReacts({ card: { reacts: ["light", "sound"] } })).toEqual(["light", "sound"]);
    expect(fireReacts({ card: { attr: { kind: "move" } } })).toEqual(["move"]);
    expect(fireReacts({ reactKind: "none" })).toEqual([]);
  });
});
