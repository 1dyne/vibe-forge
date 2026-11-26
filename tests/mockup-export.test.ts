import { describe, expect, it } from "vitest";
import type { MockupSpec } from "../apps/web/lib/mockup";
import { housingParts, mockupCadQuery, mockupScad, printNotes } from "../apps/web/lib/mockup-export";
import { partStl } from "../apps/web/lib/mockup-stl";
import { workbenchItems } from "../apps/web/lib/workbench";

const spec: MockupSpec = { title: "시험 상자", summary: "몸통과 뚜껑", parts: [
  { id: "body", name: "몸통", group: "housing", basis: "design", solids: [
    { shape: "hollowBox", size: [60, 40, 20], at: [0, 0, 0], wall: 2, floor: 2, openings: [{ wall: "front", offset: 0, bottom: 5, width: 10, height: 4 }] },
    { shape: "cylinder", diameter: 6, length: 8, at: [20, 10, 2] }
  ], cuts: [{ shape: "cylinder", diameter: 2.5, length: 9, at: [20, 10, 1.5] }] },
  { id: "lid", name: "뚜껑", group: "housing", basis: "design", solids: [{ shape: "box", size: [60, 40, 2], at: [0, 0, 20] }], cuts: [{ shape: "cylinder", diameter: 3.4, length: 3, at: [20, 10, 19.5] }] },
  { id: "board", name: "보드", group: "measured", basis: "assumed", solids: [{ shape: "box", size: [30, 20, 1.6], at: [0, 0, 5] }] }
] };

describe("printable files from the precise mockup", () => {
  it("makes one watertight solid per housing part with holes really cut", async () => {
    const [body, lid] = housingParts(spec);
    const b = await partStl(body);
    // 바깥 − 안쪽 − 앞벽 구멍 + 기둥 − 기둥 속 나사 구멍(기둥 8mm + 바닥 0.5mm)
    const post = Math.PI * 3 * 3 * 8; const screw = Math.PI * 1.25 * 1.25 * 8.5;
    const expected = 60 * 40 * 20 - 56 * 36 * 18 - 10 * 2 * 4 + post - screw;
    expect(Math.abs(b.volumeMm3 - expected) / expected).toBeLessThan(0.005);
    expect(b.stl.length).toBe(84 + b.triangles * 50);
    expect(b.size).toEqual([60, 40, 20]);
    const l = await partStl(lid);
    expect(Math.abs(l.volumeMm3 - (60 * 40 * 2 - Math.PI * 1.7 * 1.7 * 2)) / l.volumeMm3).toBeLessThan(0.005);
    // 출판에 놓이도록 바닥이 z=0
    const view = new DataView(l.stl.buffer); let minZ = Infinity;
    for (let i = 0; i < l.triangles; i++) for (let k = 0; k < 3; k++) minZ = Math.min(minZ, view.getFloat32(84 + i * 50 + 12 + k * 12 + 8, true));
    expect(minZ).toBeCloseTo(0, 4);
  });

  it("writes OpenSCAD and CadQuery scripts for housing parts only", () => {
    const scad = mockupScad(spec); const py = mockupCadQuery(spec);
    expect(scad).toContain("module part_body()"); expect(scad).toContain("cylinder(d=2.5"); expect(scad).not.toContain("part_board");
    expect(py).toContain("import cadquery as cq"); expect(py).toContain("lid = lid.cut(cyl(3.4"); expect(py).not.toContain("board =");
  });

  it("lists the files on the workbench and warns about guessed sizes", () => {
    const items = workbenchItems({ name: "시험", preciseMockup: spec, tasks: [], messages: [] } as never, { files: true });
    expect(items.filter((i) => i.generate?.kind === "mockup-stl").map((i) => i.filename)).toEqual(["시험-몸통-출력용.stl", "시험-뚜껑-출력용.stl"]);
    expect(items.some((i) => i.id === "mockup:scad")).toBe(true);
    expect(printNotes(spec).join(" ")).toContain("보드");
  });
});
