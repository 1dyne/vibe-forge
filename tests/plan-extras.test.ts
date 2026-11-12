import { describe, expect, it } from "vitest";
import { checkPower, computePower } from "../apps/web/lib/power";
import { mergeSafety, requiredSafety, unackedRisks } from "../apps/web/lib/safety";
import { snapshot } from "../apps/web/lib/history";
import { provisionalReasons } from "../apps/web/lib/provisional";
import { guideToKit } from "../apps/web/lib/bench/from-guide";
import type { LocalProject } from "../apps/web/lib/project-types";

// 2차 v0.1 §7 전원 · §10 기록 · §11 안전 · '바뀔 수 있어요' 스티커
const comps = [{ ref: "U1", type: "board", valueOrModel: "ESP32", reason: "", catalogId: "esp32-devkit-v1" }, { ref: "M1", type: "servo", valueOrModel: "SG90", reason: "", catalogId: "sg90-servo" }, { ref: "BAT1", type: "battery", valueOrModel: "LiPo 500mAh", reason: "", catalogId: "lipo-1s-jstph" }, { ref: "S1", type: "sensor", valueOrModel: "HC-SR04", reason: "", catalogId: "hc-sr04" }];
const base = (extra: Partial<LocalProject> = {}) => ({ id: "p", name: "끄덕이", productForm: { summary: "", answers: [], shape: [{ name: "몸", primitive: "box", size: [60, 40, 30], position: [0, 0, 0] }], features: [], internals: [], material: "", updatedAt: "" }, build: { blueprint: { components: comps, nets: [] } }, workflow: { profile: {} }, ...extra }) as unknown as LocalProject;

describe("power budget", () => {
  const input = { source: { kind: "battery" as const, capacityMah: 500, voltage: 3.7 }, modes: [{ name: "동작", dutyPct: 10, loads: [{ ref: "U1", currentMa: 100, basis: "datasheet" as const }, { ref: "M1", currentMa: 250, basis: "assumed" as const }] }, { name: "대기", dutyPct: 90, loads: [{ ref: "U1", currentMa: 20, basis: "datasheet" as const }] }], regulatorEfficiency: 0.85, derating: 0.8 };
  it("recomputes average, peak and hours on the server", () => {
    const r = computePower(input, base()).result;
    expect(r.avgCurrentMa).toBeCloseTo((0.1 * 350 + 0.9 * 20) / 0.85, 1);
    expect(r.peakCurrentMa).toBe(350);
    expect(r.hours).toBeCloseTo((500 * 0.8) / r.avgCurrentMa, 0);
    expect(r.estimated).toBe(true);
    expect(r.railWarnings.join()).toContain("모터");
  });
  it("refuses duty cycles that do not add up and unknown parts", () => {
    expect(checkPower({ ...input, modes: [{ ...input.modes[0], dutyPct: 50 }] }, base()).join()).toContain("100%");
    expect(checkPower({ ...input, modes: [{ name: "x", dutyPct: 100, loads: [{ ref: "ZZ", currentMa: 1, basis: "assumed" }] }] }, base()).join()).toContain("ZZ");
  });
});

describe("safety review", () => {
  it("adds required items from the parts and housing, and keeps them", () => {
    const p = base({ housing: { environment: { indoorOutdoor: "indoor", water: "none", heatSources: [], skinContact: true, childUse: true } } as never });
    const ids = requiredSafety(p).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["bat-protect", "bat-short", "skin-temp", "child-small", "motor-pinch"]));
    const merged = mergeSafety([{ id: "bat-protect", topic: "리튬 전지", text: "보호형 TP4056 사용", status: "ok" }, { id: "extra", topic: "기타", text: "모서리 날카로움", status: "risk" }], p);
    expect(merged.items.find((i) => i.id === "bat-protect")).toMatchObject({ status: "ok", required: true });
    expect(merged.items.some((i) => i.id === "bat-short" && i.required)).toBe(true);
    expect(unackedRisks({ ...p, safety: merged } as LocalProject).map((i) => i.id)).toEqual(["extra"]);
  });
});

describe("design history and the change sticker", () => {
  it("keeps the previous value before overwriting", () => {
    const p = base({ housing: { summary: "v1" } as never });
    snapshot(p, "housing", "set_housing_plan", "전");
    expect(p.history![0]).toMatchObject({ field: "housing", tool: "set_housing_plan" });
    expect(JSON.parse(p.history![0].snapshot).summary).toBe("v1");
    snapshot(p, "power", "x", "없음");
    expect(p.history).toHaveLength(1);
  });
  it("says what may still change", () => {
    const keys = provisionalReasons(base()).map((r) => r.key);
    expect(keys).toEqual(["housing", "parts", "power"]);
    const done = base({ housing: {} as never, power: {} as never, build: { blueprint: { components: [comps[0]], nets: [] } } as never });
    expect(provisionalReasons(done).map((r) => r.key)).toEqual([]);
  });
  it("adds housing steps to the 3D bench and carries the sticker", () => {
    const p = base({
      assembly: { stage: "1", base: { name: "판", kind: "board", width: 60, height: 40 }, parts: [{ ref: "U1", label: "ESP32", x: 5, y: 5, width: 28, height: 30, catalogId: "esp32-devkit-v1" }], steps: [{ title: "놓기", action: "놓아요", place: ["U1"], wires: [], check: "-", cards: [] }], updatedAt: "" },
      housing: { summary: "", regions: [{ id: "body", name: "본체", role: "담기", shapeRefs: [0], method: "pp_sheet", why: "싸요", material: { name: "PP", thicknessMm: 0.75 }, join: [], toleranceMm: null, outputs: [], process: ["자르기"], costKRW: 1000, timeHours: 1, feasible: "yes" }], environment: { indoorOutdoor: "indoor", water: "none", heatSources: [], skinContact: false, childUse: false }, assemblyOrder: ["body"], totals: { costKRW: 1000, timeHours: 1, partial: false }, risks: [], updatedAt: "" }
    });
    const kit = guideToKit(p)!;
    expect(kit.steps.at(-1)!.ops[0]).toMatchObject({ op: "enclose", refs: ["H_body_0"] });
    expect(kit.parts.find((x) => x.ref === "H_body_0")?.kind).toBe("housing_shape");
    expect(kit.provisional).toEqual(expect.arrayContaining(["부품 값 미검증", "전원 미계산"]));
  });
});
