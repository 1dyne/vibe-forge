// 정밀 목업: 하우징 부위와 실측 부품을 실제 치수의 도형으로 놓고, 서버가 겹침과 틈을 잰다.
//
// 완성품 미리보기(상자 몇 개)로는 "출력해 보니 안 맞는다"를 막지 못했다. 여기서는
// 하우징을 벽 단위로 나누고(속이 빈 상자는 바닥+벽 넷으로 풀린다), 부품은 여러 도형의
// 묶음으로 넣는다(보드 + 단자 + 헤더). 그러면 "USB 단자가 앞벽에 박힌다" 같은 것이
// 숫자로 잡힌다. 검사 결과는 도구 응답과 화면에 그대로 나가서, 달그락이 고치고 사람이
// 돌려 보며 따진다.
//
// 좌표계(mm): x 왼쪽(-)→오른쪽(+), y 뒤(-)→앞(+), z 바닥에서의 높이.
// 도형의 at은 "바닥 중심"이다(상자·원기둥 모두). 원기둥을 눕히면 at은 그 중심이다.

export type MockupSolid =
  /** radius: 세로 모서리를 둥글게(mm). 검사는 감싸는 상자로 하고, 출력 파일에서 실제로 둥글어진다 */
  | { shape: "box"; size: [number, number, number]; at: [number, number, number]; rotate?: 0 | 90 | 180 | 270; radius?: number }
  /** 속이 빈 상자: 바깥 크기, 벽 두께, 바닥 두께. 위는 열려 있다. 바닥과 벽 넷으로 풀어 검사한다 */
  | { shape: "hollowBox"; size: [number, number, number]; at: [number, number, number]; wall: number; floor: number; radius?: number;
      /** 벽에 뚫는 구멍(USB 단자 자리, 전선 구멍). offset은 벽 가운데에서 옆으로 떨어진 거리, bottom은 상자 바닥에서 구멍 아랫변까지 */
      openings?: Array<{ wall: "front" | "back" | "left" | "right"; offset: number; bottom: number; width: number; height: number }> }
  /** axis=z면 서 있는 원기둥(at=바닥 중심). x·y면 누운 원기둥(at=중심) */
  | { shape: "cylinder"; diameter: number; length: number; at: [number, number, number]; axis?: "x" | "y" | "z" }
  /** 나사 기둥: 서 있는 원기둥 가운데에 나사 구멍(위에서 depth만큼, 없으면 끝까지)이 뚫린다. at=바닥 중심 */
  | { shape: "standoff"; diameter: number; hole: number; height: number; depth?: number; at: [number, number, number] };

export type MockupPart = {
  id: string;
  name: string;
  /** housing = 만들어 낼 하우징 부위, measured = 실물 부품(실측·도면), keepout = 꽂거나 누를 때 비워 둬야 하는 공간 */
  group: "housing" | "measured" | "keepout";
  color?: string;
  /** 치수의 근거 */
  basis: "measured" | "datasheet" | "assumed" | "design";
  solids: MockupSolid[];
  /** 부품 도서관(부품 카드)의 id. 있으면 치수를 도서관 값과 견줘 다르면 알린다 */
  catalogId?: string;
  /** 이 부위에서 파내는 자리(나사 구멍, 창, 전선 길). 하우징에만 쓴다. 출력 파일에서 실제로 뚫린다 */
  cuts?: Array<Extract<MockupSolid, { shape: "box" | "cylinder" }>>;
  /** 분해해서 볼 때 움직일 방향과 거리(mm) */
  explode?: [number, number, number];
  note?: string;
};

export type MockupRule =
  /** 두 부품 사이의 틈이 axis 방향으로 min 이상(max 이하)이어야 한다. 예: 저울판과 몸통 사이 2mm */
  | { kind: "gap"; title: string; a: string; b: string; axis: "x" | "y" | "z"; min: number; max?: number }
  /** a가 b의 바깥 범위 안에 들어 있어야 한다 */
  | { kind: "inside"; title: string; a: string; b: string; margin?: number }
  /** 두 부품이 맞닿아 있어야 한다(떨어져 있거나 파고들면 실패) */
  | { kind: "touch"; title: string; a: string; b: string; tolerance?: number };

export type MockupSpec = {
  title: string;
  summary: string;
  parts: MockupPart[];
  /** 일부러 서로 끼워지는 쌍(헤더 핀과 소켓, 나사와 나사산). 겹침 검사에서 뺀다 */
  mates?: Array<[string, string]>;
  rules?: MockupRule[];
  updatedAt?: string;
};

export type MockupCheck = { id: string; kind: "overlap" | "gap" | "inside" | "touch"; title: string; pass: boolean; detail: string; parts: string[] };
export type MockupReport = { checks: MockupCheck[]; passed: number; total: number; failed: MockupCheck[]; warnings: string[]; bounds: { min: [number, number, number]; max: [number, number, number] } };

// ── 도형을 검사용 덩어리로 푼다 ──────────────────────────────────────────────

type Box = { type: "box"; min: [number, number, number]; max: [number, number, number] };
/** 서 있는 원기둥만 원으로 다룬다. 누운 원기둥은 감싸는 상자로 본다(조금 넉넉하게 잡힌다) */
type Cyl = { type: "cyl"; cx: number; cy: number; r: number; z0: number; z1: number; min: [number, number, number]; max: [number, number, number] };
type Prim = Box | Cyl;

const box = (cx: number, cy: number, z0: number, sx: number, sy: number, sz: number): Box => ({ type: "box", min: [cx - sx / 2, cy - sy / 2, z0], max: [cx + sx / 2, cy + sy / 2, z0 + sz] });

export function expand(solid: MockupSolid): Prim[] {
  if (solid.shape === "box") {
    const [x, y, z] = solid.size;
    const [sx, sy] = solid.rotate === 90 || solid.rotate === 270 ? [y, x] : [x, y];
    return [box(solid.at[0], solid.at[1], solid.at[2], sx, sy, z)];
  }
  if (solid.shape === "hollowBox") {
    const [x, y, z] = solid.size; const [cx, cy, z0] = solid.at; const { wall: w, floor: f } = solid;
    const walls: Record<"front" | "back" | "left" | "right", Box> = {
      front: box(cx, cy + y / 2 - w / 2, z0 + f, x, w, z - f),
      back: box(cx, cy - y / 2 + w / 2, z0 + f, x, w, z - f),
      left: box(cx - x / 2 + w / 2, cy, z0 + f, w, y - 2 * w, z - f),
      right: box(cx + x / 2 - w / 2, cy, z0 + f, w, y - 2 * w, z - f)
    };
    const out: Box[] = [box(cx, cy, z0, x, y, f)];
    for (const side of ["front", "back", "left", "right"] as const) {
      // 구멍이 있는 벽은 구멍 둘레의 조각들로 나눈다(왼쪽·오른쪽·아래·위).
      let pieces: Box[] = [walls[side]];
      const u = side === "front" || side === "back" ? 0 : 1; // 벽을 따라가는 축
      const mid = u === 0 ? cx : cy;
      for (const o of solid.openings?.filter((x) => x.wall === side) ?? []) {
        const [u0, u1, zb, zt] = [mid + o.offset - o.width / 2, mid + o.offset + o.width / 2, z0 + o.bottom, z0 + o.bottom + o.height];
        pieces = pieces.flatMap((p) => {
          if (u1 <= p.min[u] || u0 >= p.max[u] || zt <= p.min[2] || zb >= p.max[2]) return [p];
          const cut = (umin: number, umax: number, zmin: number, zmax: number): Box[] => {
            if (umax - umin < 1e-6 || zmax - zmin < 1e-6) return [];
            const min: [number, number, number] = [...p.min]; const max: [number, number, number] = [...p.max];
            min[u] = umin; max[u] = umax; min[2] = zmin; max[2] = zmax;
            return [{ type: "box", min, max }];
          };
          const [a, b] = [Math.max(u0, p.min[u]), Math.min(u1, p.max[u])];
          return [...cut(p.min[u], a, p.min[2], p.max[2]), ...cut(b, p.max[u], p.min[2], p.max[2]), ...cut(a, b, p.min[2], Math.max(zb, p.min[2])), ...cut(a, b, Math.min(zt, p.max[2]), p.max[2])];
        });
      }
      out.push(...pieces);
    }
    return out;
  }
  if (solid.shape === "standoff") { const r0 = solid.diameter / 2; const [x0, y0, z0] = solid.at; return [{ type: "cyl", cx: x0, cy: y0, r: r0, z0, z1: z0 + solid.height, min: [x0 - r0, y0 - r0, z0], max: [x0 + r0, y0 + r0, z0 + solid.height] }]; }
  const r = solid.diameter / 2; const [cx, cy, cz] = solid.at; const axis = solid.axis ?? "z";
  if (axis === "z") return [{ type: "cyl", cx, cy, r, z0: cz, z1: cz + solid.length, min: [cx - r, cy - r, cz], max: [cx + r, cy + r, cz + solid.length] }];
  const l = solid.length;
  return [axis === "x" ? { type: "box", min: [cx - l / 2, cy - r, cz - r], max: [cx + l / 2, cy + r, cz + r] } : { type: "box", min: [cx - r, cy - l / 2, cz - r], max: [cx + r, cy + l / 2, cz + r] }];
}

const round = (value: number) => Math.round(value * 100) / 100;
const mm = (value: number) => `${round(value)}mm`;

/** 두 덩어리가 서로 파고든 깊이(가장 얕은 축 기준). 0 이하면 겹치지 않는다 */
function penetration(a: Prim, b: Prim): number {
  const dz = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
  if (dz <= 0) return dz;
  if (a.type === "cyl" && b.type === "cyl") return Math.min(dz, a.r + b.r - Math.hypot(a.cx - b.cx, a.cy - b.cy));
  if (a.type === "cyl" || b.type === "cyl") {
    const c = (a.type === "cyl" ? a : b) as Cyl; const r = (a.type === "cyl" ? b : a) as Box;
    const nx = Math.max(r.min[0], Math.min(c.cx, r.max[0])); const ny = Math.max(r.min[1], Math.min(c.cy, r.max[1]));
    const d = Math.hypot(c.cx - nx, c.cy - ny);
    // 원의 중심이 상자 안에 있으면 가장 가까운 변까지의 거리만큼 더 파고든 것이다.
    const inside = d === 0 ? Math.min(c.cx - r.min[0], r.max[0] - c.cx, c.cy - r.min[1], r.max[1] - c.cy) : 0;
    return Math.min(dz, c.r - d + inside);
  }
  const dx = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
  const dy = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
  return Math.min(dx, dy, dz);
}

function boundsOf(prims: Prim[]): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]; const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) for (const i of [0, 1, 2]) { min[i] = Math.min(min[i], p.min[i]); max[i] = Math.max(max[i], p.max[i]); }
  return { min, max };
}

export const TOUCH_MM = 0.05;

/** 서버가 재는 것 전부. 순서는 실패한 것 먼저가 아니라 선언한 순서 그대로다(화면에서 번호가 흔들리지 않게). */
export function checkMockup(spec: MockupSpec): MockupReport {
  const prims = new Map(spec.parts.map((part) => [part.id, part.solids.flatMap(expand)]));
  const name = (id: string) => spec.parts.find((p) => p.id === id)?.name ?? id;
  const mated = new Set((spec.mates ?? []).map(([a, b]) => [a, b].sort().join("|")));
  const checks: MockupCheck[] = [];
  const warnings: string[] = [];

  // 1. 겹침: 끼워지는 쌍과 비움 공간끼리를 빼고, 모든 쌍을 잰다.
  for (let i = 0; i < spec.parts.length; i++) {
    for (let j = i + 1; j < spec.parts.length; j++) {
      const [a, b] = [spec.parts[i], spec.parts[j]];
      if (mated.has([a.id, b.id].sort().join("|"))) continue;
      if (a.group === "keepout" && b.group === "keepout") continue;
      let worst = -Infinity;
      for (const pa of prims.get(a.id)!) for (const pb of prims.get(b.id)!) worst = Math.max(worst, penetration(pa, pb));
      const pass = worst <= TOUCH_MM;
      const keep = a.group === "keepout" || b.group === "keepout";
      checks.push({ id: `overlap:${a.id}:${b.id}`, kind: "overlap", title: `${a.name} ↔ ${b.name}`, pass, parts: [a.id, b.id], detail: pass ? (worst > -TOUCH_MM ? "맞닿음" : `${mm(-worst)} 떨어짐`) : keep ? `비워 둬야 할 자리를 ${mm(worst)} 침범` : `${mm(worst)} 겹침` });
    }
  }

  // 2. 선언한 규칙
  (spec.rules ?? []).forEach((rule, index) => {
    const pa = prims.get(rule.a); const pb = prims.get(rule.b);
    const id = `${rule.kind}:${index}`;
    if (!pa?.length || !pb?.length) { checks.push({ id, kind: rule.kind, title: rule.title, pass: false, parts: [rule.a, rule.b], detail: `부품을 찾을 수 없어요 (${!pa?.length ? rule.a : rule.b})` }); return; }
    const A = boundsOf(pa); const B = boundsOf(pb);
    if (rule.kind === "gap") {
      const i = { x: 0, y: 1, z: 2 }[rule.axis];
      const gap = Math.max(B.min[i] - A.max[i], A.min[i] - B.max[i]);
      const pass = gap >= rule.min - 1e-6 && (rule.max == null || gap <= rule.max + 1e-6);
      checks.push({ id, kind: "gap", title: rule.title, pass, parts: [rule.a, rule.b], detail: `틈 ${mm(gap)} (필요 ${rule.min}${rule.max != null ? `~${rule.max}` : " 이상"}mm)${gap < 0 ? " · 서로 겹쳐 있어요" : ""}` });
    } else if (rule.kind === "inside") {
      const margin = rule.margin ?? 0;
      const out = Math.max(...[0, 1, 2].map((i) => Math.max(B.min[i] + margin - A.min[i], A.max[i] - (B.max[i] - margin))));
      checks.push({ id, kind: "inside", title: rule.title, pass: out <= 1e-6, parts: [rule.a, rule.b], detail: out <= 1e-6 ? `${name(rule.b)} 안에 들어 있어요` : `${mm(out)} 밖으로 나가요` });
    } else {
      const tolerance = rule.tolerance ?? 0.2;
      let worst = -Infinity;
      for (const x of pa) for (const y of pb) worst = Math.max(worst, penetration(x, y));
      const pass = Math.abs(worst) <= tolerance;
      checks.push({ id, kind: "touch", title: rule.title, pass, parts: [rule.a, rule.b], detail: pass ? "맞닿아 있어요" : worst > 0 ? `${mm(worst)} 파고들어요` : `${mm(-worst)} 떨어져 있어요` });
    }
  });

  for (const part of spec.parts) if (part.group === "measured" && part.basis === "assumed") warnings.push(`${part.name}: 치수가 추정값이에요. 출력 전에 실물을 재서 확인해야 해요.`);
  if (!spec.parts.some((p) => p.group === "measured")) warnings.push("실물 부품이 하나도 없어요. 하우징 안에 들어갈 부품을 실측 치수로 넣어야 맞는지 볼 수 있어요.");
  const failed = checks.filter((c) => !c.pass);
  return { checks, passed: checks.length - failed.length, total: checks.length, failed, warnings, bounds: boundsOf([...prims.values()].flat()) };
}

/** 달그락에게 돌려주는 요약. 실패한 것을 먼저, 구체적인 숫자와 함께. */
export function mockupBrief(spec: MockupSpec, report: MockupReport): string {
  const size = [0, 1, 2].map((i) => round(report.bounds.max[i] - report.bounds.min[i]));
  const lines = [`검사 ${report.passed} / ${report.total} 통과 · 전체 크기 ${size[0]}×${size[1]}×${size[2]}mm · 부품 ${spec.parts.length}개`];
  if (report.failed.length) lines.push("고쳐야 할 것:", ...report.failed.slice(0, 20).map((c) => `- ${c.title}: ${c.detail}`));
  if (report.failed.length > 20) lines.push(`- … 그 밖에 ${report.failed.length - 20}개`);
  if (report.warnings.length) lines.push("확인할 것:", ...report.warnings.map((w) => `- ${w}`));
  return lines.join("\n");
}
