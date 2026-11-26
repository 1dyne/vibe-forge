// 정밀 목업을 출력용 파일로 옮긴다: OpenSCAD·CadQuery 스크립트(글)와, 무엇을 뽑아야 하는지의 목록.
// 실제 STL(구멍을 파낸 덩어리)은 서버에서만 만든다(mockup-stl.ts). 여기는 화면에서도 쓰므로 가볍게 둔다.
import type { MockupPart, MockupSolid, MockupSpec } from "./mockup";

const n = (v: number) => String(Math.round(v * 1000) / 1000);
export const housingParts = (spec: MockupSpec): MockupPart[] => spec.parts.filter((p) => p.group === "housing");

/** 속 빈 상자의 구멍을, 벽을 넉넉히 뚫는 상자(바닥 중심 기준)로 바꾼다 */
export function openingBoxes(solid: Extract<MockupSolid, { shape: "hollowBox" }>): Array<{ size: [number, number, number]; at: [number, number, number] }> {
  const [x, y] = solid.size; const [cx, cy, z0] = solid.at; const w = solid.wall + 0.4;
  return (solid.openings ?? []).map((o) => {
    const z = z0 + o.bottom;
    if (o.wall === "front" || o.wall === "back") return { size: [o.width, w, o.height], at: [cx + o.offset, cy + (o.wall === "front" ? 1 : -1) * (y / 2 - solid.wall / 2), z] };
    return { size: [w, o.width, o.height], at: [cx + (o.wall === "right" ? 1 : -1) * (x / 2 - solid.wall / 2), cy + o.offset, z] };
  });
}

/** 출력 전에 사람이 알아야 할 것. 얇은 벽처럼 프린터가 못 뽑는 것을 미리 말한다 */
export function printNotes(spec: MockupSpec): string[] {
  const notes: string[] = [];
  for (const part of housingParts(spec)) {
    for (const s of part.solids) {
      if (s.shape === "hollowBox" && (s.wall < 1.2 || s.floor < 0.8)) notes.push(`${part.name}: 벽 ${n(s.wall)}mm · 바닥 ${n(s.floor)}mm는 얇아요. 벽 1.6mm, 바닥 1.2mm 이상을 권해요.`);
      if (s.shape === "box" && Math.min(...s.size) < 0.8) notes.push(`${part.name}: 가장 얇은 곳이 ${n(Math.min(...s.size))}mm예요. 0.8mm보다 얇으면 잘 안 뽑혀요.`);
      if (s.shape === "standoff" && (s.diameter - s.hole) / 2 < 1.2) notes.push(`${part.name}: 나사 기둥의 살이 ${n((s.diameter - s.hole) / 2)}mm예요. 1.2mm 이상이어야 나사를 조일 때 터지지 않아요.`);
      if (s.shape === "cylinder" && s.diameter < 2) notes.push(`${part.name}: 지름 ${n(s.diameter)}mm 기둥은 부러지기 쉬워요.`);
    }
    for (const c of part.cuts ?? []) if (c.shape === "cylinder" && c.diameter < 1.5) notes.push(`${part.name}: 지름 ${n(c.diameter)}mm 구멍은 출력하면 막힐 수 있어요. 2mm 이상을 권해요.`);
  }
  for (const part of spec.parts) if (part.group === "measured" && part.basis === "assumed") notes.push(`${part.name}의 치수가 추정값이에요. 뽑기 전에 실물을 재서 확인해요.`);
  return notes;
}

// ── OpenSCAD ────────────────────────────────────────────────────────────────

function scadSolid(s: MockupSolid): string {
  if (s.shape === "box") {
    const [x, y, z] = s.size; const [sx, sy] = s.rotate === 90 || s.rotate === 270 ? [y, x] : [x, y];
    return `rbox(${n(sx)}, ${n(sy)}, ${n(z)}, ${n(s.at[0])}, ${n(s.at[1])}, ${n(s.at[2])}, ${n(s.radius ?? 0)});`;
  }
  if (s.shape === "standoff") {
    const depth = Math.min(s.depth ?? s.height, s.height);
    return `difference() { translate([${s.at.map(n).join(", ")}]) cylinder(d=${n(s.diameter)}, h=${n(s.height)}); translate([${n(s.at[0])}, ${n(s.at[1])}, ${n(s.at[2] + s.height - depth)}]) cylinder(d=${n(s.hole)}, h=${n(depth + 0.2)}); }`;
  }
  if (s.shape === "cylinder") {
    const turn = s.axis === "x" ? "rotate([0, 90, 0]) " : s.axis === "y" ? "rotate([90, 0, 0]) " : "";
    return `translate([${s.at.map(n).join(", ")}]) ${turn}cylinder(d=${n(s.diameter)}, h=${n(s.length)}, center=${turn ? "true" : "false"});`;
  }
  const [x, y, z] = s.size; const [cx, cy, z0] = s.at;
  const holes = openingBoxes(s).map((o) => `    ${scadSolid({ shape: "box", ...o })}`).join("\n");
  return `difference() {\n    rbox(${n(x)}, ${n(y)}, ${n(z)}, ${n(cx)}, ${n(cy)}, ${n(z0)}, ${n(s.radius ?? 0)});\n    rbox(${n(x - 2 * s.wall)}, ${n(y - 2 * s.wall)}, ${n(z)}, ${n(cx)}, ${n(cy)}, ${n(z0 + s.floor)}, ${n(Math.max(0, (s.radius ?? 0) - s.wall))});\n${holes}${holes ? "\n" : ""}  }`;
}

const ident = (id: string) => id.replace(/[^a-z0-9]/g, "_");

export function mockupScad(spec: MockupSpec): string {
  const parts = housingParts(spec);
  const modules = parts.map((p) => `// ${p.name}\nmodule part_${ident(p.id)}() {\n  difference() {\n    union() {\n${p.solids.map((s) => `      ${scadSolid(s).replace(/\n/g, "\n    ")}`).join("\n")}\n    }\n${(p.cuts ?? []).map((s) => `    ${scadSolid(s)}`).join("\n")}\n  }\n}`).join("\n\n");
  return `// ${spec.title} — 달그락 대장간 정밀 목업에서 만든 출력용 모델 (단위 mm)
// 쓰는 법: OpenSCAD에서 열고, 아래 show 값을 뽑을 부위 이름으로 바꾼 뒤 F6(렌더) → F7(STL 내보내기).
// 부위: ${parts.map((p) => `"${p.id}"(${p.name})`).join(", ")} · "all"은 조립된 모습
show = "all";
$fn = 64;

// 바닥 중심이 (cx, cy, z0)인 상자. r > 0이면 세로 모서리가 둥글다.
module rbox(sx, sy, sz, cx, cy, z0, r) {
  if (r > 0.05) hull() for (a = [-1, 1], b = [-1, 1]) translate([cx + a * (sx / 2 - r), cy + b * (sy / 2 - r), z0]) cylinder(r=r, h=sz);
  else translate([cx - sx / 2, cy - sy / 2, z0]) cube([sx, sy, sz]);
}

${modules}

${parts.map((p) => `if (show == "all" || show == "${p.id}") part_${ident(p.id)}();`).join("\n")}
`;
}

// ── CadQuery ────────────────────────────────────────────────────────────────

function cqSolid(s: MockupSolid): string {
  if (s.shape === "box") {
    const [x, y, z] = s.size; const [sx, sy] = s.rotate === 90 || s.rotate === 270 ? [y, x] : [x, y];
    return `box(${n(sx)}, ${n(sy)}, ${n(z)}, ${n(s.at[0])}, ${n(s.at[1])}, ${n(s.at[2])}, ${n(s.radius ?? 0)})`;
  }
  if (s.shape === "standoff") {
    const depth = Math.min(s.depth ?? s.height, s.height);
    return `cyl(${n(s.diameter)}, ${n(s.height)}, ${s.at.map(n).join(", ")}).cut(cyl(${n(s.hole)}, ${n(depth + 0.2)}, ${n(s.at[0])}, ${n(s.at[1])}, ${n(s.at[2] + s.height - depth)}))`;
  }
  if (s.shape === "cylinder") return `cyl(${n(s.diameter)}, ${n(s.length)}, ${s.at.map(n).join(", ")}, "${s.axis ?? "z"}")`;
  const [x, y, z] = s.size; const [cx, cy, z0] = s.at;
  const shell = `box(${n(x)}, ${n(y)}, ${n(z)}, ${n(cx)}, ${n(cy)}, ${n(z0)}, ${n(s.radius ?? 0)}).cut(box(${n(x - 2 * s.wall)}, ${n(y - 2 * s.wall)}, ${n(z)}, ${n(cx)}, ${n(cy)}, ${n(z0 + s.floor)}, ${n(Math.max(0, (s.radius ?? 0) - s.wall))}))`;
  return shell + openingBoxes(s).map((o) => `.cut(${cqSolid({ shape: "box", ...o })})`).join("");
}

export function mockupCadQuery(spec: MockupSpec): string {
  const parts = housingParts(spec);
  const body = parts.map((p) => {
    const [first, ...rest] = p.solids;
    const lines = [`# ${p.name}`, `${ident(p.id)} = ${cqSolid(first)}`, ...rest.map((s) => `${ident(p.id)} = ${ident(p.id)}.union(${cqSolid(s)})`), ...(p.cuts ?? []).map((s) => `${ident(p.id)} = ${ident(p.id)}.cut(${cqSolid(s)})`)];
    return lines.join("\n");
  }).join("\n\n");
  return `# ${spec.title} — 달그락 대장간 정밀 목업에서 만든 출력용 모델 (단위 mm)
# 실행하면 부위마다 STL과 STEP 파일이 이 폴더에 생겨요. 모서리를 둥글게 하려면 맨 아래 안내를 보세요.
import cadquery as cq


def box(sx, sy, sz, cx, cy, z0, r=0):
    """바닥 중심이 (cx, cy, z0)인 상자. r > 0이면 세로 모서리가 둥글다"""
    solid = cq.Workplane("XY").box(sx, sy, sz, centered=(True, True, False))
    if r > 0.05:
        solid = solid.edges("|Z").fillet(min(r, sx / 2 - 0.01, sy / 2 - 0.01))
    return solid.translate((cx, cy, z0))


def cyl(d, length, x, y, z, axis="z"):
    """axis=z면 바닥 중심, x·y면 가운데가 (x, y, z)인 원기둥"""
    if axis == "z":
        return cq.Workplane("XY").circle(d / 2).extrude(length).translate((x, y, z))
    plane = "YZ" if axis == "x" else "XZ"
    return cq.Workplane(plane).circle(d / 2).extrude(length / 2, both=True).translate((x, y, z))


${body}

parts = {${parts.map((p) => `"${p.id}": ${ident(p.id)}`).join(", ")}}
for name, part in parts.items():
    cq.exporters.export(part, f"{name}.stl")
    cq.exporters.export(part, f"{name}.step")

# 모서리 다듬기 예: 세로 모서리를 2mm 둥글게
#   ${parts[0] ? ident(parts[0].id) : "body"} = ${parts[0] ? ident(parts[0].id) : "body"}.edges("|Z").fillet(2)
`;
}
