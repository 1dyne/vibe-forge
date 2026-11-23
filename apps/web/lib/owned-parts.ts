import type { MakerProfile, OwnedPart } from "./project-types";

// 서랍에 있는 걸 또 사게 하지 않으려고 쓴다. 다만 "있다"와 "있는 것 같다"를
// 섞으면 안 된다. 부품 카드가 같으면 같은 부품이지만, 이름만 비슷한 것은
// 값이 다를 수 있다(가진 "저항"이 220Ω인지 10kΩ인지 목록만 봐서는 모른다).
// 그래서 두 등급으로 나누고, 화면에서도 다르게 말한다.
export type OwnedHit = { part: OwnedPart; certainty: "card" | "name" };

// 비교용으로만 쓰는 납작한 형태. 띄어쓰기·하이픈·괄호는 사람마다 다르게 적는다.
export function normalizePartName(value: string): string {
  return value.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

// 이름이 같은 부품을 가리키는지. 한쪽이 다른 쪽에 통째로 들어가면 같은 것으로 본다
// ("저항" ⊂ "저항 220Ω").
//
// 짧은 조각은 아무 데나 걸린다("5V"는 5V 릴레이·5V 팬·5V 레귤레이터에 모두 들어간다).
// 그렇다고 글자 수로만 자르면 안 된다. 한글 부품 이름은 두 글자로 끝나는 것이 흔하고
// (저항·전지·모터·부저) 그것들은 모호하지 않다. 그래서 기준은 길이가 아니라
// "그 조각만으로 부품을 가리킬 수 있는가"로 둔다: 한글이 섞여 있으면 두 글자부터,
// 숫자·영문만이면 세 글자부터 인정한다.
const nameable = (value: string) => value.length >= (/[가-힣]/.test(value) ? 2 : 3);

export function samePartName(a: string, b: string): boolean {
  const left = normalizePartName(a), right = normalizePartName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return nameable(shorter) && longer.includes(shorter);
}

export const ownedParts = (profile: Pick<MakerProfile, "ownedParts"> | null | undefined): OwnedPart[] => profile?.ownedParts ?? [];

// 부품 카드 중에는 한 종류 전체를 가리키는 것이 있다. 저항 카드 하나가 220Ω도
// 10kΩ도 다 받고, LED 카드 하나가 모든 LED를 받는다. 그래서 "카드가 같다"가
// "같은 부품이다"가 되지 못하는 경우가 생긴다. 220Ω이 필요한데 서랍의 저항이
// 10kΩ이면 가진 게 아니다.
//
// 그래서 설계가 값을 적어뒀는데(220Ω, 3.7V, 5mm) 내가 적은 이름에 그 값이 없으면
// 단정하지 않고 확인으로 내린다. 숫자 뒤에 단위가 붙은 것만 값으로 본다 —
// "ESP32 DevKit V1"의 1이나 "AHT20"의 20은 모델 이름이지 값이 아니다.
const VALUE_TOKEN = /(\d+(?:[.,]\d+)?)\s*(kω|mω|ω|ohm|옴|mah|ma|mv|v|µf|uf|nf|pf|w|mm|cm|khz|mhz|hz|rpm)(?![0-9a-z가-힣])/gi;
const flat = (value: string) => value.toLowerCase().replace(/\s+/g, "");

export function valueTokens(name: string): string[] {
  return [...name.toLowerCase().matchAll(VALUE_TOKEN)].map(([, number, unit]) => `${number.replace(",", ".")}${unit}`);
}

// 설계가 요구한 값을 내가 적은 이름이 모두 담고 있는가.
export function valuesCovered(needed: string, owned: string): boolean {
  const wanted = valueTokens(needed);
  if (!wanted.length) return true;
  const mine = flat(owned);
  return wanted.every((token) => mine.includes(flat(token)));
}

// 설계에 들어간 부품 하나가 이미 가진 것인지. 부품 카드가 같으면 확실하고,
// 이름만 겹치면 값까지 같은지는 사람이 확인해야 한다.
export function ownedHit(profile: Pick<MakerProfile, "ownedParts"> | null | undefined, needed: { catalogId?: string | null; valueOrModel?: string; model?: string }): OwnedHit | null {
  const mine = ownedParts(profile);
  if (!mine.length) return null;
  const name = needed.valueOrModel ?? needed.model ?? "";
  if (needed.catalogId) {
    const byCard = mine.find((part) => part.catalogId && part.catalogId === needed.catalogId);
    // 카드가 같아도 설계가 적은 값까지 맞아야 단정한다.
    if (byCard) return { part: byCard, certainty: valuesCovered(name, byCard.name) ? "card" : "name" };
  }
  if (!name.trim()) return null;
  const byName = mine.find((part) => samePartName(part.name, name));
  return byName ? { part: byName, certainty: "name" } : null;
}

// 부품목록 한 장을 통째로 맞춰본다. 한 줄씩 따로 보면 안 되는 이유가 있다:
// LED 한 개를 가진 사람의 설계에 LED 자리가 둘이면, 줄마다 따로 물었을 때 둘 다
// "가지고 있어요"가 된다. 가진 수량을 앞 줄부터 써 나가야 두 번째 줄이 사라고 한다.
// (설계의 부품 한 줄은 한 개다 — CircuitComponent에는 수량이 없다.)
export function ownedHits(profile: Pick<MakerProfile, "ownedParts"> | null | undefined, needed: Array<{ catalogId?: string | null; valueOrModel?: string; model?: string }>): Array<OwnedHit | null> {
  const left = new Map(ownedParts(profile).map((part) => [part.id, part.qty]));
  return needed.map((item) => {
    const hit = ownedHit(profile, item);
    if (!hit) return null;
    const remaining = left.get(hit.part.id) ?? 0;
    if (remaining <= 0) return null;
    left.set(hit.part.id, remaining - 1);
    return hit;
  });
}

// 커넥터가 보낸 목록을 저장할 모양으로 맞춘다. id는 서버가 쥔다 — 모델이 지어낸
// id를 그대로 쓰면 같은 부품이 두 줄로 쌓인다.
//
// 전에 쓰던 id는 이름이 같은 줄에 물려주되, 한 번 물려준 id는 다시 쓰지 않는다.
// 그러지 않으면 "저항"을 두 줄 보냈을 때 둘 다 같은 id를 받아서, 화면에서는 키가
// 겹치고 수량 계산에서는 두 줄이 한 줄로 취급된다.
export function reconcileOwnedParts(
  previous: OwnedPart[],
  incoming: Array<{ name: string; qty?: number; catalogId?: string | null; note?: string }>,
  newId: () => string
): OwnedPart[] {
  const spare = [...previous];
  return incoming.map((part) => {
    const at = spare.findIndex((old) => old.name === part.name);
    const id = at >= 0 ? spare.splice(at, 1)[0].id : newId();
    return { id, name: part.name, qty: part.qty ?? 1, catalogId: part.catalogId ?? null, note: part.note ?? "" };
  });
}
