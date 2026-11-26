// 정밀 목업의 하우징 부위를 실제로 뽑을 수 있는 STL로 만든다(서버 전용).
// 도형을 합치고(union) 구멍을 파낸(difference) 한 덩어리를 만들어야 슬라이서가 헷갈리지 않는다.
// 그 계산은 manifold-3d(WASM)에 맡긴다. 결과는 항상 물샐틈없는 덩어리다.
import type { MockupPart, MockupSolid } from "./mockup";
import { openingBoxes } from "./mockup-export";

type Kernel = { Manifold: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
let kernel: Promise<Kernel> | null = null;
async function load(): Promise<Kernel> {
  kernel ??= (async () => {
    const init = (await import("manifold-3d")).default;
    const wasm = await init();
    wasm.setup();
    return { Manifold: wasm.Manifold };
  })();
  return kernel;
}

const SEGMENTS = 64;

function solidOf(M: any, s: MockupSolid): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  const plain = (sx: number, sy: number, sz: number, cx: number, cy: number, z0: number) => M.cube([sx, sy, sz]).translate([cx - sx / 2, cy - sy / 2, z0]);
  // 세로 모서리가 둥근 상자: 네 귀퉁이의 원기둥을 감싼 모양.
  const cube = (sx: number, sy: number, sz: number, cx: number, cy: number, z0: number, radius = 0) => {
    const r = Math.min(radius, sx / 2 - 0.01, sy / 2 - 0.01);
    if (!(r > 0.05)) return plain(sx, sy, sz, cx, cy, z0);
    const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => M.cylinder(sz, r, r, SEGMENTS).translate([cx + a * (sx / 2 - r), cy + b * (sy / 2 - r), z0]));
    return M.hull(corners);
  };
  if (s.shape === "box") {
    const [x, y, z] = s.size; const [sx, sy] = s.rotate === 90 || s.rotate === 270 ? [y, x] : [x, y];
    return cube(sx, sy, z, s.at[0], s.at[1], s.at[2], s.radius);
  }
  if (s.shape === "standoff") {
    const depth = Math.min(s.depth ?? s.height, s.height);
    return M.cylinder(s.height, s.diameter / 2, s.diameter / 2, SEGMENTS).translate(s.at).subtract(M.cylinder(depth + 0.2, s.hole / 2, s.hole / 2, SEGMENTS).translate([s.at[0], s.at[1], s.at[2] + s.height - depth]));
  }
  if (s.shape === "cylinder") {
    const r = s.diameter / 2; const axis = s.axis ?? "z";
    if (axis === "z") return M.cylinder(s.length, r, r, SEGMENTS).translate(s.at);
    const lying = M.cylinder(s.length, r, r, SEGMENTS, true);
    return (axis === "x" ? lying.rotate([0, 90, 0]) : lying.rotate([90, 0, 0])).translate(s.at);
  }
  const [x, y, z] = s.size; const [cx, cy, z0] = s.at;
  // 안쪽을 위로 넉넉히 파내 윗면이 깔끔하게 열리게 한다.
  let shell = cube(x, y, z, cx, cy, z0, s.radius).subtract(cube(x - 2 * s.wall, y - 2 * s.wall, z, cx, cy, z0 + s.floor, Math.max(0, (s.radius ?? 0) - s.wall)));
  for (const o of openingBoxes(s)) shell = shell.subtract(plain(o.size[0], o.size[1], o.size[2], o.at[0], o.at[1], o.at[2]));
  return shell;
}

export type PartMesh = { triangles: number; volumeMm3: number; size: [number, number, number]; stl: Uint8Array };

/** 한 부위를 한 덩어리로 합치고 cuts를 파낸 뒤, 바닥이 z=0에 닿게 내려 이진 STL로 만든다 */
export async function partStl(part: MockupPart, opts: { place?: "bed" | "model" } = {}): Promise<PartMesh> {
  const { Manifold: M } = await load();
  let body = part.solids.map((s) => solidOf(M, s)).reduce((a, b) => a.add(b));
  for (const cut of part.cuts ?? []) body = body.subtract(solidOf(M, cut));
  const box = body.boundingBox();
  if ((opts.place ?? "bed") === "bed") body = body.translate([-(box.min[0] + box.max[0]) / 2, -(box.min[1] + box.max[1]) / 2, -box.min[2]]);
  const mesh = body.getMesh();
  const stride = mesh.numProp; const v = mesh.vertProperties; const t = mesh.triVerts;
  const count = t.length / 3;
  const out = new Uint8Array(84 + count * 50); const view = new DataView(out.buffer);
  new TextEncoder().encodeInto("dalgrak forge precise mockup", out);
  view.setUint32(80, count, true);
  for (let i = 0; i < count; i++) {
    const p = [0, 1, 2].map((k) => { const at = t[i * 3 + k] * stride; return [v[at], v[at + 1], v[at + 2]]; });
    const [ux, uy, uz] = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]]; const [wx, wy, wz] = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
    const o = 84 + i * 50;
    [nx, ny, nz, ...p.flat()].forEach((value, k) => view.setFloat32(o + k * 4, value, true));
  }
  return { triangles: count, volumeMm3: body.volume(), size: [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]], stl: out };
}
