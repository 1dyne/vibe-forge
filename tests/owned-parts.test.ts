import { beforeEach, describe, expect, it } from "vitest";
import { normalizePartName, ownedHit, ownedHits, reconcileOwnedParts, samePartName, valueTokens, valuesCovered } from "../apps/web/lib/owned-parts";
import type { MakerProfile, OwnedPart } from "../apps/web/lib/project-types";
import { emptyProfile } from "../apps/web/lib/workflow";

const part = (over: Partial<OwnedPart>): OwnedPart => ({ id: "p1", name: "LED 5mm", qty: 10, catalogId: null, note: "", ...over });
const withParts = (parts: OwnedPart[]): MakerProfile => ({ ...emptyProfile(), ownedParts: parts });

describe("이름 맞추기", () => {
  it("띄어쓰기와 괄호가 달라도 같은 이름으로 본다", () => {
    expect(normalizePartName("AHT20 온습도 센서 (I2C)")).toBe("aht20온습도센서i2c");
    expect(samePartName("AHT20", "aht-20 온습도 센서")).toBe(true);
  });

  it("한쪽이 다른 쪽에 들어가면 같은 부품으로 본다", () => {
    expect(samePartName("저항", "저항 220Ω 1/4W")).toBe(true);
  });

  // "5V"는 5V 릴레이·5V 팬·5V 레귤레이터에 모두 들어간다. 그것만으로는 부품을
  // 가리키지 못한다. 반면 두 글자 한글 부품명(저항·전지·모터)은 모호하지 않다.
  it("모호한 조각은 정확히 같을 때만 인정한다", () => {
    expect(samePartName("5V", "5V 릴레이 모듈")).toBe(false);
    expect(samePartName("5V", "5v")).toBe(true);
    expect(samePartName("전지", "LiPo 1셀 전지")).toBe(true);
  });

  it("다른 부품은 섞지 않는다", () => {
    expect(samePartName("LED 5mm", "WS2812B 주소지정 LED 링 (12구)")).toBe(false);
  });
});

describe("값이 적힌 부품", () => {
  it("숫자에 단위가 붙은 것만 값으로 센다", () => {
    expect(valueTokens("저항 220Ω 1/4W")).toEqual(["220ω", "4w"]);
    expect(valueTokens("LiPo 1셀 3.7V 전지")).toEqual(["3.7v"]);
    // 모델 이름 속 숫자는 값이 아니다.
    expect(valueTokens("AHT20 온습도 센서")).toEqual([]);
    expect(valueTokens("ESP32 DevKit V1 (ESP32-WROOM-32)")).toEqual([]);
    expect(valueTokens("DRV8833 2채널 모터 드라이버 모듈")).toEqual([]);
  });

  it("값을 적지 않은 부품은 값 검사를 건너뛴다", () => {
    expect(valuesCovered("AHT20 온습도 센서 모듈 (I2C)", "AHT20")).toBe(true);
  });

  it("설계가 적은 값이 내 이름에 없으면 덮이지 않은 것으로 본다", () => {
    expect(valuesCovered("저항 220Ω", "저항")).toBe(false);
    expect(valuesCovered("저항 220Ω", "저항 220Ω 100개")).toBe(true);
  });
});

describe("가진 부품인지 가리기", () => {
  it("부품 카드가 같으면 확실하다", () => {
    const hit = ownedHit(withParts([part({ catalogId: "aht20" , name: "온습도 센서" })]), { catalogId: "aht20", valueOrModel: "AHT20 온습도 센서 모듈 (I2C)" });
    expect(hit?.certainty).toBe("card");
  });

  // 가진 "저항"이 220Ω인지 10kΩ인지는 목록만 봐서는 모른다. 확실하다고 말하면 안 된다.
  it("이름만 겹치면 확인이 필요한 것으로 둔다", () => {
    const hit = ownedHit(withParts([part({ name: "저항", catalogId: null })]), { catalogId: "resistor", valueOrModel: "저항 220Ω" });
    expect(hit?.certainty).toBe("name");
  });

  // 저항 카드 하나가 220Ω도 10kΩ도 다 받는다. 카드가 같다고 "가지고 있어요"라고
  // 하면, 서랍에 10kΩ뿐인 사람이 220Ω을 안 사고 넘어간다.
  it("카드가 같아도 설계가 적은 값이 없으면 단정하지 않는다", () => {
    const vague = ownedHit(withParts([part({ name: "저항", catalogId: "resistor", qty: 100 })]), { catalogId: "resistor", valueOrModel: "저항 220Ω" });
    expect(vague?.certainty).toBe("name");
    const exact = ownedHit(withParts([part({ name: "저항 220Ω", catalogId: "resistor", qty: 100 })]), { catalogId: "resistor", valueOrModel: "저항 220Ω" });
    expect(exact?.certainty).toBe("card");
  });

  it("없는 부품에는 아무것도 걸리지 않는다", () => {
    expect(ownedHit(withParts([part({})]), { valueOrModel: "DRV8833 모터 드라이버" })).toBeNull();
    expect(ownedHit(null, { valueOrModel: "LED 5mm" })).toBeNull();
  });
});

describe("부품목록 한 장을 통째로 맞추기", () => {
  // LED 한 개를 가진 사람의 설계에 LED 자리가 둘이면, 줄마다 따로 물었을 때는
  // 둘 다 "가지고 있어요"가 된다. 그러면 하나를 안 사고 넘어간다.
  it("가진 수량을 앞 줄부터 나눠 쓴다", () => {
    const hits = ownedHits(withParts([part({ id: "led", name: "LED 5mm", qty: 2 })]), [
      { valueOrModel: "LED 5mm" }, { valueOrModel: "LED 5mm" }, { valueOrModel: "LED 5mm" }
    ]);
    expect(hits.map((hit) => hit?.part.id ?? null)).toEqual(["led", "led", null]);
  });

  it("서로 다른 부품은 각자 센다", () => {
    const hits = ownedHits(withParts([
      part({ id: "led", name: "LED 5mm", qty: 1 }),
      part({ id: "r", name: "저항", qty: 50, catalogId: "resistor" })
    ]), [{ valueOrModel: "LED 5mm" }, { valueOrModel: "저항 220Ω", catalogId: "resistor" }, { valueOrModel: "ESP32 DevKit V1" }]);
    expect(hits.map((hit) => hit?.part.id ?? null)).toEqual(["led", "r", null]);
  });

  it("가진 게 없으면 전부 null", () => {
    expect(ownedHits(emptyProfile(), [{ valueOrModel: "ESP32 DevKit V1" }])).toEqual([null]);
  });
});

describe("커넥터가 보낸 목록 맞추기", () => {
  let n = 0;
  const newId = () => `new${++n}`;
  beforeEach(() => { n = 0; });

  it("전에 쓰던 id를 이름이 같은 줄에 물려준다", () => {
    const out = reconcileOwnedParts([part({ id: "keep", name: "저항", qty: 10 })], [{ name: "저항", qty: 50 }], newId);
    expect(out).toEqual([{ id: "keep", name: "저항", qty: 50, catalogId: null, note: "" }]);
  });

  // 한 번 물려준 id를 또 물려주면 두 줄이 같은 id를 갖는다. 화면에서는 키가 겹치고,
  // 수량을 나눠 쓰는 계산에서는 두 줄이 한 줄로 취급된다.
  it("같은 이름이 두 줄 와도 id가 겹치지 않는다", () => {
    const out = reconcileOwnedParts([part({ id: "keep", name: "저항", qty: 10 })], [{ name: "저항", qty: 1 }, { name: "저항", qty: 2 }], newId);
    expect(out.map((p) => p.id)).toEqual(["keep", "new1"]);
    expect(new Set(out.map((p) => p.id)).size).toBe(2);
  });

  it("빠진 값은 기본값으로 채운다", () => {
    expect(reconcileOwnedParts([], [{ name: "새 부품" }], newId)).toEqual([{ id: "new1", name: "새 부품", qty: 1, catalogId: null, note: "" }]);
  });
});
