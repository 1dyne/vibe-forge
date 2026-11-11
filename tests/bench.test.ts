import { describe, expect, it } from "vitest";
import { KITS } from "../apps/web/lib/bench/kits";
import type { BenchOp } from "../apps/web/lib/bench/types";

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
        const moved = ops.filter((o) => o.op === "place" || o.op === "insert" || o.op === "mount_on").map((o) => (o as { ref: string }).ref);
        expect(new Set(moved).size).toBe(moved.length);
        ops.forEach((o, i) => {
          if (o.op !== "insert" && o.op !== "mount_on") return;
          const base = o.op === "insert" ? o.into : o.onto;
          const at = ops.findIndex((x) => (x.op === "place" || x.op === "insert") && x.ref === base);
          expect(at, `${o.ref} into ${base}`).toBeGreaterThanOrEqual(0);
          expect(at).toBeLessThan(i);
        });
      });
      it("solders only where something was inserted", () => {
        const filled = new Set<string>();
        for (const o of ops) {
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
