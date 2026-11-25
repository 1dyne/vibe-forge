import { describe, expect, it } from "vitest";
import { checkProductForm, footprint, placementReadback } from "../apps/web/lib/form-check";
import type { ProductForm, ProductInternal } from "../apps/web/lib/project-types";

const shape: ProductForm["shape"] = [{ name: "몸통", primitive: "box", size: [88, 55, 30], position: [0, 0, 0] }];
const part = (ref: string, size: [number, number, number], position: [number, number, number], extra: Partial<ProductInternal> = {}): ProductInternal => ({ ref, label: ref, size, position, sizeBasis: "measured", ...extra });
const codes = (internals: ProductInternal[]) => checkProductForm({ shape, internals }).map((f) => `${f.severity}:${f.code}:${f.refs.join("+")}`);

describe("완성품 형태 배치 검사", () => {
  it("떨어져 있거나 맞닿기만 한 부품은 통과한다", () => {
    expect(codes([part("U1", [20, 20, 5], [-20, 0, 2]), part("U2", [20, 20, 5], [0, 0, 2])])).toEqual([]);
  });

  it("같은 자리에 든 두 부품을 겹침으로 잡고, 얼마나 겹치는지 말한다", () => {
    const findings = checkProductForm({ shape, internals: [part("U1", [24, 24, 9.5], [6, 12, 4]), part("U2", [35, 22, 1.6], [-4, 12, 4])] });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "blocked", code: "overlap", refs: ["U1", "U2"] });
    expect(findings[0].message).toContain("높이 1.6mm");
  });

  it("서로 꽂힌다고 적은 부품은 겹쳐도 막지 않되, 떨어져 있으면 알린다", () => {
    expect(codes([part("U1", [24, 24, 9.5], [6, 12, 4], { stackedWith: ["U2"] }), part("U2", [35, 22, 1.6], [-4, 12, 4])])).toEqual(["info:overlap:U1+U2"]);
    expect(codes([part("U1", [10, 10, 5], [-30, 0, 2], { stackedWith: ["U2"] }), part("U2", [10, 10, 5], [30, 0, 2])])).toEqual(["warning:stack_gap:U1+U2"]);
  });

  it("돌려 놓은 부품은 돌린 크기로 잰다", () => {
    const tall = part("U1", [40, 10, 5], [0, 0, 2], { rotation: 90 });
    expect(footprint(tall)).toEqual([10, 40, 5]);
    // 돌리지 않았다면 겹쳤을 옆 부품과 이제는 겹치지 않는다
    expect(codes([tall, part("U2", [10, 10, 5], [15, 0, 2])])).toEqual([]);
    expect(codes([{ ...tall, rotation: 0 }, part("U2", [10, 10, 5], [15, 0, 2])])).toEqual(["blocked:overlap:U1+U2"]);
  });

  it("외형 밖으로 나간 부품을 방향과 함께 잡는다", () => {
    const findings = checkProductForm({ shape, internals: [part("LC1", [80, 12.7, 12.7], [10, 0, 2])] });
    expect(findings[0]).toMatchObject({ severity: "blocked", code: "outside", refs: ["LC1"] });
    expect(findings[0].message).toContain("좌우");
  });

  it("부품 카드와 크기가 다르면 카드 치수를 알려주고, 가로·세로를 바꿔 적은 것은 같은 것으로 본다", () => {
    expect(codes([part("B1", [68.6, 53.4, 12], [0, 0, 2], { catalogId: "arduino-uno-r3", sizeBasis: "card" })])).toEqual([]);
    expect(codes([part("B1", [53.4, 68.6, 12], [0, 0, 2], { catalogId: "arduino-uno-r3", rotation: 90 })])).toEqual([]);
    const wrong = checkProductForm({ shape, internals: [part("B1", [40, 30, 12], [0, 0, 2], { catalogId: "arduino-uno-r3" })] });
    expect(wrong[0]).toMatchObject({ severity: "blocked", code: "card_size" });
    expect(wrong[0].message).toContain("68.6×53.4");
  });

  it("근거 없는 크기와 모르는 카드는 확인할 것으로 남긴다", () => {
    expect(codes([part("U1", [10, 10, 5], [0, 0, 2], { sizeBasis: "assumed" })])).toEqual(["warning:unmeasured:U1"]);
    expect(codes([part("U1", [10, 10, 5], [0, 0, 2], { sizeBasis: undefined })])).toEqual(["warning:unmeasured:U1"]);
    expect(codes([part("U1", [10, 10, 5], [0, 0, 2], { catalogId: "no-such-card" })])).toEqual(["warning:unknown_card:U1"]);
  });

  it("배치를 말로 되읽어 좌우가 뒤집혔는지 볼 수 있게 한다", () => {
    expect(placementReadback({ internals: [part("U1", [24, 24, 9.5], [-20, 12, 4])] })[0]).toBe("U1: 앞에서 볼 때 왼쪽 20mm, 앞쪽 12mm, 바닥에서 4mm~13.5mm · 차지하는 크기 좌우 24mm × 앞뒤 24mm × 높이 9.5mm");
  });
});
