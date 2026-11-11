import { describe, expect, it } from "vitest";
import { checkHousing, finalizeHousing, housingFiles, laserPanelsSvg, moldPlanMd, ppUnfoldSvg, regionStl } from "../apps/web/lib/housing";
import type { HousingPlan, HousingRegion, LocalProject, ProductForm } from "../apps/web/lib/project-types";

// 하우징 부위별 제작 방식 (명세서 2차 v0.1 §6)
const form: ProductForm = {
  summary: "책상 위 상자", answers: [{ question: "크기", answer: "손바닥" }],
  shape: [{ name: "몸통", primitive: "box", size: [80, 50, 40], position: [0, 0, 0] }, { name: "덮개", primitive: "box", size: [80, 50, 4], position: [0, 0, 40] }, { name: "손잡이", primitive: "cylinder", size: [20, 20, 30], position: [0, 0, 44] }],
  features: [{ name: "충전 단자", kind: "port", facing: "front", position: [10, -25, 8], size: [10, 4] }],
  internals: [{ ref: "BAT1", label: "LiPo 500mAh", size: [36, 29, 5], position: [0, 0, 3] }],
  material: "PLA", updatedAt: ""
};
const project = (printer: "own" | "none" = "own") => ({ id: "x", name: "상자", productForm: form, workflow: { profile: { printerAccess: printer } }, build: { blueprint: { components: [{ ref: "BAT1", type: "battery", valueOrModel: "LiPo", reason: "" }] } } }) as unknown as LocalProject;
const region = (o: Partial<HousingRegion>): HousingRegion => ({ id: "body", name: "본체", role: "부품을 담는다", shapeRefs: [0], method: "print_fdm", why: "프린터 있음", material: { name: "PLA", thicknessMm: 2 }, join: [{ to: "lid", method: "screw", detail: "M2×6 4개" }], toleranceMm: 0.3, outputs: [], process: ["바닥이 아래로 가게 출력, 서포트 없음"], costKRW: 3000, timeHours: 4, feasible: "unknown", ...o });
const plan = (regions: HousingRegion[]): Omit<HousingPlan, "totals" | "updatedAt" | "risks"> => ({ summary: "본체는 프린트, 덮개는 PP", regions, environment: { indoorOutdoor: "indoor", water: "none", heatSources: [], skinContact: false, childUse: false }, assemblyOrder: ["body", "lid"] });

describe("housing plan", () => {
  const good = [region({ access: { purpose: "charging", how: "앞면 USB-C 구멍" } }), region({ id: "lid", name: "덮개", shapeRefs: [1], method: "pp_sheet", material: { name: "PP", thicknessMm: 0.75 }, join: [{ to: "body", method: "tape", detail: "양면테이프 10mm" }], toleranceMm: null, process: ["전개도 인쇄", "칼등으로 접는 선 긋기", "날개에 테이프"], costKRW: 1000, timeHours: 1 }), region({ id: "grip", name: "손잡이", shapeRefs: [2], method: "resin_cast", material: { name: "에폭시 레진", thicknessMm: null }, join: [{ to: "lid", method: "glue", detail: "에폭시" }], toleranceMm: null, process: ["원형 출력", "실리콘 몰드", "레진 주입·경화"], costKRW: null, timeHours: 24 })];

  it("accepts a mixed plan and recomputes feasibility, outputs and totals", () => {
    const { problems, warnings } = checkHousing(plan(good), project());
    expect(problems).toEqual([]);
    const saved = finalizeHousing(plan(good), project("none"), warnings);
    expect(saved.regions[0].feasible).toBe("unknown"); // 프린터 접근성 '모름'
    expect(saved.regions[1].feasible).toBe("yes");
    expect(saved.regions[0].outputs.some((o) => o.kind === "stl" && o.status === "ready")).toBe(true);
    expect(saved.regions[2].outputs.map((o) => o.kind)).toEqual(expect.arrayContaining(["stl", "mold_plan"]));
    expect(saved.totals).toEqual({ costKRW: 4000, timeHours: 29, partial: true });
    expect(finalizeHousing(plan(good), project("own"), []).regions[0].feasible).toBe("yes");
  });

  it("refuses a battery with no way to reach it, thin prints and shared shapes", () => {
    const noAccess = checkHousing(plan([region({}), good[1]]), project());
    expect(noAccess.problems.join()).toContain("배터리");
    const thin = checkHousing(plan([region({ material: { name: "PLA", thicknessMm: 0.8 }, access: { purpose: "battery", how: "아래 덮개" } })]), project());
    expect(thin.problems.join()).toContain("1.2mm");
    const shared = checkHousing(plan([good[0], region({ id: "lid", name: "덮개", shapeRefs: [0], access: undefined })]), project());
    expect(shared.problems.join()).toContain("두 부위");
    const shelf = checkHousing(plan([region({ method: "off_the_shelf", access: { purpose: "battery", how: "뚜껑" } })]), project());
    expect(shelf.problems.join()).toContain("구매 링크");
  });

  it("warns about water without a seal and resin on skin", () => {
    const p = plan(good); p.environment = { ...p.environment, water: "rain", skinContact: true };
    const { warnings } = checkHousing(p, project());
    expect(warnings.join()).toContain("실링");
    expect(warnings.join()).toContain("완전 경화");
  });

  it("makes files from the product form: STL shells, a 1:1 PP net, cut panels and a mold plan", () => {
    const stl = regionStl(good[0], form);
    expect(stl.startsWith("solid dalgeurak_body")).toBe(true);
    expect((stl.match(/facet normal/g) ?? []).length).toBe(5 * 12); // 바닥 + 벽 4개, 상자마다 삼각형 12개
    const cyl = regionStl(region({ shapeRefs: [2] }), form);
    expect((cyl.match(/facet normal/g) ?? []).length).toBeGreaterThan(48 * 4);
    const net = ppUnfoldSvg(good[1], form)!;
    expect(net).toContain('width="'); expect(net).toContain("mm\""); expect(net).toContain("50mm 눈금");
    const cut = laserPanelsSvg(region({ method: "laser_cut", material: { name: "아크릴", thicknessMm: 3 } }), form)!;
    expect((cut.match(/<rect/g) ?? []).length).toBe(7); // 판 6장 + 앞면 충전 단자 구멍
    const mold = moldPlanMd(good[2], form)!;
    expect(mold).toContain("몰드 상자 안쪽");
    expect(mold).toMatch(/레진 \(약, 꽉 찬 경우\) \| \d+ ml/);
    const withPlan = { ...project(), housing: finalizeHousing(plan(good), project(), []) } as LocalProject;
    expect(housingFiles(withPlan).map((f) => f.id)).toEqual(["housing:body:stl", "housing:lid:unfold", "housing:grip:stl", "housing:grip:mold"]);
  });
});
