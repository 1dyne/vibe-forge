import { describe, expect, it } from "vitest";
import { checkMockup, expand, mockupBrief, type MockupPart, type MockupSpec } from "../apps/web/lib/mockup";

const body: MockupPart = { id: "body", name: "몸통", group: "housing", basis: "design", solids: [{ shape: "hollowBox", size: [88, 72, 21], at: [0, 0, 0], wall: 2, floor: 2 }] };
const pan: MockupPart = { id: "pan", name: "저울판", group: "housing", basis: "design", solids: [{ shape: "box", size: [88, 42.5, 3], at: [0, -14.75, 23] }] };
const atom = (y: number): MockupPart => ({ id: "atom", name: "AtomS3", group: "measured", basis: "measured", solids: [{ shape: "box", size: [24, 24, 9.5], at: [0, y, 8.8] }, { shape: "box", size: [9, 7, 3.2], at: [0, y + 12 + 3.5, 11] }] });
const spec = (parts: MockupPart[], extra: Partial<MockupSpec> = {}): MockupSpec => ({ title: "셈", summary: "s", parts, ...extra });
const find = (s: MockupSpec, id: string) => checkMockup(s).checks.find((c) => c.id === id)!;

describe("정밀 목업 검사", () => {
  it("속이 빈 상자는 바닥과 벽 넷으로 풀려서, 안에 든 부품은 겹치지 않는다", () => {
    expect(expand(body.solids[0])).toHaveLength(5);
    const inside: MockupPart = { id: "hx", name: "HX711", group: "measured", basis: "measured", solids: [{ shape: "box", size: [33.7, 21, 1.6], at: [20, 10, 3] }] };
    expect(find(spec([body, inside]), "overlap:body:hx")).toMatchObject({ pass: true });
  });

  it("단자가 앞벽에 박히면 몇 mm 겹치는지 잡는다", () => {
    // 몸통 앞벽 안쪽 면은 y=34. 단자 끝이 y=37.5까지 가면 벽(2mm)을 통째로 파고든다.
    const hit = find(spec([body, atom(18.5)]), "overlap:body:atom");
    expect(hit.pass).toBe(false);
    expect(hit.detail).toMatch(/겹침/);
    // 뒤로 물리면 통과한다
    expect(find(spec([body, atom(12)]), "overlap:body:atom").pass).toBe(true);
  });

  it("선 원기둥(나사)은 원으로 재서, 모서리만 스치는 상자와는 겹치지 않는다", () => {
    const screw: MockupPart = { id: "m4", name: "M4 나사", group: "measured", basis: "datasheet", solids: [{ shape: "cylinder", diameter: 4, length: 20, at: [0, 0, 0] }] };
    const corner: MockupPart = { id: "blk", name: "받침", group: "housing", basis: "design", solids: [{ shape: "box", size: [4, 4, 10], at: [3.6, 3.6, 0] }] };
    // 감싸는 상자끼리는 0.4mm 겹치지만, 원과 상자 모서리는 0.26mm 떨어져 있다
    expect(find(spec([screw, corner]), "overlap:m4:blk").pass).toBe(true);
    const through: MockupPart = { ...corner, solids: [{ shape: "box", size: [4, 4, 10], at: [1, 0, 0] }] };
    expect(find(spec([screw, through]), "overlap:m4:blk").pass).toBe(false);
  });

  it("끼워지는 쌍은 겹침 검사에서 빠지고, 비워 둘 자리를 침범하면 그렇게 말한다", () => {
    const pin: MockupPart = { id: "pin", name: "헤더핀", group: "measured", basis: "measured", solids: [{ shape: "box", size: [10, 2.5, 8], at: [0, 12, 4] }] };
    const s = spec([atom(12), pin], { mates: [["atom", "pin"]] });
    expect(checkMockup(s).checks.some((c) => c.id.startsWith("overlap:atom:pin"))).toBe(false);
    const plug: MockupPart = { id: "plug", name: "USB 플러그", group: "keepout", basis: "measured", solids: [{ shape: "box", size: [12, 20, 7], at: [0, 44, 9] }] };
    const wall: MockupPart = { id: "wall", name: "앞벽", group: "housing", basis: "design", solids: [{ shape: "box", size: [88, 2, 21], at: [0, 35, 0] }] };
    expect(find(spec([plug, wall]), "overlap:plug:wall").detail).toMatch(/비워 둬야 할 자리를 .* 침범/);
  });

  it("선언한 틈·포함·맞닿음을 잰다", () => {
    const rules: MockupSpec["rules"] = [
      { kind: "gap", title: "저울판과 몸통 사이 2mm", a: "pan", b: "body", axis: "z", min: 1.5, max: 2.5 },
      { kind: "inside", title: "AtomS3가 몸통 안", a: "atom", b: "body" },
      { kind: "touch", title: "저울판이 받침에 얹힘", a: "pan", b: "post" }
    ];
    const post: MockupPart = { id: "post", name: "받침", group: "housing", basis: "design", solids: [{ shape: "box", size: [16, 14, 4.3], at: [-32, -26, 18.7] }] };
    const report = checkMockup(spec([body, pan, atom(12), post], { rules, mates: [["body", "post"]] }));
    expect(report.checks.find((c) => c.kind === "gap")).toMatchObject({ pass: true, detail: "틈 2mm (필요 1.5~2.5mm)" });
    expect(report.checks.find((c) => c.kind === "inside")).toMatchObject({ pass: true });
    expect(report.checks.find((c) => c.kind === "touch")).toMatchObject({ pass: true });
    // 저울판을 1mm 내리면 틈이 모자란다
    const low = { ...pan, solids: [{ shape: "box" as const, size: [88, 42.5, 3] as [number, number, number], at: [0, -14.75, 22] as [number, number, number] }] };
    expect(checkMockup(spec([body, low], { rules: [rules[0]] })).checks.find((c) => c.kind === "gap")).toMatchObject({ pass: false, detail: "틈 1mm (필요 1.5~2.5mm)" });
  });

  it("요약은 통과 수와 전체 크기, 고칠 것을 숫자와 함께 말한다", () => {
    const s = spec([body, atom(18.5)]);
    const brief = mockupBrief(s, checkMockup(s));
    expect(brief).toContain("검사 0 / 1 통과");
    expect(brief).toContain("전체 크기 88×73.5×21mm");
    expect(brief).toContain("- 몸통 ↔ AtomS3:");
    const assumed = spec([body, { ...atom(12), basis: "assumed" }]);
    expect(checkMockup(assumed).warnings[0]).toContain("추정값");
  });
});

describe("벽의 구멍", () => {
  const holed = (width: number, offset = 0): MockupPart => ({ id: "body", name: "몸통", group: "housing", basis: "design", solids: [{ shape: "hollowBox", size: [88, 72, 21], at: [0, 0, 0], wall: 2, floor: 2, openings: [{ wall: "front", offset, bottom: 10, width, height: 6 }] }] });
  const usb = { id: "atom", name: "AtomS3", group: "measured" as const, basis: "measured" as const, solids: [{ shape: "box" as const, size: [9, 6, 3.2] as [number, number, number], at: [0, 34, 11] as [number, number, number] }] };
  it("구멍이 단자보다 넉넉하면 벽을 지나가도 겹치지 않는다", () => {
    expect(expand(holed(10).solids[0]).length).toBeGreaterThan(5);
    expect(checkMockup({ title: "t", summary: "s", parts: [holed(10), usb] }).checks[0].pass).toBe(true);
  });
  it("구멍이 좁거나 옆으로 어긋나면 몇 mm 걸리는지 잡는다", () => {
    expect(checkMockup({ title: "t", summary: "s", parts: [holed(8), usb] }).checks[0]).toMatchObject({ pass: false, detail: "0.5mm 겹침" });
    expect(checkMockup({ title: "t", summary: "s", parts: [holed(10, 3), usb] }).checks[0].pass).toBe(false);
  });
});
