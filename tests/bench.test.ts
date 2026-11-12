import { describe, expect, it } from "vitest";
import { KITS } from "../apps/web/lib/bench/kits";
import type { BenchOp } from "../apps/web/lib/bench/types";
import { GRADE_TEXT, HOLD_MS, bendableRefs, gradeHold, handsStages, holdFill, kitCanFlip, stepNeedsFlip, stepTools } from "../apps/web/lib/bench/hands";
import { GLOSSARY, glossaryIn, lookupGlossary, splitGlossary } from "../apps/web/lib/bench/glossary";

describe("hold-to-solder grading", () => {
  it("is lenient: early release is starved, far too long is cold, anything between is good", () => {
    expect(gradeHold(0)).toBe("starved");
    expect(gradeHold(300)).toBe("starved");
    expect(gradeHold(HOLD_MS.good - 1)).toBe("starved");
    expect(gradeHold(HOLD_MS.good)).toBe("good");
    expect(gradeHold(2200)).toBe("good");
    expect(gradeHold(3000)).toBe("good");
    expect(gradeHold(HOLD_MS.cold)).toBe("good");
    expect(gradeHold(HOLD_MS.cold + 1)).toBe("cold");
    expect(gradeHold(9000)).toBe("cold");
    expect(gradeHold(Number.NaN)).toBe("starved");
  });
  it("forms the cone between heating and the good mark", () => {
    expect(HOLD_MS.good).toBeGreaterThanOrEqual(1500);
    expect(HOLD_MS.good).toBeLessThanOrEqual(3000);
    expect(HOLD_MS.cold).toBeGreaterThan(HOLD_MS.warn);
    expect(holdFill(0)).toBe(0);
    expect(holdFill(HOLD_MS.heat)).toBe(0);
    expect(holdFill(HOLD_MS.good)).toBe(1);
    expect(holdFill(5000)).toBe(1);
    const mid = holdFill((HOLD_MS.heat + HOLD_MS.good) / 2);
    expect(mid).toBeGreaterThan(0.3); expect(mid).toBeLessThan(0.7);
  });
  it("has gentle copy for every grade, with a way to fix", () => {
    for (const g of ["good", "starved", "cold"] as const) expect(GRADE_TEXT[g].length).toBeGreaterThan(5);
    expect(GRADE_TEXT.starved).toMatch(/다시/);
    expect(GRADE_TEXT.cold).toMatch(/고쳐/);
  });
});

describe("hands-on stages", () => {
  const kit = KITS.find((k) => k.id === "solder-basics")!;
  const step = (title: string) => kit.steps.find((s) => s.title === title)!;
  const base = { canFlip: kitCanFlip(kit), flipped: false, hands: false, bendable: bendableRefs(kit) };
  it("flips the perfboard kit only", () => {
    expect(kitCanFlip(kit)).toBe(true);
    for (const k of KITS.filter((x) => x.id !== "solder-basics")) expect(kitCanFlip(k)).toBe(false);
  });
  it("solders a joint: flip, both hands, then hold each joint", () => {
    expect(handsStages(step("저항 납땜"), base)).toEqual([{ kind: "flip" }, { kind: "hands" }, { kind: "hold", op: 0, keys: ["PB.C5", "PB.G5"] }]);
    // 이미 뒤집고 양손에 들고 있으면 바로 꾹 누르기
    expect(handsStages(step("LED 납땜"), { ...base, flipped: true, hands: true })).toEqual([{ kind: "hold", op: 0, keys: ["PB.H5", "PB.I5"] }]);
  });
  it("inserts wires from the top before flipping to solder them", () => {
    expect(handsStages(step("전선 꽂고 납땜"), base).map((s) => s.kind)).toEqual(["tap", "flip", "hands", "hold"]);
  });
  it("bends resistor legs before inserting, and flips before trimming", () => {
    expect(handsStages(step("저항 꽂기"), base)).toEqual([{ kind: "bend", ref: "R1" }, { kind: "tap", from: 0, to: 1 }]);
    expect(handsStages(step("LED 꽂기"), base)).toEqual([{ kind: "tap", from: 0, to: 1 }]);
    expect(handsStages(step("다리 자르기"), base)).toEqual([{ kind: "flip" }, { kind: "tap", from: 0, to: 1 }]);
    expect(stepNeedsFlip(step("전지 넣고 켜기"), true)).toBe(false);
  });
  it("bridges are held too", () => {
    const st = handsStages(step("이웃 패드 잇기"), { ...base, flipped: true, hands: true });
    expect(st).toEqual([{ kind: "hold", op: 0, keys: ["PB.B5|PB.C5", "PB.G5|PB.H5", "PB.I5|PB.J5"] }]);
  });
  it("covers every op of every step in every kit exactly once", () => {
    for (const k of KITS) for (const s of k.steps) {
      const st = handsStages(s, { canFlip: kitCanFlip(k), flipped: false, hands: false, bendable: bendableRefs(k) });
      expect(st.length, `${k.id} ${s.title}`).toBeGreaterThan(0);
      const covered: number[] = [];
      for (const x of st) { if (x.kind === "tap") for (let i = x.from; i < x.to; i++) covered.push(i); if (x.kind === "hold") covered.push(x.op); }
      expect(covered.sort((a, b) => a - b), `${k.id} ${s.title}`).toEqual(s.ops.map((_, i) => i));
      for (const x of st) if (x.kind === "hold") expect(x.keys.length).toBeGreaterThan(0);
    }
  });
  it("names the tool each step needs", () => {
    expect(stepTools(step("저항 납땜"))).toEqual(["iron", "solder"]);
    expect(stepTools(step("다리 자르기"))).toEqual(["cutter"]);
    expect(stepTools(step("전선 준비"))).toEqual(expect.arrayContaining(["stripper", "iron", "solder"]));
    expect(stepTools(step("합선 검사"))).toEqual(["meter"]);
  });
});

describe("bench glossary", () => {
  it("looks up terms and aliases, ignoring case and spaces", () => {
    expect(lookupGlossary("피복")?.term).toBe("피복");
    expect(lookupGlossary(" 니퍼 ")?.short).toMatch(/자르/);
    expect(lookupGlossary("led")?.term).toBe("LED");
    expect(lookupGlossary("단락")?.term).toBe("합선");
    expect(lookupGlossary("없는 말")).toBeNull();
  });
  it("covers the words beginners stumble on", () => {
    for (const w of ["피복", "피복 벗기기", "니퍼", "실납", "플럭스", "냉납", "브리지", "만능기판", "헤더 핀", "패드", "극성", "인두", "와이어 스트리퍼"]) expect(lookupGlossary(w), w).not.toBeNull();
    for (const e of GLOSSARY) { expect(e.short.length).toBeGreaterThan(10); expect(e.short).toMatch(/요[.!]?$/); }
  });
  it("marks the longest term once and keeps the text intact", () => {
    const text = "피복 벗기기를 하면 피복 속 구리가 보여요. 피복은 비닐이에요.";
    const segs = splitGlossary(text);
    expect(segs.map((s) => (typeof s === "string" ? s : s.text)).join("")).toBe(text);
    const marked = segs.flatMap((s) => (typeof s === "string" ? [] : [s.entry.term]));
    expect(marked).toEqual(["피복 벗기기", "피복"]);
  });
  it("finds the terms in each kit's step text", () => {
    const kit = KITS.find((k) => k.id === "solder-basics")!;
    const all = glossaryIn(kit.steps.flatMap((s) => [s.action, s.why])).map((e) => e.term);
    for (const w of ["만능기판", "패드", "저항", "LED", "극성", "인두", "실납", "니퍼", "피복", "와이어 스트리퍼", "예비납", "브리지", "합선", "멀티미터", "통전"]) expect(all, w).toContain(w);
  });
});

// 연습 키트 데이터가 3D 엔진의 규칙을 지키는지 (명세서 2차 v0.1 §3·§5)
const hole = /^[A-Z]\d+$/;

describe("bench practice kits", () => {
  for (const kit of KITS.filter((k) => !k.draft)) {
    describe(kit.id, () => {
      const refs = new Set(kit.parts.map((p) => p.ref));
      const ops = kit.steps.flatMap((s) => s.ops);
      const anchorOk = (a: string) => {
        if (!a.includes(".")) return refs.has(a);
        const [ref, name] = a.split(".");
        const part = kit.parts.find((p) => p.ref === ref);
        if (!part) return false;
        if (part.kind === "perfboard" || part.kind === "breadboard") return hole.test(name);
        if (part.kind === "sensor_module") return (part.spec?.pinNames ?? []).includes(name);
        if (part.kind === "battery_holder_2aa") return name === "RED" || name === "BLK";
        if (part.kind === "wire") return name === "END";
        if (part.kind === "module") return (part.spec?.pinXY ?? []).some((p) => p.name === name);
        return false;
      };
      const anchors = (o: BenchOp): string[] => {
        switch (o.op) {
          case "insert": case "mount_on": return o.holes;
          case "prep_wire": return o.wires;
          case "insert_wire": return [o.wire, o.hole];
          case "solder": return o.joints;
          case "bridge": return o.pairs.flat();
          case "check": return o.targets;
          case "jumper": return [o.from, o.to];
          default: return [];
        }
      };

      it("has steps with text a beginner can follow", () => {
        expect(kit.steps.length).toBeGreaterThan(4);
        for (const s of kit.steps) { expect(s.action.length).toBeGreaterThan(8); expect(s.why.length).toBeGreaterThan(8); expect(s.doneWhen.length).toBeGreaterThan(2); expect(s.ops.length).toBeGreaterThan(0); }
      });
      it("refers only to real parts, holes and pins", () => {
        for (const o of ops) for (const a of anchors(o)) expect(anchorOk(a), `${o.op} ${a}`).toBe(true);
        for (const o of ops) if ("ref" in o) expect(refs.has(o.ref), o.ref).toBe(true);
      });
      it("places every part exactly once, boards before what goes into them", () => {
        const moved = ops.filter((o) => o.op === "place" || o.op === "insert" || o.op === "mount_on" || o.op === "seat").map((o) => (o as { ref: string }).ref);
        expect(new Set(moved).size).toBe(moved.length);
        ops.forEach((o, i) => {
          if (o.op !== "insert" && o.op !== "mount_on") return;
          const base = o.op === "insert" ? o.into : o.onto;
          const at = ops.findIndex((x) => (x.op === "place" || x.op === "insert") && x.ref === base);
          expect(at, `${o.ref} into ${base}`).toBeGreaterThanOrEqual(0);
          expect(at).toBeLessThan(i);
        });
      });
      it("solders only where something was inserted, a wire ends, or on a module pad", () => {
        const filled = new Set<string>();
        for (const p of kit.parts) if (p.kind === "sensor_module") (p.spec?.pinNames ?? []).forEach((n) => filled.add(`${p.ref}.${n}`));
        for (const o of ops) {
          if (o.op === "jumper") { filled.add(o.from); filled.add(o.to); }
          if (o.op === "insert") o.holes.forEach((h) => filled.add(h));
          if (o.op === "mount_on") o.holes.forEach((h) => filled.add(h));
          if (o.op === "insert_wire") filled.add(o.hole);
          if (o.op === "solder") for (const j of o.joints) expect(filled.has(j), j).toBe(true);
        }
      });
      it("keeps safety and a way to ask for help", () => {
        expect(kit.safety.length).toBeGreaterThan(1);
        expect(kit.faq.length).toBeGreaterThan(2);
      });
    });
  }

  it("never bridges the LED's own two legs in the first kit", () => {
    const kit = KITS.find((k) => k.id === "solder-basics")!;
    const pairs = kit.steps.flatMap((s) => s.ops).flatMap((o) => (o.op === "bridge" ? o.pairs : []));
    const led = kit.steps.flatMap((s) => s.ops).find((o) => o.op === "insert" && o.ref === "D1") as Extract<BenchOp, { op: "insert" }>;
    for (const [a, b] of pairs) expect(new Set([a, b])).not.toEqual(new Set(led.holes));
  });
});
