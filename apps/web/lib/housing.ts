import type { FabMethod, HousingPlan, HousingRegion, LocalProject, MakerProfile, ProductForm, ShapePart } from "./project-types";

// 하우징 부위별 제작 방식 (명세서 2차 v0.1 §6): 서버 검증·계산과 산출물 생성.
// 산출물은 ProductForm 도형에서 그대로 만든다(값을 지어내지 않음). 단위 mm.

export const FAB_LABEL: Record<FabMethod, string> = {
  print_fdm: "3D 프린트(FDM)", print_resin: "레진 3D 프린트", resin_cast: "레진 주형", pp_sheet: "PP 시트 + 양면테이프",
  laser_cut: "레이저 커팅", foam_board: "폼보드", fabric_sew: "원단·봉제", off_the_shelf: "기성 케이스", none: "하우징 없음"
};
export const FAB_ICON: Record<FabMethod, string> = { print_fdm: "🖨", print_resin: "🖨", resin_cast: "🧪", pp_sheet: "✂️", laser_cut: "🔺", foam_board: "📐", fabric_sew: "🧵", off_the_shelf: "🛒", none: "—" };

const BATTERY = /BAT|배터리|전지|LiPo|리튬|18650|cell/i;
const SEAL = /오링|O-?ring|실리콘|가스켓|gasket|실링|seal/i;

export type Box3 = { min: [number, number, number]; max: [number, number, number] };
export function shapeBox(s: ShapePart): Box3 {
  const [sx, sy, sz] = s.size, [px, py, pz] = s.position;
  return { min: [px - sx / 2, py - sy / 2, pz], max: [px + sx / 2, py + sy / 2, pz + sz] };
}
export function regionBox(region: HousingRegion, form: ProductForm | undefined): Box3 | null {
  const shapes = region.shapeRefs.map((i) => form?.shape[i]).filter((s): s is ShapePart => !!s);
  if (!shapes.length) return null;
  const bs = shapes.map(shapeBox);
  return { min: [0, 1, 2].map((k) => Math.min(...bs.map((b) => b.min[k]))) as Box3["min"], max: [0, 1, 2].map((k) => Math.max(...bs.map((b) => b.max[k]))) as Box3["max"] };
}
export function shapeVolumeMm3(s: ShapePart) {
  const [a, b, c] = s.size;
  if (s.primitive === "box") return a * b * c;
  const r = Math.min(a, b) / 2;
  if (s.primitive === "cylinder") return Math.PI * r * r * c;
  if (s.primitive === "cone") return (Math.PI * r * r * c) / 3;
  return (4 / 3) * Math.PI * (a / 2) * (b / 2) * (c / 2);
}

/** 사용자 도구·접근성으로 이 방식을 직접 할 수 있는지 */
export function feasibility(method: FabMethod, profile: MakerProfile | undefined): HousingRegion["feasible"] {
  const printer = profile?.printerAccess ?? "unanswered";
  if (method === "print_fdm") return printer === "own" || printer === "makerspace" ? "yes" : printer === "service" ? "needs_service" : "unknown";
  if (method === "print_resin") return printer === "service" ? "needs_service" : "unknown";
  if (method === "laser_cut") return "needs_service";
  if (method === "resin_cast") return "unknown";
  return "yes";
}

export type HousingCheck = { problems: string[]; warnings: string[] };

/** 저장 전 검사. problems가 있으면 저장하지 않는다. */
export function checkHousing(plan: Omit<HousingPlan, "totals" | "updatedAt" | "risks"> & { risks?: string[] }, project: LocalProject): HousingCheck {
  const problems: string[] = [], warnings: string[] = [];
  const form = project.productForm;
  if (!form) problems.push("먼저 set_product_form으로 완성품 형태를 정하세요. 부위는 그 도형(shape)을 가리켜요.");
  const ids = new Set<string>();
  const used = new Map<number, string>();
  for (const r of plan.regions) {
    if (ids.has(r.id)) problems.push(`부위 id ${r.id}가 중복돼요`); ids.add(r.id);
    for (const i of r.shapeRefs) {
      if (!form?.shape[i]) problems.push(`${r.name}: shapeRefs ${i}번 도형이 완성품 형태에 없어요`);
      else if (used.has(i)) problems.push(`${i}번 도형(${form.shape[i].name})이 ${used.get(i)}와 ${r.name} 두 부위에 들어 있어요`);
      else used.set(i, r.name);
    }
    if (r.method !== "none" && !r.material.name.trim()) problems.push(`${r.name}: 재료를 정하세요`);
    const t = r.material.thicknessMm;
    if (r.method === "print_fdm" || r.method === "print_resin") {
      if (t == null || t < 1.2) problems.push(`${r.name}: 프린트 벽 두께는 1.2mm 이상이어야 해요 (material.thicknessMm)`);
      if (r.toleranceMm == null) problems.push(`${r.name}: 끼워 맞춤 공차(toleranceMm, FDM 보통 0.2~0.3mm)를 넣으세요`);
      if (!r.process.some((p) => /방향|orientation|서포트|support/i.test(p))) warnings.push(`${r.name}: 출력 방향과 서포트 여부를 process에 적어 주세요`);
    }
    if (r.method === "pp_sheet" && (t == null || t < 0.3 || t > 1.5)) problems.push(`${r.name}: PP 시트 두께는 0.3~1.5mm 사이로 정하세요 (보통 0.5·0.75·1.0)`);
    if ((r.method === "laser_cut" || r.method === "foam_board") && t == null) problems.push(`${r.name}: 판재 두께를 정하세요`);
    if (r.method === "resin_cast" && r.process.length < 3) problems.push(`${r.name}: 레진 주형은 원형 → 몰드 → 주입·경화 순서를 process에 3단계 이상 적어 주세요`);
    if (r.method === "off_the_shelf" && !r.outputs.some((o) => o.kind === "buy_link" && o.url)) problems.push(`${r.name}: 기성 케이스는 구매 링크(outputs buy_link url)가 필요해요`);
    if (r.method === "pp_sheet" && !r.join.some((j) => j.method === "tape" || j.method === "glue" || j.method === "slot")) warnings.push(`${r.name}: PP 시트는 양면테이프·접착·끼움 중 무엇으로 붙일지 join에 적어 주세요`);
    if ((r.method === "print_resin" || r.method === "resin_cast") && plan.environment.skinContact) warnings.push(`${r.name}: 피부에 닿는 레진은 완전 경화(후경화)와 코팅이 필요해요. 덜 굳은 레진은 피부 자극을 일으킬 수 있어요.`);
    for (const j of r.join) if (!plan.regions.some((x) => x.id === j.to) && j.to !== "internal" && j.to !== "base") warnings.push(`${r.name}: 결합 대상 ${j.to}가 부위 id에 없어요`);
  }
  if (form) for (const [i, s] of form.shape.entries()) if (!used.has(i)) warnings.push(`${i}번 도형(${s.name})이 어느 부위에도 없어요`);
  // 내부 부품이 들어가는 부위 안에 공차까지 포함해 들어가는지
  for (const part of form?.internals ?? []) {
    const [px, py, pz] = part.position, [sx, sy, sz] = part.size;
    const holder = plan.regions.find((r) => { const b = regionBox(r, form); return b && px >= b.min[0] && px <= b.max[0] && py >= b.min[1] && py <= b.max[1]; });
    if (!holder) continue;
    const b = regionBox(holder, form)!, wall = holder.material.thicknessMm ?? 0, tol = holder.toleranceMm ?? 0;
    const fits = px - sx / 2 >= b.min[0] + wall + tol && px + sx / 2 <= b.max[0] - wall - tol && py - sy / 2 >= b.min[1] + wall + tol && py + sy / 2 <= b.max[1] - wall - tol && pz >= b.min[2] + wall && pz + sz <= b.max[2] - (holder.method === "none" ? 0 : wall);
    if (!fits) warnings.push(`${part.ref}(${part.label})가 ${holder.name} 안에 벽 ${wall}mm·공차 ${tol}mm를 빼면 들어가지 않을 수 있어요`);
  }
  const hasBattery = (form?.internals ?? []).some((i) => BATTERY.test(i.ref) || BATTERY.test(i.label)) || (project.build?.blueprint.components ?? []).some((c) => BATTERY.test(c.ref) || BATTERY.test(c.type) || BATTERY.test(c.valueOrModel));
  if (hasBattery && !plan.regions.some((r) => r.access && (r.access.purpose === "battery" || r.access.purpose === "charging"))) problems.push("배터리가 있어요. 배터리를 갈거나 충전할 곳(access: battery 또는 charging)을 어느 부위에 둘지 정하세요.");
  if (plan.environment.water !== "none" && !plan.regions.some((r) => r.join.some((j) => SEAL.test(j.detail)))) warnings.push(`물(${plan.environment.water})에 닿아요. 결합부에 오링·실리콘·가스켓 같은 실링이 없어요.`);
  if (plan.environment.childUse) warnings.push("아이가 써요: 지름 31.7mm보다 작은 부품은 삼킬 수 있어요. 배터리 덮개는 나사로 잠가 주세요.");
  if (plan.environment.heatSources.length) warnings.push(`열이 나는 곳(${plan.environment.heatSources.join(", ")}) 근처에 통풍 구멍을 두고 PLA 대신 PETG 이상을 고려하세요.`);
  return { problems, warnings };
}

/** 서버가 다시 계산하는 값: 가능 여부, 산출물 상태, 합계, 위험 */
export function finalizeHousing(plan: Omit<HousingPlan, "totals" | "updatedAt" | "risks"> & { risks?: string[] }, project: LocalProject, warnings: string[]): HousingPlan {
  const profile = project.workflow?.profile;
  const regions = plan.regions.map((r) => {
    const generated = generatedKinds(r.method);
    const outputs = [...r.outputs.filter((o) => !generated.includes(o.kind)), ...generated.map((kind) => ({ kind, status: "ready" as const, note: "작업대에서 내려받기 (완성품 도형 기준)" }))];
    return { ...r, outputs, feasible: feasibility(r.method, profile) };
  });
  const costs = regions.map((r) => r.costKRW), times = regions.map((r) => r.timeHours);
  const sum = (xs: Array<number | null>) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);
  return {
    ...plan, regions,
    totals: { costKRW: costs.some((c) => c != null) ? sum(costs) : null, timeHours: times.some((t) => t != null) ? sum(times) : null, partial: costs.some((c) => c == null) || times.some((t) => t == null) },
    risks: [...new Set([...(plan.risks ?? []), ...warnings])],
    updatedAt: new Date().toISOString()
  };
}

export function generatedKinds(method: FabMethod): HousingRegion["outputs"][number]["kind"][] {
  if (method === "print_fdm" || method === "print_resin") return ["stl"];
  if (method === "pp_sheet") return ["dxf_unfold"];
  if (method === "laser_cut" || method === "foam_board") return ["svg_cut"];
  if (method === "resin_cast") return ["stl", "mold_plan"];
  return [];
}

// ───────────── STL ─────────────

type V = [number, number, number];
type Tri = [V, V, V];
function quad(a: V, b: V, c: V, d: V): Tri[] { return [[a, b, c], [a, c, d]]; }
/** 축 정렬 상자 (바깥을 향하는 면) */
function boxTris(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Tri[] {
  const p = (x: number, y: number, z: number): V => [x, y, z];
  return [
    ...quad(p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), p(x1, y0, z0)), // 아래
    ...quad(p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)), // 위
    ...quad(p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)), // 앞(-y)
    ...quad(p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0)), // 뒤(+y)
    ...quad(p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0)), // 왼(-x)
    ...quad(p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1))  // 오(+x)
  ];
}
/** 원기둥·고리(속이 빈 원통). rIn=0이면 꽉 찬 원기둥 */
function ringTris(cx: number, cy: number, z0: number, z1: number, rOut: number, rIn: number, rTop = rOut, seg = 48): Tri[] {
  const out: Tri[] = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const P = (r: number, a: number, z: number): V => [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
    out.push(...quad(P(rOut, a0, z0), P(rOut, a1, z0), P(rTop, a1, z1), P(rTop, a0, z1)));
    if (rIn > 0) {
      out.push(...quad(P(rIn, a1, z0), P(rIn, a0, z0), P(rIn, a0, z1), P(rIn, a1, z1)));
      out.push(...quad(P(rIn, a0, z0), P(rIn, a1, z0), P(rOut, a1, z0), P(rOut, a0, z0)).map((t) => [t[0], t[2], t[1]] as Tri));
      out.push(...quad(P(rIn, a0, z1), P(rTop, a0, z1), P(rTop, a1, z1), P(rIn, a1, z1)).map((t) => [t[0], t[2], t[1]] as Tri));
    } else {
      out.push([[cx, cy, z0], P(rOut, a1, z0), P(rOut, a0, z0)]);
      if (rTop > 0) out.push([[cx, cy, z1], P(rTop, a0, z1), P(rTop, a1, z1)]);
    }
  }
  return out;
}
function sphereTris(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, seg = 32, rings = 16): Tri[] {
  const out: Tri[] = [];
  const P = (i: number, j: number): V => { const th = (j / rings) * Math.PI, ph = (i / seg) * Math.PI * 2; return [cx + rx * Math.sin(th) * Math.cos(ph), cy + ry * Math.sin(th) * Math.sin(ph), cz + rz * Math.cos(th)]; };
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) out.push(...quad(P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j)).map((t) => [t[0], t[2], t[1]] as Tri));
  return out;
}

/**
 * 부위 STL. 상자·원기둥은 위가 열린 껍데기(바닥 + 벽, 두께 = material.thicknessMm),
 * 공·원뿔은 꽉 찬 외형. 붙은 면이 겹치는 곳은 슬라이서의 '메시 수리'가 합친다.
 */
export function regionStl(region: HousingRegion, form: ProductForm): string {
  const t = Math.max(1.2, region.material.thicknessMm ?? 2);
  const tris: Tri[] = [];
  for (const i of region.shapeRefs) {
    const s = form.shape[i]; if (!s) continue;
    const [sx, sy, sz] = s.size, [px, py, pz] = s.position;
    if (s.primitive === "box") {
      const x0 = px - sx / 2, x1 = px + sx / 2, y0 = py - sy / 2, y1 = py + sy / 2, z0 = pz, z1 = pz + sz;
      if (sx <= 2 * t + 1 || sy <= 2 * t + 1 || sz <= t + 1) tris.push(...boxTris(x0, y0, z0, x1, y1, z1));
      else {
        tris.push(...boxTris(x0, y0, z0, x1, y1, z0 + t));
        tris.push(...boxTris(x0, y0, z0 + t, x1, y0 + t, z1), ...boxTris(x0, y1 - t, z0 + t, x1, y1, z1));
        tris.push(...boxTris(x0, y0 + t, z0 + t, x0 + t, y1 - t, z1), ...boxTris(x1 - t, y0 + t, z0 + t, x1, y1 - t, z1));
      }
    } else if (s.primitive === "cylinder") {
      const r = Math.min(sx, sy) / 2;
      if (r <= t + 1 || sz <= t + 1) tris.push(...ringTris(px, py, pz, pz + sz, r, 0));
      else { tris.push(...ringTris(px, py, pz, pz + t, r, 0)); tris.push(...ringTris(px, py, pz + t, pz + sz, r, r - t)); }
    } else if (s.primitive === "cone") {
      tris.push(...ringTris(px, py, pz, pz + sz, Math.min(sx, sy) / 2, 0, 0.0001));
    } else {
      tris.push(...sphereTris(px, py, pz + sz / 2, sx / 2, sy / 2, sz / 2));
    }
  }
  const n = (a: V, b: V, c: V) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; const x = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(x[0], x[1], x[2]) || 1; return x.map((k) => (k / l).toFixed(5)).join(" "); };
  const f = (v: V) => v.map((k) => k.toFixed(3)).join(" ");
  const name = `dalgeurak_${region.id}`;
  return `solid ${name}\n${tris.map(([a, b, c]) => `facet normal ${n(a, b, c)}\n outer loop\n  vertex ${f(a)}\n  vertex ${f(b)}\n  vertex ${f(c)}\n endloop\nendfacet`).join("\n")}\nendsolid ${name}\n`;
}

// ───────────── PP 전개도 · 레이저 판 ─────────────

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
type Hole = { face: "front" | "back" | "left" | "right" | "top" | "bottom"; u: number; v: number; w: number; h: number; name: string };

/** 부위 상자에 닿는 겉 기능(버튼·포트 등)의 구멍: 면 위 좌표(면 왼쪽 아래 기준 mm) */
function regionHoles(region: HousingRegion, form: ProductForm): { box: Box3; holes: Hole[] } | null {
  const box = regionBox(region, form); if (!box) return null;
  const [x0, y0, z0] = box.min, [x1, y1] = box.max;
  const holes: Hole[] = [];
  for (const f of form.features) {
    const [fx, fy, fz] = f.position, [a, b] = f.size;
    const inside = fx >= x0 - 6 && fx <= x1 + 6 && fy >= y0 - 6 && fy <= y1 + 6 && fz >= z0 - 6 && fz <= box.max[2] + 6;
    if (!inside) continue;
    const uv: Record<Hole["face"], [number, number]> = { front: [fx - x0, fz - z0], back: [x1 - fx, fz - z0], left: [y1 - fy, fz - z0], right: [fy - y0, fz - z0], top: [fx - x0, fy - y0], bottom: [fx - x0, y1 - fy] };
    const [u, v] = uv[f.facing];
    holes.push({ face: f.facing, u, v, w: a, h: b, name: f.name });
  }
  return { box, holes };
}

/** PP 시트 상자 전개도 (1:1 mm). 실선 = 자르기, 점선 = 접기, 회색 = 양면테이프 붙일 날개 */
export function ppUnfoldSvg(region: HousingRegion, form: ProductForm): string | null {
  const r = regionHoles(region, form); if (!r) return null;
  const W = r.box.max[0] - r.box.min[0], D = r.box.max[1] - r.box.min[1], H = r.box.max[2] - r.box.min[2], F = 10, M = 15;
  // 바닥을 가운데, 앞·뒤·왼·오 벽을 둘레에, 뚜껑은 뒤 벽에 붙인다
  const ox = M + F + H, oy = M + H + D + 0; // 바닥 왼쪽 위
  const panels: Array<{ face: Hole["face"]; x: number; y: number; w: number; h: number; label: string }> = [
    { face: "top", x: ox, y: M, w: W, h: D, label: "뚜껑" },
    { face: "back", x: ox, y: M + D, w: W, h: H, label: "뒤" },
    { face: "bottom", x: ox, y: oy, w: W, h: D, label: "바닥" },
    { face: "front", x: ox, y: oy + D, w: W, h: H, label: "앞" },
    { face: "left", x: ox - H, y: oy, w: H, h: D, label: "왼" },
    { face: "right", x: ox + W, y: oy, w: H, h: D, label: "오" }
  ];
  const totalW = ox + W + H + F + M, totalH = oy + D + H + F + M + 30;
  const cut: string[] = [], fold: string[] = [], flaps: string[] = [], text: string[] = [];
  for (const p of panels) text.push(`<text x="${p.x + p.w / 2}" y="${p.y + p.h / 2}" font-size="5" text-anchor="middle" fill="#888">${p.label}</text>`);
  // 접는 선: 바닥 둘레, 뒤–뚜껑
  fold.push(`M${ox} ${oy}h${W}`, `M${ox} ${oy + D}h${W}`, `M${ox} ${oy}v${D}`, `M${ox + W} ${oy}v${D}`, `M${ox} ${M + D}h${W}`);
  // 날개: 앞·뒤 벽 양옆 (왼·오 벽 안쪽에 붙음), 뚜껑 앞쪽 끼움 날개
  const flap = (x: number, y: number, w: number, h: number, side: "l" | "r" | "t" | "b") => {
    const i = 2; let d = "";
    if (side === "l") d = `M${x} ${y}l${-F} ${i}v${h - 2 * i}l${F} ${i}`;
    if (side === "r") d = `M${x} ${y}l${F} ${i}v${h - 2 * i}l${-F} ${i}`;
    if (side === "t") d = `M${x} ${y}l${i} ${-F}h${w - 2 * i}l${i} ${F}`;
    if (side === "b") d = `M${x} ${y}l${i} ${F}h${w - 2 * i}l${i} ${-F}`;
    flaps.push(`<path d="${d}" fill="#ddd" stroke="#000" stroke-width=".3"/>`);
    fold.push(side === "l" || side === "r" ? `M${x} ${y}v${h}` : `M${x} ${y}h${w}`);
  };
  flap(ox, M + D, W, H, "l"); flap(ox + W, M + D, W, H, "r");
  flap(ox, oy + D, W, H, "l"); flap(ox + W, oy + D, W, H, "r");
  flap(ox, M, W, D, "t");
  // 바깥 자르는 선 (날개 제외 패널 외곽)
  cut.push(`M${ox} ${M}h${W}v${D + H}h${H}v${D}h${-H}v${H}h${-W}v${-H}h${-H}v${-D}h${H}z`);
  cut.push(`M${ox} ${oy + D}v${H}h${W}v${-H}`);
  // 구멍
  for (const h of r.holes) {
    const p = panels.find((x) => x.face === h.face); if (!p) continue;
    const isWall = h.face !== "top" && h.face !== "bottom";
    const cx = p.x + (h.face === "left" || h.face === "right" ? (p.w - h.v) : h.u), cy = isWall ? (h.face === "back" ? p.y + h.v : p.y + p.h - h.v) : p.y + (p.h - h.v);
    const [w, hh] = h.face === "left" || h.face === "right" ? [h.h, h.w] : [h.w, h.h];
    cut.push(`M${(cx - w / 2).toFixed(2)} ${(cy - hh / 2).toFixed(2)}h${w}v${hh}h${-w}z`);
    text.push(`<text x="${cx}" y="${(cy + hh / 2 + 4).toFixed(2)}" font-size="3" text-anchor="middle">${esc(h.name)}</text>`);
  }
  const t = region.material.thicknessMm ?? 0.75;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}mm" height="${totalH}mm" viewBox="0 0 ${totalW} ${totalH}">
<title>${esc(region.name)} PP 시트 전개도 (1:1)</title>
${flaps.join("\n")}
<path d="${cut.join(" ")}" fill="none" stroke="#000" stroke-width=".35"/>
<path d="${fold.join(" ")}" fill="none" stroke="#2a7fd6" stroke-width=".3" stroke-dasharray="2 1.5"/>
${text.join("\n")}
<g transform="translate(${M} ${totalH - 22})"><path d="M0 0h50M0 -2v4M10 -1v2M20 -1v2M30 -1v2M40 -1v2M50 -2v4" stroke="#000" stroke-width=".3"/><text x="0" y="8" font-size="3.5">50mm 눈금: 인쇄 후 자로 재서 50mm인지 확인 (배율 100%)</text>
<text x="0" y="14" font-size="3.5">${esc(region.name)} · PP ${t}mm · ${W.toFixed(1)}×${D.toFixed(1)}×${H.toFixed(1)}mm · 실선 자르기 / 파란 점선 접기(칼등으로 금 긋기) / 회색 날개에 양면테이프</text></g>
</svg>
`;
}

/** 레이저·폼보드: 상자 6면을 따로 자르는 판 (1:1 mm). 맞대기 결합 기준, 커프 보정 없음 */
export function laserPanelsSvg(region: HousingRegion, form: ProductForm): string | null {
  const r = regionHoles(region, form); if (!r) return null;
  const t = region.material.thicknessMm ?? 3;
  const W = r.box.max[0] - r.box.min[0], D = r.box.max[1] - r.box.min[1], H = r.box.max[2] - r.box.min[2], G = 6, M = 10;
  // 바닥·뚜껑은 전체, 앞·뒤는 폭 전체 × (높이 - 2t), 왼·오는 (깊이 - 2t) × (높이 - 2t)
  const list: Array<{ face: Hole["face"]; w: number; h: number; label: string }> = [
    { face: "bottom", w: W, h: D, label: "바닥" }, { face: "top", w: W, h: D, label: "뚜껑" },
    { face: "front", w: W, h: H - 2 * t, label: "앞" }, { face: "back", w: W, h: H - 2 * t, label: "뒤" },
    { face: "left", w: D - 2 * t, h: H - 2 * t, label: "왼" }, { face: "right", w: D - 2 * t, h: H - 2 * t, label: "오" }
  ];
  let x = M, y = M, rowH = 0; const maxW = Math.max(300, W * 2 + G * 3);
  const shapes: string[] = [];
  for (const p of list) {
    if (x + p.w > maxW) { x = M; y += rowH + G; rowH = 0; }
    shapes.push(`<rect x="${x}" y="${y}" width="${p.w.toFixed(2)}" height="${p.h.toFixed(2)}" fill="none" stroke="#f00" stroke-width=".1"/><text x="${x + 2}" y="${y + 5}" font-size="4" fill="#00f">${p.label}</text>`);
    for (const h of r.holes.filter((hh) => hh.face === p.face)) {
      const cx = x + Math.min(p.w, Math.max(0, h.face === "left" || h.face === "right" ? h.u - t : h.u)), cy = y + p.h - Math.min(p.h, Math.max(0, h.face === "top" || h.face === "bottom" ? h.v : h.v - t));
      shapes.push(`<rect x="${(cx - h.w / 2).toFixed(2)}" y="${(cy - h.h / 2).toFixed(2)}" width="${h.w}" height="${h.h}" fill="none" stroke="#f00" stroke-width=".1"/>`);
    }
    x += p.w + G; rowH = Math.max(rowH, p.h);
  }
  const totalH = y + rowH + M + 14;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${maxW + M}mm" height="${totalH}mm" viewBox="0 0 ${maxW + M} ${totalH}">
<title>${esc(region.name)} 판 재단 (1:1)</title>
${shapes.join("\n")}
<text x="${M}" y="${totalH - 6}" font-size="4">${esc(region.name)} · ${esc(region.material.name)} ${t}mm · 빨간 선 = 자르기(0.1mm 선) · 맞대기 결합 기준이며 커프(보통 0.1~0.2mm) 보정은 하지 않았어요</text>
</svg>
`;
}

/** 레진 주형 계획: 원형·몰드 상자·실리콘·레진 양 (꽉 찬 도형 기준) */
export function moldPlanMd(region: HousingRegion, form: ProductForm): string | null {
  const box = regionBox(region, form); if (!box) return null;
  const W = box.max[0] - box.min[0], D = box.max[1] - box.min[1], H = box.max[2] - box.min[2], m = 10;
  const partMl = region.shapeRefs.reduce((a, i) => a + (form.shape[i] ? shapeVolumeMm3(form.shape[i]) : 0), 0) / 1000;
  const moldMl = ((W + 2 * m) * (D + 2 * m) * (H + m) / 1000);
  const silicone = Math.ceil((moldMl - partMl) * 1.1);
  const resin = Math.ceil(partMl * 1.1);
  return `# ${region.name} · 레진 주형 계획

완성품 도형 기준 계산이에요. 속이 빈 모양이면 레진 양은 더 적어요.

| 항목 | 값 |
|---|---|
| 원형(마스터) 크기 | ${W.toFixed(1)} × ${D.toFixed(1)} × ${H.toFixed(1)} mm |
| 몰드 상자 안쪽 | ${(W + 2 * m).toFixed(1)} × ${(D + 2 * m).toFixed(1)} × ${(H + m).toFixed(1)} mm (사방 ${m}mm 여유) |
| 실리콘 (약) | ${silicone} ml |
| 레진 (약, 꽉 찬 경우) | ${resin} ml |

## 순서
1. 원형 만들기: 같이 받은 STL을 3D 프린트하거나 점토로 빚어요. 표면을 사포(400→800방)로 다듬어요. 원형 표면이 그대로 찍혀요.
2. 몰드 상자: 폼보드·레고로 위 크기의 상자를 만들고 원형을 바닥에 글루건으로 고정해요.
3. 실리콘: A·B를 무게 비율대로 섞고, 기포가 덜 생기게 한쪽 구석에서 가늘게 부어요. 경화 시간은 제품 설명을 따라요.
4. 탈형: 실리콘을 꺼내 원형을 빼요.
5. 레진: A·B를 정확히 계량해 천천히 섞고, 기포는 이쑤시개·토치(멀리서 짧게)로 빼요. 붓고 경화 시간까지 건드리지 않아요.
6. 마감: 꺼낸 뒤 버를 칼·사포로 다듬어요.

## 안전
- 장갑·환기는 꼭. 덜 굳은 레진이 피부에 닿으면 비누로 바로 씻어요.
- 피부에 닿는 물건이면 완전 경화(제품 설명의 시간 이상) 뒤에 써요.

${region.process.length ? `## 대장 메모\n${region.process.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n` : ""}`;
}

/** 작업대에서 내려받을 하우징 파일들 */
export function housingFiles(project: LocalProject): Array<{ id: string; filename: string; mimeType: string; content: string; regionId: string; kind: HousingRegion["outputs"][number]["kind"] }> {
  const plan = project.housing, form = project.productForm;
  if (!plan || !form) return [];
  const stem = project.name.replace(/[\\/:*?"<>|]/g, "").slice(0, 40) || "dalgeurak";
  const out: ReturnType<typeof housingFiles> = [];
  for (const r of plan.regions) {
    const kinds = generatedKinds(r.method);
    if (kinds.includes("stl")) out.push({ id: `housing:${r.id}:stl`, filename: `${stem}-${r.name}.stl`, mimeType: "model/stl", content: regionStl(r, form), regionId: r.id, kind: "stl" });
    if (kinds.includes("dxf_unfold")) { const svg = ppUnfoldSvg(r, form); if (svg) out.push({ id: `housing:${r.id}:unfold`, filename: `${stem}-${r.name}-PP전개도.svg`, mimeType: "image/svg+xml", content: svg, regionId: r.id, kind: "dxf_unfold" }); }
    if (kinds.includes("svg_cut")) { const svg = laserPanelsSvg(r, form); if (svg) out.push({ id: `housing:${r.id}:cut`, filename: `${stem}-${r.name}-재단.svg`, mimeType: "image/svg+xml", content: svg, regionId: r.id, kind: "svg_cut" }); }
    if (kinds.includes("mold_plan")) { const md = moldPlanMd(r, form); if (md) out.push({ id: `housing:${r.id}:mold`, filename: `${stem}-${r.name}-주형계획.md`, mimeType: "text/markdown; charset=utf-8", content: md, regionId: r.id, kind: "mold_plan" }); }
  }
  return out;
}

export function housingMarkdown(project: LocalProject): string {
  const h = project.housing!;
  const env = h.environment;
  return `# ${project.name} · 하우징 제작 계획

${h.summary}

- 사용 환경: ${{ indoor: "실내", outdoor: "실외", both: "실내·실외" }[env.indoorOutdoor]} · 물: ${{ none: "없음", splash: "튀김", rain: "비", submerge: "잠김" }[env.water]}${env.skinContact ? " · 피부 접촉" : ""}${env.childUse ? " · 아이 사용" : ""}
- 합계: ${h.totals.costKRW == null ? "비용 확인 필요" : `${h.totals.costKRW.toLocaleString("ko-KR")}원`} · ${h.totals.timeHours == null ? "시간 확인 필요" : `${h.totals.timeHours}시간`}${h.totals.partial ? " (일부 미정)" : ""}
- 조립 순서: ${h.assemblyOrder.join(" → ")}

${h.regions.map((r) => `## ${FAB_ICON[r.method]} ${r.name} — ${FAB_LABEL[r.method]}

${r.role}. ${r.why}

- 재료: ${r.material.name}${r.material.thicknessMm != null ? ` ${r.material.thicknessMm}mm` : ""}${r.material.finish ? ` · 마감 ${r.material.finish}` : ""}
- 결합: ${r.join.map((j) => `${j.to}와 ${j.method} (${j.detail})`).join(" / ") || "없음"}
- 공차: ${r.toleranceMm ?? "확인 필요"}mm${r.access ? `\n- 여는 곳: ${r.access.purpose} — ${r.access.how}` : ""}
- 직접 할 수 있나: ${{ yes: "예", needs_service: "대행·메이커스페이스 필요", no: "어려움", unknown: "확인 필요" }[r.feasible]}
- 비용·시간: ${r.costKRW == null ? "확인 필요" : `${r.costKRW.toLocaleString("ko-KR")}원`} · ${r.timeHours ?? "?"}시간

${r.process.map((p, i) => `${i + 1}. ${p}`).join("\n")}
`).join("\n")}
${h.risks.length ? `## 확인할 위험\n${h.risks.map((x) => `- ${x}`).join("\n")}\n` : ""}`;
}
