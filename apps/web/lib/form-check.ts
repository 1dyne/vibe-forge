import type { ProductForm, ProductInternal } from "./project-types";
import { findCard } from "./parts/catalog";

// 완성품 형태의 부품 배치를 서버가 직접 잰다. 모델이 좌표를 암산으로 내기 때문에
// "말로는 맞는데 숫자로는 겹치는" 배치가 흔하다. 여기서 잡은 것은 도구 결과와
// 화면에 그대로 나가서, 모델이 고치고 사람이 눈으로 확인한다.
//
// 좌표계: x는 왼쪽(-)→오른쪽(+), y는 뒤(-)→앞(+), z는 바닥 높이. 부품 position은 바닥 중심.

export type FormFinding = { severity: "blocked" | "warning" | "info"; code: "overlap" | "card_size" | "unknown_card" | "unmeasured" | "outside" | "stack_gap"; refs: string[]; message: string };

const TOUCH = 0.3; // 이보다 얕게 닿는 것은 맞닿은 것으로 본다(mm)
const CARD_TOLERANCE = 1; // 카드 치수와 이만큼까지는 같은 것으로 본다(mm)

/** 회전을 반영한 실제 차지 크기 [x, y, z] */
export function footprint(part: ProductInternal): [number, number, number] {
  const [x, y, z] = part.size;
  return part.rotation === 90 || part.rotation === 270 ? [y, x, z] : [x, y, z];
}

type Box = { min: [number, number, number]; max: [number, number, number] };
function boxOf(part: ProductInternal): Box {
  const [sx, sy, sz] = footprint(part);
  const [px, py, pz] = part.position;
  return { min: [px - sx / 2, py - sy / 2, pz], max: [px + sx / 2, py + sy / 2, pz + sz] };
}
const depth = (a: Box, b: Box) => [0, 1, 2].map((i) => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i])) as [number, number, number];
const mm = (value: number) => `${Math.round(value * 10) / 10}mm`;
const stacked = (a: ProductInternal, b: ProductInternal) => !!a.stackedWith?.includes(b.ref) || !!b.stackedWith?.includes(a.ref);

export function checkProductForm(form: Pick<ProductForm, "shape" | "internals">): FormFinding[] {
  const out: FormFinding[] = [];
  const parts = form.internals;

  for (const part of parts) {
    const card = findCard(part.catalogId);
    if (part.catalogId && !card) out.push({ severity: "warning", code: "unknown_card", refs: [part.ref], message: `${part.ref}: 부품 카드 '${part.catalogId}'를 찾을 수 없어요. find_part_cards로 다시 찾아주세요.` });
    const dims = card?.dimensionsMm;
    if (dims) {
      // 가로·세로는 어느 쪽으로 놓았는지 알 수 없으니 큰 쪽끼리, 작은 쪽끼리 견준다.
      const [cardLong, cardShort] = [Math.max(dims[0], dims[1]), Math.min(dims[0], dims[1])];
      const [long, short] = [Math.max(part.size[0], part.size[1]), Math.min(part.size[0], part.size[1])];
      const heightOff = dims[2] != null && Math.abs(part.size[2] - dims[2]) > CARD_TOLERANCE;
      if (Math.abs(long - cardLong) > CARD_TOLERANCE || Math.abs(short - cardShort) > CARD_TOLERANCE || heightOff) {
        out.push({ severity: "blocked", code: "card_size", refs: [part.ref], message: `${part.ref}: 크기가 부품 카드와 달라요. 카드는 ${dims[0]}×${dims[1]}×${dims[2] ?? "높이 확인 필요"}mm인데 ${part.size.join("×")}mm로 넣었어요. 카드 치수로 고쳐주세요.` });
      }
    }
    const measured = part.sizeBasis === "measured" || part.sizeBasis === "datasheet" || (part.sizeBasis === "card" && !!dims) || (!part.sizeBasis && !!dims);
    if (!measured) out.push({ severity: "warning", code: "unmeasured", refs: [part.ref], message: `${part.ref} (${part.label}): 크기가 확인되지 않은 값이에요. 출력 전에 실제 부품을 재거나 판매 페이지·데이터시트로 확인해야 해요.` });
  }

  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const [a, b] = [parts[i], parts[j]];
      const d = depth(boxOf(a), boxOf(b));
      const declared = stacked(a, b);
      if (d.every((v) => v > TOUCH)) {
        const text = `${a.ref}와 ${b.ref}가 겹쳐요 (좌우 ${mm(d[0])}, 앞뒤 ${mm(d[1])}, 높이 ${mm(d[2])}).`;
        if (declared) out.push({ severity: "info", code: "overlap", refs: [a.ref, b.ref], message: `${text} 서로 꽂히는 부품으로 표시돼 있어 허용했어요. 실제로 꽂았을 때의 전체 크기를 재서 확인해주세요.` });
        else out.push({ severity: "blocked", code: "overlap", refs: [a.ref, b.ref], message: `${text} 같은 자리에 두 부품이 들어갈 수 없어요. 위치를 옮기거나, 헤더로 서로 꽂히는 부품이면 stackedWith에 적어주세요.` });
      } else if (declared) {
        const gap = Math.max(...d.map((v) => -v));
        if (gap > 3) out.push({ severity: "warning", code: "stack_gap", refs: [a.ref, b.ref], message: `${a.ref}와 ${b.ref}는 서로 꽂힌다고 했는데 ${mm(gap)} 떨어져 있어요. 꽂힌 상태의 위치로 고쳐주세요.` });
      }
    }
  }

  // 외형 밖으로 나가는 부품. 외형은 여러 도형의 합이므로 가장 바깥 범위와 견준다.
  if (form.shape.length) {
    const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
    for (const s of form.shape) {
      const b: Box = { min: [s.position[0] - s.size[0] / 2, s.position[1] - s.size[1] / 2, s.position[2]], max: [s.position[0] + s.size[0] / 2, s.position[1] + s.size[1] / 2, s.position[2] + s.size[2]] };
      for (const i of [0, 1, 2]) { lo[i] = Math.min(lo[i], b.min[i]); hi[i] = Math.max(hi[i], b.max[i]); }
    }
    const names = ["좌우", "앞뒤", "높이"];
    for (const part of parts) {
      const b = boxOf(part);
      const over = [0, 1, 2].map((i) => Math.max(lo[i] - b.min[i], b.max[i] - hi[i]));
      const worst = Math.max(...over);
      if (worst > 1) out.push({ severity: "blocked", code: "outside", refs: [part.ref], message: `${part.ref}가 외형 밖으로 ${mm(worst)} 나가요 (${names[over.indexOf(worst)]} 방향). 외형을 키우거나 부품을 안쪽으로 옮겨주세요.` });
    }
  }
  return out;
}

/** 모델과 사람이 "내가 생각한 자리가 맞나"를 말로 되읽을 수 있게 한 줄씩 푼다. 좌우가 뒤집힌 배치를 잡는 용도. */
export function placementReadback(form: Pick<ProductForm, "internals">): string[] {
  const side = (v: number, minus: string, plus: string) => Math.abs(v) < 2 ? "가운데" : v < 0 ? `${minus} ${mm(-v)}` : `${plus} ${mm(v)}`;
  return form.internals.map((part) => {
    const [sx, sy, sz] = footprint(part);
    const [x, y, z] = part.position;
    return `${part.ref}: 앞에서 볼 때 ${side(x, "왼쪽", "오른쪽")}, ${side(y, "뒤쪽", "앞쪽")}, 바닥에서 ${mm(z)}~${mm(z + sz)} · 차지하는 크기 좌우 ${mm(sx)} × 앞뒤 ${mm(sy)} × 높이 ${mm(sz)}`;
  });
}
