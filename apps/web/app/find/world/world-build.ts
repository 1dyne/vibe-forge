import type * as T from "three";
import type { Decor, RoofId } from "../../../lib/find/decor";
import type { LanternGroup } from "../../../lib/find/lantern";
import { buildEras, eraCenter, eraTint, ERA_R, ERA_RADIUS, ERAS } from "./world-eras";

// 도깨비 마을 3D 세계. 하회마을처럼 물이 감싸 도는 땅에 다섯 마을이 앉고, 한가운데 호수 섬에 본관 대장간이 있다.
// 고증 원칙(docs/FIND-WORLD.md): 조선 민가 문법(초가·기와·흙벽·창호·장승·솟대), 단청·오니·청사초롱 가로등 없음.
// 빛은 두 가지: 사람의 불빛(창호지 창·초롱·화톳불, 따뜻한 주황)과 도깨비불(청록·연보라, 서늘함).

export type WorldHouse = { id: string; nickname: string; theme: string; alleySeq: number; plotNo: number; color: string; peak: number; fuel: number; wants: number; lit: boolean; stage: 1 | 2 | 3; fires: number; active: boolean; recent: boolean; decor: Decor };
export type WorldVillage = { id: string; name: string; topics: string; mood: string; themes: string[] };
export type Spot = { x: number; z: number; r: number; kind: "house" | "hall" | "plot" | "rope" | "npc"; house?: WorldHouse; village?: string; group?: string; label: string; line?: string };
export type NameTag = { s: T.Sprite; x: number; z: number; always: boolean };
export type Phase = "dusk" | "night";

/** 시간대별 하늘·안개·빛. 기본은 늘 해 질 녘(각색), 실제 밤(19~5시)엔 밤 */
export const PALETTE: Record<Phase, { top: string; mid: string; hor: string; fog: string; near: number; far: number; hemi: [string, string, number]; sun: [string, number] }> = {
  dusk: { top: "#2B2D55", mid: "#7A6496", hor: "#F0B184", fog: "#B49198", near: 45, far: 135, hemi: ["#E4D2EE", "#8A7E5E", 1.45], sun: ["#FFC08A", 1.35] },
  night: { top: "#0C1030", mid: "#232B55", hor: "#4A4678", fog: "#363A66", near: 38, far: 120, hemi: ["#A6B4E8", "#3A4466", 1.05], sun: ["#C9D3FF", 0.6] }
};

type VStyle = { grass: string; path: string; roof: RoofId; wall: string; wood: string; flower: string[] };
const STYLE: Record<string, VStyle> = {
  kkomul: { grass: "#8FA878", path: "#C8AE86", roof: "thatch", wall: "#D9C9A8", wood: "#6E5236", flower: ["#F4F1E8", "#F6E7A8"] },
  ttukttak: { grass: "#93A276", path: "#B9A07E", roof: "giwa-gray", wall: "#CDBB9A", wood: "#5E4430", flower: ["#F4F1E8"] },
  jjaekkak: { grass: "#879E80", path: "#BCA98C", roof: "giwa", wall: "#E2D6BC", wood: "#4E3A2A", flower: ["#F2C14E", "#F4F1E8"] },
  wagle: { grass: "#97AC77", path: "#CDB48A", roof: "neowa", wall: "#D6C6A4", wood: "#6E5236", flower: ["#F4F1E8", "#F2D16B"] },
  kkambbak: { grass: "#7F9E86", path: "#B7A68A", roof: "reed", wall: "#D2C4A6", wood: "#5A4636", flower: ["#E8E2F2"] }
};
const ROOF_COLOR: Record<RoofId, string> = { thatch: "#B79E70", reed: "#C9B993", giwa: "#3E3C42", "giwa-gray": "#6D6B70", neowa: "#7A6A58" };
const INK = "#1E1A26";      // 먹선
const AMBER = "#F2A65A";    // 사람의 불빛
const WISP = ["#7FE0D2", "#B9A3E3"]; // 도깨비불

export const ISLAND_R = 114;
const VILLAGE_D = 46;
const PLAZA_R = 10.5;       // 호수 섬(본관 광장)
const LAKE_IN = 11.5, LAKE_OUT = 20.5;
const LOOP_R = 8;
const RINGS = [12.5, 18.5];
const SLOT = 4.9;
// 마을 방향(라디안, 0 = 북쪽 -z). 남쪽 다리 앞에서 출발하면 본관 섬 너머로 두 마을이 보인다.
const ANGLES = [-0.63, 0.63, 1.88, Math.PI, -1.88];

export function villageCenter(i: number) {
  const a = ANGLES[i];
  return { x: Math.sin(a) * VILLAGE_D, z: -Math.cos(a) * VILLAGE_D, a };
}
/** 걷기 시작 자리: 남쪽 다리 바깥 끝 */
export const START = { x: 0, z: LAKE_OUT + 3 };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashOf = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp01(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function buildWorld(three: typeof T, scene: T.Scene, opts: { houses: WorldHouse[]; villages: WorldVillage[]; hallStage: number; hallPct: number; myForgeId: string | null; hasForge: boolean; phase?: Phase; lanterns?: LanternGroup[]; giwa?: number }) {
  const phase: Phase = opts.phase ?? "dusk";
  const night = phase === "night";
  const pal = PALETTE[phase];
  const player = { x: 0, z: 0 };
  const { houses, villages, hallStage, hallPct, myForgeId } = opts;
  const spots: Spot[] = [];
  const solids: Array<{ x: number; z: number; r: number }> = [];
  const anim: Array<(t: number, dt: number) => void> = [];
  const nameTags: NameTag[] = [];
  const fades: Array<{ x: number; z: number; mats: T.Material[] }> = [];
  const occluders: T.Object3D[] = [];
  /** 소리용: 불 소리가 나는 자리(화덕·화톳불·대장간) */
  const firePoints: Array<{ x: number; z: number; loud: number }> = [];
  const wispSpots: Array<{ x: number; z: number }> = [];
  const movingWisps: Array<{ x: number; z: number }> = [];
  const centers = villages.map((_, i) => villageCenter(i));
  const marsh = (() => {
    const i = villages.findIndex((v) => v.id === "kkambbak");
    if (i < 0) return null;
    const c = centers[i];
    return { x: c.x + Math.sin(c.a) * 3 + Math.cos(c.a) * 21, z: c.z - Math.cos(c.a) * 3 + Math.sin(c.a) * 21, r: 5.2 };
  })();

  // ── 공용 재료·모양 ──
  const mats = new Map<string, T.Material>();
  const mat = (color: string, o: { emissive?: string; ei?: number; opacity?: number; flat?: boolean; side?: boolean } = {}) => {
    const key = JSON.stringify([color, o]);
    let m = mats.get(key);
    if (!m) {
      m = new three.MeshStandardMaterial({ color, roughness: 0.9, flatShading: o.flat ?? true, emissive: o.emissive ?? "#000000", emissiveIntensity: o.ei ?? 0, transparent: o.opacity !== undefined, opacity: o.opacity ?? 1, side: o.side ? three.DoubleSide : three.FrontSide });
      mats.set(key, m);
    }
    return m;
  };
  const inkMat = new three.MeshBasicMaterial({ color: INK, side: three.BackSide });
  const geos = new Map<string, T.BufferGeometry>();
  const geo = (key: string, make: () => T.BufferGeometry) => { let g = geos.get(key); if (!g) { g = make(); geos.set(key, g); } return g; };
  const BOX = geo("box", () => new three.BoxGeometry(1, 1, 1));
  const CYL = geo("cyl", () => new three.CylinderGeometry(1, 1, 1, 10));
  const CYL6 = geo("cyl6", () => new three.CylinderGeometry(1, 1, 1, 6));
  const BALL = geo("ball", () => new three.IcosahedronGeometry(1, 1));
  const CONE = geo("cone", () => new three.ConeGeometry(1, 1, 7));
  const DOME = geo("dome", () => new three.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2));
  const DISC = geo("disc", () => { const g = new three.CircleGeometry(1, 20); g.rotateX(-Math.PI / 2); return g; });
  const TORUS = geo("torus", () => new three.TorusGeometry(1, 0.12, 6, 18));

  function part(g: T.BufferGeometry, m: T.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, parent?: T.Object3D) {
    const mesh = new three.Mesh(g, m);
    mesh.scale.set(sx, sy, sz); mesh.position.set(x, y, z);
    (parent ?? scene).add(mesh);
    return mesh;
  }
  /** 민화풍 먹선: 뒷면을 조금 부풀려 먹색으로 그린다 (지붕·장승·랜드마크에만) */
  function ink(mesh: T.Mesh, k = 1.06) {
    const o = new three.Mesh(mesh.geometry, inkMat);
    o.position.copy(mesh.position); o.rotation.copy(mesh.rotation); o.scale.copy(mesh.scale).multiplyScalar(k);
    mesh.parent?.add(o);
    return o;
  }

  // 빛 번짐(블룸 대신 가벼운 스프라이트)
  const glowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d")!; const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new three.CanvasTexture(c); t.colorSpace = three.SRGBColorSpace; return t;
  })();
  function glow(color: string, size: number, x: number, y: number, z: number, opacity = 0.8, parent?: T.Object3D) {
    const s = new three.Sprite(new three.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: three.AdditiveBlending }));
    s.scale.set(size, size, 1); s.position.set(x, y, z);
    (parent ?? scene).add(s);
    return s;
  }

  function textSprite(text: string, o: { bg?: string; fg?: string; size?: number; scale?: number } = {}) {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    const size = o.size ?? 44;
    ctx.font = `${size}px Jua, sans-serif`;
    c.width = Math.ceil(ctx.measureText(text).width) + size; c.height = Math.ceil(size * 1.7);
    ctx.font = `${size}px Jua, sans-serif`;
    ctx.fillStyle = o.bg ?? "rgba(255,255,255,.93)";
    ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, c.height / 2); ctx.fill();
    ctx.fillStyle = o.fg ?? "#1E1F24"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, c.width / 2, c.height / 2 + 2);
    const tex = new three.CanvasTexture(c); tex.colorSpace = three.SRGBColorSpace;
    const s = new three.Sprite(new three.SpriteMaterial({ map: tex, depthWrite: false }));
    const k = o.scale ?? 0.75;
    s.scale.set((c.width / c.height) * k, k, 1);
    return s;
  }
  /** 나무판에 먹 글씨 (마을 목패·빈 터 표지·소식판) */
  function woodBoard(text: string, w: number, h: number, font = 64) {
    const c = document.createElement("canvas");
    c.width = Math.round(w * 128); c.height = Math.round(h * 128);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#B8946A"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "rgba(90,60,30,.35)"; ctx.lineWidth = 2;
    for (let y = 8; y < c.height; y += 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(c.width * 0.3, y + 4, c.width * 0.7, y - 4, c.width, y); ctx.stroke(); }
    ctx.fillStyle = "#2A2118"; ctx.font = `${font}px "Gowun Batang", Jua, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, c.width / 2, c.height / 2 + 4);
    const tex = new three.CanvasTexture(c); tex.colorSpace = three.SRGBColorSpace;
    return new three.Mesh(new three.PlaneGeometry(w, h), new three.MeshStandardMaterial({ map: tex, roughness: 1, side: three.DoubleSide }));
  }

  // ── 지붕: 기와(팔작 비슷하게 처마 끝이 들림) / 초가(둥근 짚 지붕) ──
  function tileRoofGeo(w: number, d: number, h: number, lift: number) {
    const hx = w / 2, hz = d / 2, rx = hx * 0.55;
    const F = [[-hx, lift, hz], [-hx / 3, 0, hz], [hx / 3, 0, hz], [hx, lift, hz]];
    const B = F.map(([x, y, z]) => [x, y, -z]);
    const R = [[-rx, h, 0], [-rx / 3, h * 0.97, 0], [rx / 3, h * 0.97, 0], [rx, h, 0]];
    const p: number[] = []; const tri = (a: number[], b: number[], c: number[]) => p.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) { tri(F[i], F[i + 1], R[i + 1]); tri(F[i], R[i + 1], R[i]); tri(B[i + 1], B[i], R[i]); tri(B[i + 1], R[i], R[i + 1]); }
    tri(B[0], F[0], R[0]); tri(F[3], B[3], R[3]);
    const g = new three.BufferGeometry(); g.setAttribute("position", new three.Float32BufferAttribute(p, 3)); g.computeVertexNormals();
    return g;
  }
  function roof(g: T.Group, kind: RoofId, w: number, d: number, y: number, rnd: () => number, outline = true) {
    const color = new three.Color(ROOF_COLOR[kind]).offsetHSL(0, 0, (rnd() - 0.5) * 0.05).getStyle();
    if (kind === "thatch" || kind === "reed") {
      // 낮고 넓게 덮은 이엉 + 용마름(꼭대기 짚)
      const m = part(DOME, mat(color), w / 2 + 0.5, 0.62 + w * 0.08, d / 2 + 0.45, 0, y - 0.12, 0, g);
      if (outline) ink(m, 1.05);
      part(CYL6, mat(new three.Color(color).offsetHSL(0, 0, -0.08).getStyle()), 0.12, w * 0.75, 0.12, 0, y + 0.55 + w * 0.06, 0, g).rotation.z = Math.PI / 2;
      part(TORUS, mat("#6B5638"), w / 2 + 0.42, d / 2 + 0.38, 0.5, 0, y + 0.08, 0, g).rotation.x = Math.PI / 2;
      return m;
    }
    const key = `tile-${w.toFixed(2)}-${d.toFixed(2)}-${kind}`;
    const rg = geo(key, () => tileRoofGeo(w + 0.9, d + 0.8, kind === "neowa" ? 1.0 : 1.25, kind === "neowa" ? 0.08 : 0.3));
    const m = part(rg, mat(color, { side: true }), 1, 1, 1, 0, y, 0, g);
    if (outline) ink(m, 1.04);
    if (kind !== "neowa") { const ridge = part(BOX, mat("#2C2A30"), (w + 0.9) * 0.55 + 0.4, 0.16, 0.22, 0, y + 1.25, 0, g); ridge.position.y = y + 1.22; }
    else for (let i = 0; i < 4; i++) part(BOX, mat("#4E4438"), 0.12, 0.12, 0.12, (i - 1.5) * 0.5, y + 0.95, (i % 2 ? 0.25 : -0.25), g); // 너와 누름돌
    return m;
  }

  // ── 땅: 물돌이 땅 + 가운데 호수 + 길 ──
  const spokes = centers.map((c) => ({ ax: Math.sin(c.a) * (PLAZA_R - 1), az: -Math.cos(c.a) * (PLAZA_R - 1), bx: Math.sin(c.a) * (VILLAGE_D - LOOP_R), bz: -Math.cos(c.a) * (VILLAGE_D - LOOP_R) }));
  const outerLoop = villages.map((v) => houses.filter((h) => v.themes.includes(h.theme)).length > ringCapacity(RINGS[0]));
  const bumps: Array<[number, number, number, number]> = [];
  ANGLES.forEach((a) => {
    const b = a + 0.63;
    bumps.push([Math.sin(b) * 52, -Math.cos(b) * 52, 3.4, 6.5]);
    bumps.push([Math.sin(a) * 74, -Math.cos(a) * 74, 4.4, 9]);
    bumps.push([Math.sin(a + 0.3) * 64, -Math.cos(a + 0.3) * 64, 2.4, 5]);
  });
  const lakeMid = (LAKE_IN + LAKE_OUT) / 2, lakeHalf = (LAKE_OUT - LAKE_IN) / 2;
  const onBridge = (x: number, z: number) => { const r = Math.hypot(x, z); return r > LAKE_IN - 1.2 && r < LAKE_OUT + 1.2 && spokes.some((s) => segDist(x, z, 0, 0, s.bx, s.bz) < 0.95); };
  const inLake = (x: number, z: number) => Math.abs(Math.hypot(x, z) - lakeMid) < lakeHalf;

  // 시대 마을로 가는 길(호숫가 → 시대 마을 입구)
  const eraSpokes = ERAS.map((e) => ({ ax: Math.sin(e.angle) * (LAKE_OUT + 0.5), az: -Math.cos(e.angle) * (LAKE_OUT + 0.5), bx: Math.sin(e.angle) * (ERA_R - ERA_RADIUS + 1), bz: -Math.cos(e.angle) * (ERA_R - ERA_RADIUS + 1) }));
  const eraCenters = ERAS.map((e) => eraCenter(e));
  function builtDist(x: number, z: number) {
    let d = Math.hypot(x, z) - LAKE_OUT - 2;
    for (const s of spokes) d = Math.min(d, segDist(x, z, s.ax, s.az, s.bx, s.bz) - 2.5);
    for (const c of centers) d = Math.min(d, Math.hypot(x - c.x, z - c.z) - 22);
    for (const s of eraSpokes) d = Math.min(d, segDist(x, z, s.ax, s.az, s.bx, s.bz) - 2.2);
    for (const c of eraCenters) d = Math.min(d, Math.hypot(x - c.x, z - c.z) - ERA_RADIUS - 2);
    return d;
  }
  /** 땅 높이 (지형 메시용) */
  function groundAt(x: number, z: number) {
    const free = clamp01(builtDist(x, z) / 5);
    let h = 0;
    if (free > 0) {
      for (const [bx, bz, amp, sig] of bumps) h += amp * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (2 * sig * sig));
      h += 0.35 * Math.sin(x * 0.21) * Math.cos(z * 0.17);
      h *= free;
    }
    const lr = Math.abs(Math.hypot(x, z) - lakeMid);
    if (lr < lakeHalf + 1.6) h -= 1.4 * (1 - clamp01((lr - lakeHalf + 0.9) / 2.5));
    if (marsh) { const d = Math.hypot(x - marsh.x, z - marsh.z); if (d < marsh.r + 2) h -= 1.3 * (1 - clamp01((d - marsh.r + 1.2) / 3)); }
    const r = Math.hypot(x, z);
    if (r > ISLAND_R - 10) h -= ((r - (ISLAND_R - 10)) / 10) ** 2 * 2.6;
    return h;
  }
  /** 걷는 높이 (다리 위면 다리 판 높이) */
  function heightAt(x: number, z: number) {
    if (onBridge(x, z) && Math.abs(Math.hypot(x, z) - lakeMid) < lakeHalf + 1.2) return 0.22;
    return groundAt(x, z);
  }
  function pathMix(x: number, z: number): { color: string; w: number } | null {
    const r = Math.hypot(x, z);
    let best: { color: string; w: number } | null = null;
    const take = (color: string, w: number) => { if (w > 0 && (!best || w > best.w)) best = { color, w: Math.min(1, w) }; };
    take(r > 4.6 && r < 6.6 ? "#BFA67E" : "#CDB894", (PLAZA_R - r) / 0.8);
    for (let i = 0; i < centers.length; i++) {
      const st = STYLE[villages[i].id];
      const s = spokes[i];
      if (r > LAKE_OUT - 0.5) take(st.path, (1.6 - segDist(x, z, s.ax, s.az, s.bx, s.bz)) / 0.7);
      const dc = Math.hypot(x - centers[i].x, z - centers[i].z);
      take(st.path, (1.4 - Math.abs(dc - LOOP_R)) / 0.7);
      if (outerLoop[i]) take(st.path, (1.2 - Math.abs(dc - (RINGS[0] + RINGS[1]) / 2)) / 0.7);
    }
    eraSpokes.forEach((s, i) => take(ERAS[i].alley ?? "#8A7556", (1.4 - segDist(x, z, s.ax, s.az, s.bx, s.bz)) / 0.7));
    return best;
  }
  function pathAt(x: number, z: number) { const p = pathMix(x, z); return p && p.w > 0.3 ? p.color : null; }

  {
    const SIZE = ISLAND_R * 2 + 6, SEG = 270;
    const g = new three.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as T.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const tmp = new three.Color(), acc = new three.Color();
    const grassCols = villages.map((v) => new three.Color(STYLE[v.id].grass));
    const plaza = new three.Color("#8FA67A"), bank = new three.Color("#B8A47E"), mud = new three.Color("#6E6450"), sand = new three.Color("#CDBB92");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = groundAt(x, z);
      pos.setY(i, h);
      const r = Math.hypot(x, z);
      let wsum = Math.exp(-((r / 18) ** 2)) * 0.7;
      acc.copy(plaza).multiplyScalar(wsum);
      centers.forEach((c, k) => { const w = Math.exp(-(((x - c.x) ** 2 + (z - c.z) ** 2) / (2 * 15 * 15))); wsum += w; acc.add(tmp.copy(grassCols[k]).multiplyScalar(w)); });
      acc.multiplyScalar(1 / Math.max(wsum, 1e-4));
      const p = pathMix(x, z);
      if (p) acc.lerp(tmp.set(p.color), 0.9 * p.w);
      if (h > 1.2) acc.lerp(tmp.set("#7F9A6E"), clamp01((h - 1.2) / 3) * 0.5);
      const lr = Math.abs(r - lakeMid);
      if (lr < lakeHalf + 1.8) acc.lerp(bank, clamp01((lakeHalf + 1.8 - lr) / 1.4));
      if (h < -0.4) acc.lerp(mud, 0.85);
      const et = eraTint(x, z);
      if (et) acc.lerp(tmp.set(et.color), 0.92 * et.w);
      if (r > ISLAND_R - 11) acc.lerp(sand, clamp01((r - (ISLAND_R - 11)) / 3));
      const n = (Math.sin(x * 1.7 + z * 0.9) + Math.sin(z * 2.3 - x * 0.4)) * 0.014;
      colors[i * 3] = acc.r + n; colors[i * 3 + 1] = acc.g + n; colors[i * 3 + 2] = acc.b + n;
    }
    g.setAttribute("color", new three.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    scene.add(new three.Mesh(g, new three.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })));
  }

  // ── 하늘·달 ──
  {
    const sky = new three.Mesh(new three.SphereGeometry(260, 32, 16), new three.ShaderMaterial({
      side: three.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new three.Color(pal.top) }, mid: { value: new three.Color(pal.mid) }, hor: { value: new three.Color(pal.hor) } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = mix(hor, mid, smoothstep(-0.02, 0.22, h)); c = mix(c, top, smoothstep(0.22, 0.75, h));
          float west = max(0.0, dot(normalize(vec3(vP.x, 0.0, vP.z)), normalize(vec3(-0.8, 0.0, -0.6))));
          c += vec3(0.35, 0.18, 0.05) * pow(west, 6.0) * (1.0 - smoothstep(0.0, 0.3, abs(h)));
          gl_FragColor = vec4(c, 1.0); }`
    }));
    sky.renderOrder = -1; sky.name = "sky"; scene.add(sky);
    // 초승달 (신윤복 「월하정인」의 밤처럼)
    const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d")!;
    x.fillStyle = "#FFF4D6"; x.beginPath(); x.arc(64, 64, 46, 0, 6.283); x.fill();
    x.globalCompositeOperation = "destination-out"; x.beginPath(); x.arc(84, 54, 44, 0, 6.283); x.fill();
    const mt = new three.CanvasTexture(c); mt.colorSpace = three.SRGBColorSpace;
    const moon = new three.Sprite(new three.SpriteMaterial({ map: mt, transparent: true, fog: false, depthWrite: false }));
    moon.scale.set(14, 14, 1); moon.position.set(-130, night ? 95 : 55, -150); scene.add(moon);
    glow("#FFE9C2", 34, -130, night ? 95 : 55, -151, night ? 0.35 : 0.22).material.fog = false;
    if (night) {
      const sg = new three.BufferGeometry(); const pts: number[] = [];
      const rr = rng(33); for (let i = 0; i < 600; i++) { const a = rr() * Math.PI * 2, e = 0.12 + rr() * 1.3, R = 220; pts.push(Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R, Math.sin(a) * Math.cos(e) * R); }
      sg.setAttribute("position", new three.Float32BufferAttribute(pts, 3));
      scene.add(new three.Points(sg, new three.PointsMaterial({ color: "#FFFFFF", size: 1.4, sizeAttenuation: false, fog: false })));
    }
  }

  // ── 호수: 하늘빛이 비치는 물 + 물안개 + 섶다리 ──
  const waterUniforms = { uTime: { value: 0 }, uDeep: { value: new three.Color(night ? "#0E1430" : "#26305A") }, uSky: { value: new three.Color(night ? "#3A3A66" : "#C9A0A0") }, uGlow: { value: new three.Color(AMBER) } };
  const waterMat = new three.ShaderMaterial({
    uniforms: waterUniforms, transparent: false, fog: false,
    vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `uniform float uTime; uniform vec3 uDeep; uniform vec3 uSky; uniform vec3 uGlow; varying vec3 vW;
      void main(){ vec3 V = normalize(cameraPosition - vW); float fres = pow(1.0 - max(V.y, 0.0), 2.4);
        float rip = sin(vW.x * 1.7 + uTime * 0.7) * sin(vW.z * 1.3 - uTime * 0.55);
        vec3 c = mix(uDeep, uSky, clamp(fres * 0.85 + rip * 0.05, 0.0, 1.0));
        float sp = smoothstep(0.996, 1.0, sin(vW.x * 2.6 + sin(vW.z * 1.7 + uTime * 0.6) * 1.8 + uTime * 0.9));
        c += uGlow * sp * 0.07; gl_FragColor = vec4(c, 1.0); }`
  });
  anim.push((t) => { waterUniforms.uTime.value = t; });
  {
    const lake = new three.Mesh(new three.RingGeometry(LAKE_IN - 1.6, LAKE_OUT + 1.6, 96, 1), waterMat);
    lake.rotation.x = -Math.PI / 2; lake.position.y = -0.42; scene.add(lake);
    if (marsh) {
      const pond = new three.Mesh(new three.CircleGeometry(marsh.r + 0.6, 28), waterMat);
      pond.rotation.x = -Math.PI / 2; pond.position.set(marsh.x, -0.42, marsh.z); scene.add(pond);
      solids.push({ x: marsh.x, z: marsh.z, r: marsh.r + 0.4 });
      const rr = rng(77);
      for (let i = 0; i < 6; i++) { const a = rr() * 6.28, d = rr() * marsh.r * 0.8; part(DISC, mat("#4E7A56"), 0.45, 1, 0.45, marsh.x + Math.cos(a) * d, -0.38, marsh.z + Math.sin(a) * d); }
    }
    // 물안개: 호수 위를 천천히 도는 흐린 판
    const mc = document.createElement("canvas"); mc.width = 256; mc.height = 64; const mx = mc.getContext("2d")!;
    const mg = mx.createRadialGradient(128, 32, 4, 128, 32, 128); mg.addColorStop(0, "rgba(255,255,255,.55)"); mg.addColorStop(1, "rgba(255,255,255,0)");
    mx.fillStyle = mg; mx.fillRect(0, 0, 256, 64);
    const mtex = new three.CanvasTexture(mc);
    const mists = Array.from({ length: 7 }, (_, i) => {
      const s = new three.Sprite(new three.SpriteMaterial({ map: mtex, color: night ? "#8A93C8" : "#E9D6E2", transparent: true, opacity: 0.32, depthWrite: false }));
      s.scale.set(11, 2.4, 1); scene.add(s);
      return { s, a: (i / 7) * Math.PI * 2, sp: 0.012 + (i % 3) * 0.004 };
    });
    anim.push((t, dt) => mists.forEach((m, i) => { m.a += m.sp * dt; const r = lakeMid + Math.sin(t * 0.1 + i) * 1.5; m.s.position.set(Math.sin(m.a) * r, 0.5 + Math.sin(t * 0.3 + i) * 0.1, -Math.cos(m.a) * r); }));
    // 다리: 섶다리(Y자 기둥 + 솔가지 상판), 하나는 돌다리
    spokes.forEach((s, i) => {
      const a = Math.atan2(s.bx, -s.bz);
      const len = LAKE_OUT - LAKE_IN + 3.2;
      const g = new three.Group(); g.position.set(Math.sin(a) * lakeMid, 0, -Math.cos(a) * lakeMid); g.rotation.y = -a; scene.add(g);
      if (i === 2) {
        for (let k = 0; k < 12; k++) { const z = -len / 2 + (k + 0.5) * (len / 12); for (const sx of [-0.5, 0.05, 0.55]) part(BALL, mat(["#8C877C", "#7A766C", "#9A958A"][(k + Math.round(sx * 10)) % 3]), 0.42, 0.32, 0.36, sx + (k % 2) * 0.1, -0.05, z, g); }
        part(BOX, mat("#857F72"), 2.0, 0.12, len, 0, 0.12, 0, g);
      } else {
        part(BOX, mat("#8A7350"), 2.1, 0.14, len, 0, 0.12, 0, g);
        part(BOX, mat("#6E6A4C"), 2.0, 0.06, len - 0.2, 0, 0.22, 0, g); // 솔가지와 흙을 덮은 상판
        for (let k = 0; k < 14; k++) part(BOX, mat(k % 2 ? "#4E5E3E" : "#7A6A50"), 0.5, 0.04, 0.3, ((k * 37) % 10) / 6 - 0.8, 0.26, -len / 2 + 0.5 + k * ((len - 1) / 13), g); // 솔가지 뭉치
        for (let k = 0; k <= 4; k++) { const z = -len / 2 + 0.4 + k * ((len - 0.8) / 4); for (const sx of [-0.85, 0.85]) { part(CYL6, mat("#4E3A2A"), 0.08, 1.1, 0.08, sx, -0.45, z, g); const y = part(CYL6, mat("#4E3A2A"), 0.05, 0.4, 0.05, sx + Math.sign(sx) * 0.12, 0.0, z, g); y.rotation.z = Math.sign(sx) * 0.5; } }
      }
    });
  }

  // ── 소원 줄(하회 줄불처럼 호수를 가로지른 줄에 한지 초롱) + 이뤄진 소원은 호수에 띄운 유등 ──
  {
    const groups = (opts.lanterns ?? []).filter((g) => g.count > g.done).slice(0, 10);
    const gaps = ANGLES.map((a) => a).sort((a, b) => a - b);
    const ropeAngles: number[] = [];
    for (let k = 0; k < gaps.length; k++) { const a = gaps[k], b = k + 1 < gaps.length ? gaps[k + 1] : gaps[0] + Math.PI * 2; const mid = (a + b) / 2; ropeAngles.push(mid - 0.22, mid + 0.22); }
    const rnd = rng(41);
    groups.forEach((g, gi) => {
      const ang = ropeAngles[gi % ropeAngles.length];
      const ax = Math.sin(ang) * (LAKE_IN - 0.8), az = -Math.cos(ang) * (LAKE_IN - 0.8);
      const bx = Math.sin(ang) * (LAKE_OUT + 0.9), bz = -Math.cos(ang) * (LAKE_OUT + 0.9);
      const H = 3.4;
      for (const [px, pz] of [[ax, az], [bx, bz]]) { const pole = part(CYL6, mat("#5E4430"), 0.07, H, 0.07, px, groundAt(px, pz) + H / 2, pz); ink(pole, 1.25); solids.push({ x: px, z: pz, r: 0.25 }); }
      const pts: T.Vector3[] = []; const N = 16;
      const ya = groundAt(ax, az) + H, yb = groundAt(bx, bz) + H;
      for (let k = 0; k <= N; k++) { const t = k / N; pts.push(new three.Vector3(ax + (bx - ax) * t, ya + (yb - ya) * t - Math.sin(Math.PI * t) * 0.9, az + (bz - az) * t)); }
      scene.add(new three.Line(new three.BufferGeometry().setFromPoints(pts), new three.LineBasicMaterial({ color: "#C9B98F" })));
      const lit = g.lanterns.filter((l) => l.status === "lit");
      const n = Math.min(9, lit.length);
      for (let k = 0; k < n; k++) {
        const t = (k + 1) / (n + 1); const p = pts[Math.round(t * N)];
        const taken = lit[k].makers > 0;
        part(CYL6, mat("#8A7350"), 0.01, 0.35, 0.01, p.x, p.y - 0.17, p.z);
        const lan = part(CYL, mat("#F3E7C9", { emissive: taken ? "#FFD27A" : AMBER, ei: 0.95 }), 0.17, 0.36, 0.17, p.x, p.y - 0.55, p.z);
        if (taken) part(BOX, mat("#3E3530"), 0.12, 0.03, 0.03, p.x, p.y - 0.33, p.z + 0.17); // 망치 표시: 누가 만들어보는 중
        const gl = glow(AMBER, 1.8, p.x, p.y - 0.55, p.z, 0.75);
        const ph = rnd() * 6; anim.push((tt) => { lan.rotation.z = Math.sin(tt * 1.3 + ph) * 0.08; gl.material.opacity = 0.65 + Math.sin(tt * 4 + ph) * 0.1; });
      }
      // 줄 이름 (가까이 가면 보인다)
      const tag = textSprite(`소원 줄 · 등불 ${g.count - g.done}`, { bg: "#2A2118", fg: "#F3E7C9", size: 36, scale: 0.5 });
      tag.position.set(bx, yb + 0.6, bz); scene.add(tag);
      nameTags.push({ s: tag, x: bx, z: bz, always: false });
      spots.push({ x: bx, z: bz, r: 3, kind: "rope", group: g.key, label: g.label });
      spots.push({ x: ax, z: az, r: 3, kind: "rope", group: g.key, label: g.label });
      firePoints.push({ x: (ax + bx) / 2, z: (az + bz) / 2, loud: 0.15 });
    });
    // 이뤄진 소원: 호수를 천천히 도는 유등
    const done = (opts.lanterns ?? []).reduce((n, g) => n + g.done, 0);
    const floats = Array.from({ length: Math.min(40, done) }, (_, i) => {
      const m = new three.Group(); scene.add(m);
      part(CYL, mat("#F3E7C9", { emissive: "#FFD27A", ei: 1 }), 0.2, 0.28, 0.2, 0, 0.14, 0, m);
      part(BOX, mat("#6E5236"), 0.5, 0.06, 0.5, 0, 0, 0, m); // 나무 받침
      const gl = glow("#FFD27A", 1.6, 0, 0, 0, 0.7);
      return { m, gl, a: (i / Math.max(1, done)) * Math.PI * 2 + rnd() * 0.3, r: lakeMid + (rnd() - 0.5) * (lakeHalf * 1.2), sp: 0.01 + rnd() * 0.012 };
    });
    anim.push((tt, dt) => floats.forEach((f, i) => { f.a += f.sp * dt; const x = Math.sin(f.a) * f.r, z = -Math.cos(f.a) * f.r; const y = -0.2 + Math.sin(tt * 1.2 + i) * 0.04; f.m.position.set(x, y, z); f.gl.position.set(x, y + 0.1, z); }));
  }

  // ── 자연물 ──
  function tree(x: number, z: number, kind: "pine" | "zelkova" | "persimmon" | "ginkgo" | "willow" | "bamboo" | "bush", s = 1) {
    const y = groundAt(x, z);
    const g = new three.Group(); g.position.set(x, y, z); g.scale.setScalar(s); g.rotation.y = (x * 13 + z * 7) % 6.28; scene.add(g); occluders.push(g);
    if (kind === "bush") { part(BALL, mat("#5E7E58"), 0.9, 0.7, 0.9, 0, 0.5, 0, g); part(BALL, mat("#6A8A62"), 0.6, 0.5, 0.6, 0.6, 0.45, 0.3, g); return; }
    if (kind === "bamboo") { for (let i = 0; i < 6; i++) { const c = part(CYL6, mat("#7E9A5A"), 0.06, 3.2, 0.06, (i % 3 - 1) * 0.3, 1.6, (i > 2 ? 0.25 : -0.2), g); c.rotation.z = (i - 2.5) * 0.04; } part(CONE, mat("#5E8A4E"), 0.8, 1.4, 0.8, 0, 3.2, 0, g); solids.push({ x, z, r: 0.5 * s }); return; }
    if (kind === "pine") { // 붉은 줄기, 납작하게 층진 솔잎
      const tr = part(CYL6, mat("#8A4E3A"), 0.17, 2.2, 0.17, 0, 1.1, 0, g); tr.rotation.z = 0.12;
      part(BALL, mat("#3F6448"), 1.2, 0.45, 1.0, 0.25, 2.3, 0, g); part(BALL, mat("#4A7052"), 0.9, 0.38, 0.8, -0.3, 2.85, 0.15, g); part(BALL, mat("#3F6448"), 0.6, 0.3, 0.55, 0.1, 3.3, -0.1, g);
    } else if (kind === "ginkgo") { part(CYL6, mat("#6E5236"), 0.16, 1.4, 0.16, 0, 0.7, 0, g); part(CONE, mat("#E3B341"), 1.1, 2.4, 1.1, 0, 2.2, 0, g); }
    else if (kind === "willow") { // 물가 버드나무: 늘어진 가지
      part(CYL6, mat("#5E4A36"), 0.2, 1.8, 0.2, 0, 0.9, 0, g); part(BALL, mat("#7E9A5E"), 1.0, 0.6, 1.0, 0, 2.2, 0, g);
      for (let i = 0; i < 7; i++) { const q = (i / 7) * 6.283; part(CYL6, mat("#8AA66A"), 0.18, 1.6, 0.18, Math.cos(q) * 0.85, 1.4, Math.sin(q) * 0.85, g); }
    } else { // 느티나무·감나무
      part(CYL6, mat("#6E5236"), 0.2, 1.4, 0.2, 0, 0.7, 0, g);
      part(BALL, mat(kind === "persimmon" ? "#6E8A52" : "#5E7E58"), 1.25, 0.95, 1.25, 0, 2.0, 0, g);
      part(BALL, mat(kind === "persimmon" ? "#7A9658" : "#6A8A62"), 0.8, 0.65, 0.8, 0.5, 2.5, 0.2, g);
      if (kind === "persimmon") for (let i = 0; i < 7; i++) { const a = i * 0.9; part(BALL, mat("#E8893A", { emissive: "#7A3A10", ei: 0.25 }), 0.12, 0.12, 0.12, Math.cos(a) * 1.1, 1.75 + (i % 3) * 0.3, Math.sin(a) * 1.1, g); }
    }
    solids.push({ x, z, r: 0.55 * s });
  }
  function flowers(x: number, z: number, colors: string[], n = 6, spread = 0.9) {
    const r = rng(Math.round(x * 100 + z * 7));
    for (let i = 0; i < n; i++) {
      const fx = x + (r() - 0.5) * spread * 2, fz = z + (r() - 0.5) * spread * 2, y = groundAt(fx, fz);
      part(CYL6, mat("#5E7E4E"), 0.025, 0.3, 0.025, fx, y + 0.15, fz);
      part(BALL, mat(colors[i % colors.length]), 0.09, 0.07, 0.09, fx, y + 0.32, fz);
    }
  }
  function grassTuft(x: number, z: number, color: string, h = 0.6) {
    const y = groundAt(x, z);
    for (let i = 0; i < 4; i++) { const m = part(CONE, mat(color), 0.06, h, 0.06, x + (i % 2) * 0.12 - 0.06, y + h / 2, z + (i > 1 ? 0.1 : -0.1)); m.rotation.z = (i - 1.5) * 0.18; }
  }
  function brushFence(g: T.Group, x: number, z: number, len: number, rot = 0) { // 싸리울
    const f = new three.Group(); f.position.set(x, 0, z); f.rotation.y = rot; g.add(f);
    const n = Math.max(4, Math.round(len / 0.12));
    for (let i = 0; i < n; i++) part(CYL6, mat("#8A7350"), 0.025, 0.6 + (i % 3) * 0.05, 0.025, -len / 2 + (i * len) / (n - 1), 0.3, (i % 2) * 0.03, f);
    part(BOX, mat("#6B5638"), len, 0.04, 0.05, 0, 0.42, 0, f); part(BOX, mat("#6B5638"), len, 0.04, 0.05, 0, 0.2, 0, f);
  }
  /** 화톳불: 돌 화로에 장작불 (가로등 대신) */
  function brazier(x: number, z: number, big = 1) {
    const y = groundAt(x, z);
    part(CYL, mat("#7A756B"), 0.45 * big, 0.5 * big, 0.45 * big, x, y + 0.25 * big, z);
    for (let k = 0; k < 4; k++) { const l = part(BOX, mat("#5A4030"), 0.08, 0.5, 0.08, x + Math.cos(k * 1.6) * 0.15, y + 0.6 * big, z + Math.sin(k * 1.6) * 0.15); l.rotation.set(Math.sin(k) * 0.5, 0, Math.cos(k) * 0.5); }
    const fl = part(CONE, mat("#FFB25A", { emissive: "#FF7A1F", ei: 1 }), 0.28 * big, 0.65 * big, 0.28 * big, x, y + 0.85 * big, z);
    const gl = glow(AMBER, 3.2 * big, x, y + 1.0 * big, z, 0.75);
    const ph = x * 0.37;
    anim.push((t) => { fl.scale.y = 0.65 * big * (1 + Math.sin(t * 9 + ph) * 0.2); gl.material.opacity = 0.65 + Math.sin(t * 7 + ph) * 0.12; });
    solids.push({ x, z, r: 0.6 * big });
    firePoints.push({ x, z, loud: 0.6 * big });
  }

  // ── 집: 마을 양식 5종 × 성장 3단계 (조선 민가 문법) ──
  const houseState = new Map<string, { active: boolean }>();
  const smokeMat = () => new three.MeshStandardMaterial({ color: "#E9E3EE", roughness: 1, transparent: true, opacity: 0.6, depthWrite: false });

  /** 낮은 굴뚝(아궁이 굴뚝): 연기 = 쌓인 아이디어(가늘게) · 주인이 마을에 있으면(굵고 빠르게) */
  function chimney(g: T.Group, x: number, z: number, h: WorldHouse, st: number) {
    const state = houseState.get(h.id)!;
    part(CYL6, mat("#8C7A62"), 0.16, 0.7 + st * 0.15, 0.16, x, (0.7 + st * 0.15) / 2, z, g);
    const top = 0.7 + st * 0.15;
    const ph = h.peak % 7;
    const puffs = Array.from({ length: 5 }, (_, i) => ({ m: part(BALL, smokeMat(), 0.2, 0.2, 0.2, x, top, z, g), o: i / 5 }));
    anim.push((t) => {
      const n = state.active ? 5 : h.fires >= 2 ? Math.min(3, h.fires) : 1;
      const speed = state.active ? 0.3 : 0.14;
      puffs.forEach((p, i) => {
        p.m.visible = i < n; if (!p.m.visible) return;
        const k = (t * speed + p.o + ph) % 1;
        p.m.position.set(x + k * 0.8 + Math.sin(t + i) * 0.05, top + 0.2 + k * (state.active ? 3.2 : 2.2), z);
        p.m.scale.setScalar((state.active ? 0.25 : 0.14) + k * (state.active ? 0.6 : 0.35));
        (p.m.material as T.MeshStandardMaterial).opacity = (state.active ? 0.8 : 0.45) * (1 - k);
      });
    });
  }
  /** 창호지 창: 집주인 도깨비불 색이 섞인 불빛. 주인이 마을에 있으면 화롯불처럼 일렁인다 */
  function paperWindow(h: WorldHouse) {
    const state = houseState.get(h.id)!;
    const lightCol = new three.Color(AMBER).lerp(new three.Color(h.color), 0.5);
    const m = new three.MeshStandardMaterial({ color: "#F3E7C9", roughness: 0.8, flatShading: true, emissive: lightCol, emissiveIntensity: 0.35 });
    const ph = (h.peak * 1.7) % 6;
    anim.push((t) => {
      m.emissiveIntensity = state.active ? 0.8 + Math.sin(t * 7 + ph) * 0.2 + Math.sin(t * 13.3 + ph) * 0.12 : h.lit ? 0.6 : night ? 0.55 : 0.32;
    });
    return { m, color: "#" + lightCol.getHexString() };
  }
  /** 몸채: 기단 + 흙벽 + 나무 기둥 + 창호 + 판문 */
  function body(g: T.Group, s: VStyle, w: number, d: number, wallH: number, win: T.Material, opts: { open?: boolean } = {}) {
    part(BOX, mat("#8C877C"), w + 0.5, 0.3, d + 0.5, 0, 0.15, 0, g); // 기단
    const wy = 0.3 + wallH / 2;
    if (opts.open) { // 앞이 트인 대장간
      part(BOX, mat(s.wall), w, wallH, 0.12, 0, wy, -d / 2 + 0.06, g);
      part(BOX, mat(s.wall), 0.12, wallH, d, -w / 2 + 0.06, wy, 0, g);
      part(BOX, mat(s.wall), 0.12, wallH, d, w / 2 - 0.06, wy, 0, g);
    } else part(BOX, mat(s.wall), w, wallH, d, 0, wy, 0, g);
    for (const [px, pz] of [[-w / 2, d / 2], [w / 2, d / 2], [-w / 2, -d / 2], [w / 2, -d / 2], [0, d / 2]]) part(CYL6, mat(s.wood), 0.08, wallH, 0.08, px, wy, pz, g);
    part(BOX, mat(s.wood), w + 0.04, 0.08, d + 0.04, 0, 0.3 + wallH - 0.06, 0, g); // 인방
    if (!opts.open) {
      part(BOX, win, 0.55, 0.55, 0.04, -w / 4, 0.3 + wallH * 0.55, d / 2 + 0.02, g);
      // 창살
      part(BOX, mat(s.wood), 0.03, 0.55, 0.05, -w / 4, 0.3 + wallH * 0.55, d / 2 + 0.03, g); part(BOX, mat(s.wood), 0.55, 0.03, 0.05, -w / 4, 0.3 + wallH * 0.55, d / 2 + 0.03, g);
      part(BOX, mat(s.wood), 0.55, 0.9, 0.05, w / 4, 0.3 + 0.45, d / 2 + 0.02, g); // 판문
    }
    return 0.3 + wallH; // 지붕 높이
  }

  function house(h: WorldHouse, style: string, x: number, z: number, face: number) {
    houseState.set(h.id, { active: h.active });
    const state = houseState.get(h.id)!;
    const s = STYLE[style];
    const st = h.stage;
    const g = new three.Group();
    g.position.set(x, groundAt(x, z), z); g.rotation.y = face; g.scale.setScalar([0.88, 1, 1.1][st - 1]);
    scene.add(g); occluders.push(g);
    const rnd = rng(hashOf(h.id));
    const { m: win, color: winColor } = paperWindow(h);
    const roofKind: RoofId = h.decor?.roof ?? s.roof;
    const w = 2.4, d = 1.9;

    if (style === "ttukttak") {
      // 대장간: 앞이 트이고 안에 화덕이 빛난다
      const top = body(g, s, w, d, 1.3, win, { open: true });
      roof(g, roofKind, w, d, top, rnd);
      const hearth = part(DOME, mat("#9C6B4E"), 0.5, 0.55, 0.45, -0.4, 0.3, -0.2, g);
      const fire = part(BALL, mat("#FFB25A", { emissive: h.color, ei: 1.1 }), 0.18, 0.14, 0.12, -0.4, 0.45, 0.2, g);
      const fg = glow(winColor, 2.4, -0.4, 0.6, 0.35, 0.7, g);
      const ph = h.peak;
      anim.push((t) => { const k = state.active ? 1.4 : 1; fire.scale.setScalar(0.16 * k * (1 + Math.sin(t * 10 + ph) * 0.15)); fg.material.opacity = (state.active ? 0.85 : 0.55) + Math.sin(t * 8 + ph) * 0.1; });
      part(BOX, mat("#5A4030"), 0.6, 0.3, 0.35, 0.45, 0.45, -0.3, g); // 풀무
      part(BOX, mat("#4A4E55"), 0.45, 0.2, 0.25, 0.6, 0.55, 0.45, g); // 모루
      void hearth;
      if (st >= 2) for (let i = 0; i < 5; i++) { const l = part(CYL6, mat("#8A6A4A"), 0.08, 0.7, 0.08, w / 2 + 0.35, 0.12 + (i % 2) * 0.16, -0.4 + i * 0.18, g); l.rotation.x = Math.PI / 2; } // 장작더미
      if (st >= 3) { part(BOX, mat(s.wall), 1.3, 1.0, 1.3, -w / 2 - 0.8, 0.8, -0.2, g); roof(g, roofKind, 1.1, 1.1, 1.3, rnd, false).scale.multiplyScalar(0.92); }
      chimney(g, -0.4, -d / 2 - 0.3, h, st);
      firePoints.push({ x, z, loud: 0.35 });
    } else {
      const wallH = style === "jjaekkak" ? 1.35 : 1.15;
      const top = body(g, s, w, d, wallH, win);
      roof(g, roofKind, w, d, top, rnd);
      chimney(g, w / 2 + 0.3, -d / 4, h, st);
      if (style === "kkomul" && !h.decor?.yard?.length) brushFence(g, 0, 2.5, 3.0);
      if (style === "kkomul") for (let i = 0; i < 3; i++) part(BOX, mat("#5E7E4E"), 0.15, 0.12, 1.0, -w / 2 - 0.5 - i * 0.28, 0.06, 0, g); // 텃밭 이랑
      if (st >= 2) { // 툇마루 + 디딤돌
        part(BOX, mat("#9C7A58"), w * 0.9, 0.1, 0.45, 0, 0.42, d / 2 + 0.25, g);
        part(BOX, mat("#8C877C"), 0.5, 0.12, 0.35, w / 4, 0.06, d / 2 + 0.75, g);
      }
      if (st >= 3) { // ㄱ자로 한 칸 덧붙인 집
        const wing = new three.Group(); wing.position.set(w / 2 + 0.6, 0, -0.55); wing.rotation.y = Math.PI / 2; g.add(wing);
        const t2 = body(wing, s, 1.5, 1.4, wallH * 0.95, win);
        roof(wing, roofKind, 1.5, 1.4, t2, rnd, false);
        if (style === "jjaekkak") { // 누마루
          part(BOX, mat("#9C7A58"), 1.2, 0.08, 1.0, w / 2 + 0.6, 0.85, 1.1, g);
          for (const [px, pz] of [[0.5, 0.7], [1.6, 0.7], [0.5, 1.5], [1.6, 1.5]]) part(CYL6, mat(s.wood), 0.06, 0.85, 0.06, w / 2 - 0.0 + px - 0.5, 0.42, pz, g);
        }
      }
      if (style === "wagle" && st >= 2) { // 널뛰기 널
        part(BOX, mat("#8A6A4A"), 1.6, 0.06, 0.25, -w / 2 - 0.9, 0.22, 1.2, g); part(CYL6, mat("#6B5638"), 0.12, 0.25, 0.12, -w / 2 - 0.9, 0.1, 1.2, g);
      }
      if (style === "wagle" && st >= 3) { // 집 위로 띄운 방패연
        const kite = new three.Group(); g.add(kite);
        part(BOX, mat("#F3E7C9", { side: true }), 0.55, 0.7, 0.02, 0, 0, 0, kite); part(DISC, mat("#3E3C42"), 0.12, 1, 0.12, 0, 0, 0.02, kite).rotation.x = Math.PI / 2;
        const ph = h.peak; anim.push((t) => { kite.position.set(-1 + Math.sin(t * 0.5 + ph) * 0.4, 4.6 + Math.sin(t * 0.8 + ph) * 0.3, -1.4); kite.rotation.z = Math.sin(t * 1.2 + ph) * 0.25; });
      }
      if (style === "kkambbak" && st >= 3) { // 물가 망루
        for (const [px, pz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) part(CYL6, mat(s.wood), 0.06, 2.6, 0.06, -w / 2 - 1.1 + px, 1.3, pz, g);
        part(BOX, mat("#8A6A4A"), 1.1, 0.08, 1.1, -w / 2 - 1.1, 2.6, 0, g);
        roof(g, "reed", 0.9, 0.9, 2.65, rnd, false).scale.set(0.8, 0.6, 0.8);
      }
    }
    glow(winColor, 1.6, -w / 4, 0.95, d / 2 + 0.25, night ? 0.55 : 0.35, g);

    // 문패(주인이 고른 모양)
    const sign = h.decor?.sign ?? "plank";
    if (sign === "plank" || sign === "round") {
      part(CYL6, mat(s.wood), 0.05, 0.9, 0.05, 1.5, 0.45, 1.6, g);
      if (sign === "plank") part(BOX, mat("#B8946A"), 0.45, 0.28, 0.05, 1.5, 0.95, 1.6, g);
      else { const dsc = part(CYL, mat("#B8946A"), 0.22, 0.05, 0.22, 1.5, 0.98, 1.6, g); dsc.rotation.x = Math.PI / 2; }
    } else if (sign === "banner") { // 깃대: 천 색은 집주인 도깨비불 색
      part(CYL6, mat(s.wood), 0.04, 2.4, 0.04, 1.6, 1.2, 1.5, g);
      const cloth = part(BOX, mat(h.color, { side: true }), 0.04, 0.8, 0.45, 1.6, 2.0, 1.75, g);
      const ph = h.peak; anim.push((t) => { cloth.rotation.y = Math.sin(t * 2 + ph) * 0.25; });
    } else { // 처마 끝에 매단 초롱
      const lan = part(CYL, mat("#F3E7C9", { emissive: winColor, ei: 0.9 }), 0.13, 0.28, 0.13, 1.25, 1.35, d / 2 + 0.55, g);
      const lg = glow(winColor, 1.4, 1.25, 1.35, d / 2 + 0.6, 0.7, g);
      const ph = h.peak; anim.push((t) => { lan.rotation.z = Math.sin(t * 1.5 + ph) * 0.12; lg.material.opacity = 0.6 + Math.sin(t * 5 + ph) * 0.08; });
    }
    yard(g, h, s, winColor);
    if (h.wants >= 5) { part(CYL6, mat(s.wood), 0.035, 2.2, 0.035, -1.5, 1.1, -0.9, g); part(BOX, mat("#F3E7C9", { side: true }), 0.02, 0.4, 0.55, -1.5, 1.95, -0.62, g); } // 장대 깃발

    const mine = h.id === myForgeId;
    if (mine) { const ring = part(TORUS, mat(AMBER, { emissive: AMBER, ei: 0.7 }), 2.3, 2.3, 0.4, 0, 0.05, 0, g); ring.rotation.x = Math.PI / 2; }
    const tag = textSprite(mine ? "내 대장간" : h.nickname, mine ? { bg: "#1E1F24", fg: "#fff" } : {});
    tag.position.set(x, groundAt(x, z) + 4.4, z);
    scene.add(tag);
    nameTags.push({ s: tag, x, z, always: mine });
    solids.push({ x, z, r: 1.6 * g.scale.x });
    spots.push({ x, z, r: 3.2, kind: "house", house: h, label: mine ? "내 대장간" : `${h.nickname}의 대장간` });
  }

  /** 집 앞 꾸미기 */
  function yard(g: T.Group, h: WorldHouse, s: VStyle, light: string) {
    const items = h.decor?.yard ?? [];
    const slots: Array<[number, number]> = [[-1.5, 1.7], [-0.5, 2.25], [0.6, 2.35]];
    items.slice(0, 3).forEach((id, i) => {
      const [x, z] = slots[i];
      if (id === "jar") for (let k = 0; k < 3; k++) { const r = 0.2 - k * 0.03; part(BALL, mat("#5A3B2A"), r, r * 1.15, r, x + k * 0.32 - 0.3, r, z + (k % 2) * 0.12, g); part(CYL, mat("#4A3022"), r * 0.6, 0.05, r * 0.6, x + k * 0.32 - 0.3, r * 2.2, z + (k % 2) * 0.12, g); }
      else if (id === "fence") brushFence(g, x + 0.3, z + 0.2, 1.5);
      else if (id === "flower") flowersLocal(g, x, z);
      else if (id === "pyeongsang") { part(BOX, mat("#9C7A58"), 1.0, 0.07, 0.7, x, 0.38, z, g); for (const [px, pz] of [[-0.45, -0.3], [0.45, -0.3], [-0.45, 0.3], [0.45, 0.3]]) part(BOX, mat(s.wood), 0.06, 0.36, 0.06, x + px, 0.18, z + pz, g); }
      else if (id === "chorong") { part(CYL6, mat(s.wood), 0.04, 1.6, 0.04, x, 0.8, z, g); part(BOX, mat(s.wood), 0.35, 0.04, 0.04, x + 0.15, 1.58, z, g); part(CYL, mat("#F3E7C9", { emissive: light, ei: 0.9 }), 0.11, 0.24, 0.11, x + 0.3, 1.36, z, g); glow(light, 1.2, x + 0.3, 1.36, z + 0.05, 0.6, g); }
      else if (id === "sotdae") { part(CYL6, mat("#7A6650"), 0.03, 1.8, 0.03, x, 0.9, z, g); sotdaeBird(g, x, 1.85, z, 0.6); }
      else if (id === "chime") { part(CYL6, mat(s.wood), 0.04, 1.4, 0.04, x, 0.7, z, g); part(BOX, mat(s.wood), 0.3, 0.04, 0.04, x + 0.15, 1.38, z, g); const bell = part(CONE, mat("#8C8A7A"), 0.08, 0.14, 0.08, x + 0.28, 1.25, z, g); anim.push((t) => { bell.rotation.z = Math.sin(t * 2.2 + x) * 0.2; }); }
    });
  }
  function flowersLocal(g: T.Group, x: number, z: number) { // 메밀꽃밭
    for (let i = 0; i < 14; i++) { const fx = x + ((i * 37) % 10) / 10 - 0.5, fz = z + ((i * 53) % 10) / 14 - 0.35; part(BALL, mat("#F4F1E8"), 0.07, 0.05, 0.07, fx, 0.3, fz, g); part(CYL6, mat("#7A5A4A"), 0.015, 0.28, 0.015, fx, 0.14, fz, g); }
  }
  function sotdaeBird(g: T.Object3D, x: number, y: number, z: number, s = 1) { // 솟대 끝 새
    const b = new three.Group(); b.position.set(x, y, z); b.scale.setScalar(s); g.add(b);
    part(BOX, mat("#7A6650"), 0.12, 0.1, 0.42, 0, 0, 0, b); const head = part(BOX, mat("#7A6650"), 0.08, 0.08, 0.14, 0, 0.06, 0.24, b); head.rotation.x = -0.3;
    return b;
  }

  function vacantPlot(x: number, z: number, face: number) {
    const g = new three.Group(); g.position.set(x, groundAt(x, z), z); g.rotation.y = face; scene.add(g);
    for (const [px, pz] of [[-1.2, -1], [1.2, -1], [-1.2, 1], [1.2, 1]]) part(CYL6, mat("#6E5236"), 0.05, 0.5, 0.05, px, 0.25, pz, g);
    part(BOX, mat("#C9B98F"), 2.4, 0.03, 0.03, 0, 0.42, 1, g); part(BOX, mat("#C9B98F"), 2.4, 0.03, 0.03, 0, 0.42, -1, g); // 새끼줄
    part(CYL6, mat("#6E5236"), 0.05, 1.1, 0.05, 0, 0.55, 1.3, g);
    const board = woodBoard("빈 터", 0.8, 0.36, 44); board.position.set(0, 1.0, 1.33); g.add(board);
    spots.push({ x, z, r: 2.6, kind: "plot", label: "빈 터" });
  }

  function ringCapacity(r: number) { return Math.floor((Math.PI * 2 * r - 6) / SLOT); }

  // ── 장승·솟대(마을 입구, 하당) ──
  function jangseung(x: number, z: number, face: number, female: boolean) {
    const y = groundAt(x, z);
    const g = new three.Group(); g.position.set(x, y, z); g.rotation.y = face; scene.add(g); occluders.push(g);
    const pole = part(CYL6, mat("#6B5A48"), 0.26, 2.8, 0.26, 0, 1.4, 0, g); ink(pole, 1.08);
    const hat = part(CYL6, mat("#3E3530"), female ? 0.3 : 0.38, female ? 0.25 : 0.45, female ? 0.3 : 0.38, 0, 2.95, 0, g); ink(hat, 1.1);
    // 부릅뜬 눈·드러낸 이 (먹으로 그린 얼굴)
    for (const sx of [-0.1, 0.1]) { part(BALL, mat("#F3E7C9"), 0.07, 0.07, 0.03, sx, 2.5, 0.25, g); part(BALL, mat(INK), 0.035, 0.035, 0.02, sx, 2.5, 0.28, g); }
    part(BOX, mat("#F3E7C9"), 0.2, 0.06, 0.03, 0, 2.2, 0.26, g);
    part(BOX, mat(INK), 0.04, 1.3, 0.02, 0, 1.2, 0.27, g); // 몸에 쓴 글씨 자리(세로 먹줄)
    solids.push({ x, z, r: 0.4 });
  }
  function sotdae(x: number, z: number, h = 4.2) {
    const y = groundAt(x, z);
    const p = part(CYL6, mat("#7A6650"), 0.05, h, 0.05, x, y + h / 2, z); ink(p, 1.2);
    sotdaeBird(scene, x, y + h + 0.05, z, 1.1);
    solids.push({ x, z, r: 0.25 });
  }

  // ── 마을마다: 입구, 랜드마크, 집, 자연물 ──
  villages.forEach((v, i) => {
    const c = centers[i];
    const s = STYLE[v.id];
    const toPlaza = Math.atan2(-c.x, -c.z);

    // 입구: 장승 한 쌍 + 솟대 + 마을 목패
    {
      const gd = LAKE_OUT + 4.5;
      const gx = Math.sin(c.a) * gd, gz = -Math.cos(c.a) * gd;
      const side = { x: Math.cos(c.a), z: Math.sin(c.a) };
      const faceIn = -c.a + Math.PI; // 광장 쪽을 본다
      jangseung(gx + side.x * 2.6, gz + side.z * 2.6, faceIn, false);
      jangseung(gx - side.x * 2.6, gz - side.z * 2.6, faceIn, true);
      sotdae(gx + side.x * 4.0 + Math.sin(c.a) * 1.2, gz + side.z * 4.0 - Math.cos(c.a) * 1.2);
      const py = groundAt(gx - side.x * 4.0, gz - side.z * 4.0);
      part(CYL6, mat("#6E5236"), 0.06, 1.8, 0.06, gx - side.x * 4.0, py + 0.9, gz - side.z * 4.0);
      const board = woodBoard(v.name, 1.7, 0.5, 60); board.position.set(gx - side.x * 4.0, py + 1.55, gz - side.z * 4.0); board.rotation.y = faceIn; scene.add(board);
      brazier(gx + side.x * 3.4 - Math.sin(c.a) * 1.4, gz + side.z * 3.4 + Math.cos(c.a) * 1.4, 0.7);
    }

    landmark(v.id, c.x, c.z, s, toPlaza);

    const list = houses.filter((h) => v.themes.includes(h.theme)).sort((a, b) => a.theme.localeCompare(b.theme) || a.alleySeq - b.alleySeq || a.plotNo - b.plotNo);
    const slots: Array<{ x: number; z: number; face: number; ang: number; ring: number }> = [];
    RINGS.forEach((r, ri) => {
      const n = ringCapacity(r);
      const gap = 3.2 / r;
      const step = (Math.PI * 2 - gap * 2) / n;
      for (let k = 0; k < n; k++) {
        const ang = toPlaza + gap + step * (k + 0.5);
        const x = c.x + Math.sin(ang) * r, z = c.z + Math.cos(ang) * r;
        if (marsh && Math.hypot(x - marsh.x, z - marsh.z) < marsh.r + 3) continue;
        slots.push({ x, z, face: ang + Math.PI, ang, ring: ri });
      }
    });
    // 골목은 이름 없이: 같은 관심사끼리 이웃하고, 바뀌는 자리엔 꽃 무더기
    let lastTheme = "";
    list.slice(0, slots.length).forEach((h, k) => {
      const sl = slots[k];
      if (lastTheme && h.theme !== lastTheme) { const r = RINGS[sl.ring], a = sl.ang - (SLOT / r) / 2; flowers(c.x + Math.sin(a) * r, c.z + Math.cos(a) * r, s.flower, 6, 0.5); }
      lastTheme = h.theme;
      house(h, v.id, sl.x, sl.z, sl.face);
    });
    if (list.length > slots.length) { const t = textSprite(`${v.name} · ${list.length}채`, { bg: "#2A2118", fg: "#F3E7C9", size: 48, scale: 1 }); t.position.set(c.x, 10, c.z); scene.add(t); }
    const vacant = Math.max(0, Math.min(slots.length - list.length, list.length < 4 ? 4 - list.length + 2 : 0));
    for (let k = 0; k < vacant; k++) { const sl = slots[list.length + k]; vacantPlot(sl.x, sl.z, sl.face); }

    const r = rng(i * 101 + 5);
    const occupied = (x: number, z: number, pad: number) => solids.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad) || pathAt(x, z) !== null || Math.hypot(x, z) < LAKE_OUT + 2;
    const scatter = (count: number, rMin: number, rMax: number, fn: (x: number, z: number) => void, pad = 1.2) => {
      let placed = 0;
      for (let tries = 0; tries < count * 8 && placed < count; tries++) {
        const a = r() * Math.PI * 2, d = rMin + r() * (rMax - rMin);
        const x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d;
        if (Math.abs(((a - toPlaza + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.35) continue;
        if (Math.hypot(x, z) > ISLAND_R - 12 || occupied(x, z, pad)) continue;
        fn(x, z); placed++;
      }
    };
    const between = (fn: (x: number, z: number) => void, n: number, pad = 0.9) => scatter(n, RINGS[0] - 2.4, RINGS[1] + 4, fn, pad);
    if (v.id === "kkomul") {
      scatter(9, 21, 30, (x, z) => tree(x, z, "persimmon", 0.9 + r() * 0.4));
      scatter(5, 21, 30, (x, z) => tree(x, z, "zelkova", 1 + r() * 0.4));
      between((x, z) => flowers(x, z, s.flower, 9), 10); // 메밀꽃
    } else if (v.id === "ttukttak") {
      scatter(8, 21, 30, (x, z) => tree(x, z, "pine", 0.9 + r() * 0.4));
      between((x, z) => { const y = groundAt(x, z); for (let k = 0; k < 6; k++) { const l = part(CYL6, mat("#8A6A4A"), 0.09, 0.8, 0.09, x + (k % 3) * 0.2, y + 0.1 + Math.floor(k / 3) * 0.18, z); l.rotation.x = Math.PI / 2; } solids.push({ x, z, r: 0.5 }); }, 6); // 장작더미
      between((x, z) => { const y = groundAt(x, z); part(BALL, mat("#5A3B2A"), 0.3, 0.36, 0.3, x, y + 0.32, z); solids.push({ x, z, r: 0.4 }); }, 5); // 옹기
      for (let k = 0; k < 4; k++) { const a = k * 1.57 + 0.4; brazier(c.x + Math.sin(a) * (LOOP_R + 1.8), c.z + Math.cos(a) * (LOOP_R + 1.8), 0.6); }
    } else if (v.id === "jjaekkak") {
      scatter(11, 20, 30, (x, z) => tree(x, z, "ginkgo", 0.9 + r() * 0.4));
      between((x, z) => grassTuft(x, z, "#D6CFC0", 0.7), 14, 0.5); // 억새
    } else if (v.id === "wagle") {
      scatter(9, 20, 31, (x, z) => tree(x, z, "bush", 1 + r() * 0.6));
      scatter(5, 22, 30, (x, z) => tree(x, z, "zelkova", 1));
      between((x, z) => flowers(x, z, s.flower, 8), 10);
    } else {
      scatter(6, 21, 30, (x, z) => tree(x, z, "pine", 0.9 + r() * 0.4));
      scatter(4, 20, 28, (x, z) => tree(x, z, "bamboo", 1 + r() * 0.3));
      if (marsh) for (let k = 0; k < 22; k++) { const a = k * 0.29, d = marsh.r + 0.5 + (k % 3) * 0.35; grassTuft(marsh.x + Math.cos(a) * d, marsh.z + Math.sin(a) * d, "#B8A57A", 1.1); wispSpots.push({ x: marsh.x, z: marsh.z }); }
      between((x, z) => grassTuft(x, z, "#B8A57A", 1.0), 16, 0.5); // 갈대
    }
  });

  // 호숫가 버드나무와 갈대, 언덕 소나무, 고갯길 서낭당
  {
    const r = rng(9);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + 0.3; const x = Math.sin(a) * (LAKE_OUT + 2.3), z = -Math.cos(a) * (LAKE_OUT + 2.3); if (spokes.some((s) => segDist(x, z, 0, 0, s.bx, s.bz) < 3) || eraSpokes.some((s) => segDist(x, z, s.ax, s.az, s.bx, s.bz) < 3)) continue; tree(x, z, "willow", 0.9 + r() * 0.3); }
    for (let k = 0; k < 40; k++) { const a = r() * Math.PI * 2; const rad = r() < 0.5 ? LAKE_OUT + 0.9 : LAKE_IN - 0.7; const x = Math.sin(a) * rad, z = -Math.cos(a) * rad; if (spokes.some((s) => segDist(x, z, 0, 0, s.bx, s.bz) < 1.8)) continue; grassTuft(x, z, "#A89A6E", 0.9); }
    for (let k = 0; k < 120; k++) {
      const a = r() * Math.PI * 2, d = 28 + r() * 74;
      const x = Math.sin(a) * d, z = -Math.cos(a) * d;
      if (builtDist(x, z) < 2 || Math.hypot(x, z) > ISLAND_R - 11) continue;
      if (solids.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 1.5)) continue;
      tree(x, z, r() < 0.65 ? "pine" : "zelkova", 1 + r() * 0.7);
    }
    // 서낭당: 고갯마루 돌무더기 + 오색천을 맨 신목
    ANGLES.slice(0, 3).forEach((a, k) => {
      const b = a + 0.63 + 0.13; const x = Math.sin(b) * 52, z = -Math.cos(b) * 52; // 시대 마을 길에서 비켜선 고갯마루
      const y = groundAt(x, z);
      const pile = part(CONE, mat("#8C877C"), 0.9, 0.9, 0.9, x, y + 0.45, z); ink(pile, 1.05);
      tree(x + 1.4, z + 0.4, "zelkova", 1.2);
      const ty = groundAt(x + 1.4, z + 0.4);
      ["#2F5F9E", "#C8443A", "#E3B341", "#F3EEE3", "#3F7A4E"].forEach((col, q) => { const strip = part(BOX, mat(col, { side: true }), 0.04, 0.5, 0.08, x + 1.4 + Math.cos(q * 1.2) * 0.25, ty + 1.2, z + 0.4 + Math.sin(q * 1.2) * 0.25); const ph = q + k; anim.push((t) => { strip.rotation.z = Math.sin(t * 1.8 + ph) * 0.2; }); });
      solids.push({ x, z, r: 1 });
    });
  }

  // ── 랜드마크 ──
  function landmark(id: string, x: number, z: number, s: VStyle, a: number) {
    const y = groundAt(x, z);
    const g = new three.Group(); g.position.set(x, y, z); g.rotation.y = a; scene.add(g); occluders.push(g);
    if (id === "kkomul") {
      // 당산나무(큰 느티나무) 아래 평상
      const trunk = part(CYL6, mat("#5E4A36"), 1.0, 6, 1.1, 0, 3, 0, g); ink(trunk, 1.04);
      for (const [cx, cy, cz, sz] of [[0, 7.4, 0, 4.4], [2.8, 6.6, 1, 2.9], [-2.6, 6.8, -0.8, 3.1], [0.6, 9.0, -1.4, 2.7], [-0.8, 6.2, 2.4, 2.5]]) part(BALL, mat(["#5E7E58", "#6A8A62", "#557650"][Math.round(cx + cz) & 1]), sz, sz * 0.75, sz, cx, cy, cz, g);
      for (let k = 0; k < 2; k++) { const px = k ? 2.4 : -2.4; part(BOX, mat("#9C7A58"), 1.8, 0.1, 1.2, px, 0.42, 1.8, g); for (const [qx, qz] of [[-0.8, -0.5], [0.8, -0.5], [-0.8, 0.5], [0.8, 0.5]]) part(BOX, mat(s.wood), 0.08, 0.42, 0.08, px + qx, 0.21, 1.8 + qz, g); }
      part(TORUS, mat("#C9B98F"), 1.15, 1.15, 0.8, 0, 2.2, 0, g).rotation.x = Math.PI / 2; // 둘러맨 새끼줄
      solids.push({ x, z, r: 2.2 });
      for (let k = 0; k < 5; k++) wispSpots.push({ x: x + Math.cos(k) * 3, z: z + Math.sin(k) * 3 });
    } else if (id === "ttukttak") {
      // 냇물로 도는 물레방아
      part(BOX, mat(s.wall), 3.4, 2.2, 2.6, 0, 1.4, -0.8, g);
      roof(g, "thatch", 3.4, 2.6, 2.5, rng(5)).position.z = -0.8;
      const wheel = new three.Group(); wheel.position.set(2.1, 1.7, -0.6); wheel.rotation.y = Math.PI / 2; g.add(wheel);
      const rim = part(TORUS, mat("#6E5236"), 1.5, 1.5, 2.2, 0, 0, 0, wheel); ink(rim, 1.03);
      for (let k = 0; k < 10; k++) { const q = (k / 10) * Math.PI * 2; const pad = part(BOX, mat("#8A6A4A"), 0.5, 0.15, 0.45, Math.cos(q) * 1.5, Math.sin(q) * 1.5, 0, wheel); pad.rotation.z = q; const sp = part(BOX, mat("#5E4430"), 0.06, 1.5, 0.06, Math.cos(q) * 0.75, Math.sin(q) * 0.75, 0, wheel); sp.rotation.z = q + Math.PI / 2; }
      part(BOX, mat("#6E5236"), 0.4, 0.25, 4, 2.1, 3.3, 1.2, g); // 홈통
      const water = part(BOX, mat("#7FA6C2", { opacity: 0.7 }), 0.25, 0.08, 4, 2.1, 3.4, 1.2, g); void water;
      anim.push((t) => { wheel.rotation.z = -t * 0.9; });
      solids.push({ x, z, r: 2.8 });
      firePoints.push({ x, z, loud: 0.2 });
    } else if (id === "jjaekkak") {
      // 해시계(앙부일구 모양)와 북을 단 정자
      part(BOX, mat("#8C877C"), 2.2, 0.5, 2.2, 0, 0.25, 0, g);
      part(CYL6, mat("#8C877C"), 0.3, 0.7, 0.3, 0, 0.85, 0, g);
      const bowl = part(DOME, mat("#6E6A5E", { side: true }), 0.6, 0.45, 0.6, 0, 1.6, 0, g); bowl.rotation.x = Math.PI; ink(bowl, 1.05);
      const gnomon = part(BOX, mat("#3E3C42"), 0.04, 0.04, 0.9, 0, 1.45, 0, g); gnomon.rotation.x = -0.65;
      const shadow = part(BOX, mat("#2A2830"), 0.03, 0.01, 0.45, 0, 1.2, 0, g);
      anim.push(() => { const d = new Date(); const hr = d.getHours() + d.getMinutes() / 60; shadow.rotation.y = ((hr - 12) / 12) * Math.PI * 0.8; });
      // 정자 + 북
      const pv = new three.Group(); pv.position.set(4.2, 0, -1.5); g.add(pv);
      part(BOX, mat("#8C877C"), 2.6, 0.4, 2.6, 0, 0.2, 0, pv);
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) part(CYL6, mat(s.wood), 0.1, 2.2, 0.1, px, 1.5, pz, pv);
      roof(pv, "giwa", 2.0, 2.0, 2.6, rng(8));
      const drum = part(CYL, mat("#7A5A3A"), 0.55, 0.6, 0.55, 0, 1.3, 0, pv); drum.rotation.z = Math.PI / 2; ink(drum, 1.06);
      const stick = part(CYL6, mat(s.wood), 0.04, 0.7, 0.04, 0.6, 1.5, 0.3, pv);
      anim.push(() => { const d = new Date(); const ringing = d.getMinutes() === 0 && d.getSeconds() < 30; stick.rotation.z = ringing ? Math.sin(Date.now() / 160) * 0.6 : 0.2; });
      solids.push({ x, z, r: 1.8 });
      solids.push({ x: x + Math.cos(a) * 4.2 + Math.sin(a) * -1.5, z: z - Math.sin(a) * 4.2 + Math.cos(a) * -1.5, r: 1.8 });
    } else if (id === "wagle") {
      // 씨름판(모래판)과 큰 그네
      part(CYL, mat("#E0CFA6"), 3.2, 0.12, 3.2, 0, 0.06, 0, g);
      part(TORUS, mat("#B79E70"), 3.2, 3.2, 1.2, 0, 0.12, 0, g).rotation.x = Math.PI / 2;
      const sw = new three.Group(); sw.position.set(0, 0, -4.6); g.add(sw);
      for (const sx of [-1.4, 1.4]) { const p = part(CYL6, mat(s.wood), 0.12, 6.2, 0.12, sx, 3.1, 0, sw); ink(p, 1.1); }
      part(CYL6, mat(s.wood), 0.1, 3, 0.1, 0, 6.1, 0, sw).rotation.z = Math.PI / 2;
      const seat = new three.Group(); seat.position.set(0, 6.0, 0); sw.add(seat);
      for (const sx of [-0.35, 0.35]) part(CYL6, mat("#C9B98F"), 0.02, 5, 0.02, sx, -2.5, 0, seat);
      part(BOX, mat("#8A6A4A"), 0.9, 0.08, 0.3, 0, -5, 0, seat);
      anim.push((t) => { seat.rotation.x = Math.sin(t * 1.1) * 0.45; });
      solids.push({ x: x - Math.sin(a) * 4.6, z: z - Math.cos(a) * 4.6, r: 1.6 });
    } else {
      // 봉수대: 돌 연대 위 연조 다섯, 평상시처럼 하나만 불이 오른다
      const base = part(CYL, mat("#8C877C"), 2.6, 2.2, 2.6, 0, 1.1, 0, g); ink(base, 1.03);
      for (let k = 0; k < 5; k++) {
        const q = (k / 5) * Math.PI * 2; const cx = Math.cos(q) * 1.6, cz = Math.sin(q) * 1.6;
        part(CYL6, mat("#9A958A"), 0.32, 1.1, 0.32, cx, 2.75, cz, g);
        if (k === 0) {
          const fl = part(CONE, mat("#FFB25A", { emissive: "#FF7A1F", ei: 1 }), 0.25, 0.7, 0.25, cx, 3.6, cz, g);
          const gl = glow(AMBER, 3, cx, 3.7, cz, 0.8, g);
          const puffs = Array.from({ length: 6 }, (_, i) => ({ m: part(BALL, smokeMat(), 0.3, 0.3, 0.3, cx, 3.8, cz, g), o: i / 6 }));
          anim.push((t) => { fl.scale.y = 0.7 * (1 + Math.sin(t * 9) * 0.2); gl.material.opacity = 0.7 + Math.sin(t * 6) * 0.1; puffs.forEach((p) => { const kk = (t * 0.12 + p.o) % 1; p.m.position.set(cx + kk * 1.2, 3.9 + kk * 6, cz); p.m.scale.setScalar(0.3 + kk * 0.9); (p.m.material as T.MeshStandardMaterial).opacity = 0.55 * (1 - kk); }); });
          firePoints.push({ x, z, loud: 0.4 });
        }
      }
      // 돌계단
      for (let k = 0; k < 6; k++) part(BOX, mat("#7A766C"), 1.0, 0.3, 0.5, 0, 0.15 + k * 0.36, 2.6 + (5 - k) * 0.45 - 2.2, g);
      solids.push({ x, z, r: 2.9 });
    }
  }

  // ── 호수 섬: 본관 대장간(공사 단계) + 화톳불 + 평상 + 소식판 ──
  {
    const hall = new three.Group(); scene.add(hall); occluders.push(hall);
    part(BOX, mat("#8C877C"), 6.6, 0.45, 5.4, 0, 0.22, 0, hall); // 장대석 기단
    if (hallStage >= 1) for (const [px, pz] of [[-2.8, -2.2], [2.8, -2.2], [-2.8, 2.2], [2.8, 2.2], [0, -2.2], [0, 2.2], [-1.4, 2.2], [1.4, 2.2]]) part(CYL6, mat("#5E4430"), 0.18, 3.2, 0.18, px, 2.05, pz, hall);
    if (hallStage >= 1) part(BOX, mat("#5E4430"), 6.0, 0.2, 4.8, 0, 3.6, 0, hall); // 도리
    if (hallStage >= 2) { const rf = part(geo("hallroof", () => tileRoofGeo(8.4, 6.8, 2.6, 0.55)), mat("#3E3C42", { side: true }), 1, 1, 1, 0, 3.7, 0, hall); ink(rf, 1.03); part(BOX, mat("#2C2A30"), 5.2, 0.3, 0.4, 0, 6.25, 0, hall); }
    // 가운데 큰 화덕: 굴뚝이 서면(3단계) 불이 오른다
    part(DOME, mat("#9C6B4E"), 1.1, 1.0, 0.9, 0, 0.45, -0.6, hall);
    part(BOX, mat("#5A4030"), 1.4, 0.6, 0.7, 1.8, 0.75, -0.9, hall); // 큰 풀무
    if (hallStage >= 3) {
      part(CYL6, mat("#8C7A62"), 0.35, 4.5, 0.35, 0, 3.0, -1.2, hall);
      const fl = part(BALL, mat("#FFB25A", { emissive: "#FF7A1F", ei: 1.2 }), 0.45, 0.35, 0.3, 0, 0.75, -0.05, hall);
      const gl = glow(AMBER, 6, 0, 1.2, 0.3, 0.85, hall);
      anim.push((t) => { fl.scale.set(0.45 * (1 + Math.sin(t * 9) * 0.12), 0.35 * (1 + Math.sin(t * 11) * 0.2), 0.3); gl.material.opacity = 0.75 + Math.sin(t * 7) * 0.12; });
      firePoints.push({ x: 0, z: 0, loud: 1 });
    }
    if (hallStage >= 4) {
      part(BOX, mat("#E2D6BC"), 5.4, 3.0, 0.15, 0, 1.95, -2.2, hall);
      for (const sx of [-2.0, -0.7, 0.7, 2.0]) part(BOX, mat("#F3E7C9", { emissive: AMBER, ei: 0.6 }), 1.0, 1.4, 0.05, sx, 2.0, -2.1, hall);
    }
    if (hallStage < 4) {
      // 공사 중: 통나무 비계(새끼로 묶음)·기와 더미·목재
      for (const [px, pz] of [[-3.8, -3.0], [3.8, -3.0], [-3.8, 3.0], [3.8, 3.0]]) part(CYL6, mat("#8A6A4A"), 0.08, 6, 0.08, px, 3, pz, hall);
      for (const hy of [2, 4]) { part(CYL6, mat("#8A6A4A"), 0.06, 7.6, 0.06, 0, hy, -3.0, hall).rotation.z = Math.PI / 2; part(CYL6, mat("#8A6A4A"), 0.06, 7.6, 0.06, 0, hy, 3.0, hall).rotation.z = Math.PI / 2; }
      { const n = 4 + Math.min(14, Math.floor((opts.giwa ?? 0) / 3)); for (let k = 0; k < n; k++) part(BOX, mat("#3E3C42"), 0.9, 0.12, 0.5, 3.6 + (k >= 9 ? 1.0 : 0), 0.5 + (k % 9) * 0.13, 4.2, hall); } // 기와 더미: 주민이 새긴 기와만큼 쌓인다
      for (let k = 0; k < 5; k++) { const l = part(CYL6, mat("#9C7A58"), 0.12, 3, 0.12, -3.4, 0.55 + (k % 2) * 0.22, 4.0 + k * 0.1, hall); l.rotation.z = Math.PI / 2; }
    }
    const lbl = textSprite(`달그락 대장간 본관 · 공사 ${hallPct}%${opts.giwa ? ` · 기와 ${opts.giwa}장` : ""}`, { bg: "#2A2118", fg: "#F3E7C9", size: 46, scale: 1 });
    lbl.position.set(0, 9.2, 0); scene.add(lbl);
    nameTags.push({ s: lbl, x: 0, z: 0, always: true });
    solids.push({ x: 0, z: 0, r: 4.6 });
    spots.push({ x: 0, z: 0, r: 7.2, kind: "hall", label: "달그락 대장간 본관" });

    for (const q of [0.95, -0.95, 2.4, -2.4]) brazier(Math.sin(q) * 8.2, -Math.cos(q) * 8.2, 1);
    for (const q of [Math.PI + 0.55, Math.PI - 0.55]) { const px = Math.sin(q) * 7, pz = -Math.cos(q) * 7; const b = new three.Group(); b.position.set(px, 0, pz); b.rotation.y = -q; scene.add(b); part(BOX, mat("#9C7A58"), 1.8, 0.1, 1.1, 0, 0.42, 0, b); for (const [qx, qz] of [[-0.8, -0.45], [0.8, -0.45], [-0.8, 0.45], [0.8, 0.45]]) part(BOX, mat("#5E4430"), 0.08, 0.42, 0.08, qx, 0.21, qz, b); solids.push({ x: px, z: pz, r: 1 }); }
    // 소식판(작은 지붕을 얹은 나무판)
    const nb = new three.Group(); nb.position.set(-5.2, 0, 6.2); nb.rotation.y = 0.65; scene.add(nb);
    part(CYL6, mat("#5E4430"), 0.08, 2.4, 0.08, -1, 1.2, 0, nb); part(CYL6, mat("#5E4430"), 0.08, 2.4, 0.08, 1, 1.2, 0, nb);
    const board = woodBoard("광장 소식판", 2.1, 1.0, 56); board.position.set(0, 1.55, 0.05); nb.add(board);
    roof(nb, "giwa", 1.6, 0.5, 2.3, rng(3), false).scale.set(0.9, 0.4, 0.6);
    solids.push({ x: -5.2, z: 6.2, r: 1.2 });
  }

  // ── 마을 연출: 원래 이 마을에 사는 것들 (화면 안에서만, 서버 비용 없음) ──
  {
    const near = (x: number, z: number, d: number) => Math.hypot(x - player.x, z - player.z) < d;

    // 1) 도깨비불 행렬: 섬 → 다리 → 마을 고리 길을 줄지어 오가다, 다가가면 흩어졌다 모인다
    const troupes = centers.map((c, vi) => {
      const path = (k: number) => {
        if (k < 0.3) { const q = k / 0.3; const d = PLAZA_R + q * (VILLAGE_D - LOOP_R - PLAZA_R); return { x: Math.sin(c.a) * d, z: -Math.cos(c.a) * d }; }
        if (k < 0.7) { const q = (k - 0.3) / 0.4; const a0 = Math.atan2(-c.x, -c.z); const a = a0 + q * Math.PI * 2; return { x: c.x + Math.sin(a) * LOOP_R, z: c.z + Math.cos(a) * LOOP_R }; }
        const q = (k - 0.7) / 0.3; const d = VILLAGE_D - LOOP_R - q * (VILLAGE_D - LOOP_R - PLAZA_R); return { x: Math.sin(c.a) * d, z: -Math.cos(c.a) * d };
      };
      const balls = Array.from({ length: 4 }, (_, i) => {
        const col = WISP[(i + vi) % 2];
        const m = part(BALL, new three.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95 }), 0.13, 0.17, 0.13);
        const gl = glow(col, 1.5, 0, 0, 0, 0.8);
        return { m, gl };
      });
      return { path, balls, speed: 0.011 + vi * 0.002, phase: vi * 0.21, scatter: 0 };
    });
    troupes.forEach(() => movingWisps.push({ x: 0, z: 0 }));
    anim.push((t, dt) => {
      troupes.forEach((tr, ti) => {
        const head = (t * tr.speed + tr.phase) % 1;
        const p0 = tr.path(head);
        tr.scatter = clamp01(tr.scatter + (near(p0.x, p0.z, 4.5) ? dt * 3 : -dt * 0.6));
        tr.balls.forEach((b, i) => {
          const p = tr.path((head - i * 0.006 + 1) % 1);
          const k = tr.scatter;
          const x = p.x + Math.cos(i * 2.1 + t * 2) * 3 * k, z = p.z + Math.sin(i * 2.1 + t * 2) * 3 * k;
          const y = heightAt(p.x, p.z) + 1.6 + Math.sin(t * 3 + i) * 0.15 + k * 1.5;
          b.m.position.set(x, y, z); b.gl.position.set(x, y, z);
        });
        movingWisps[ti].x = p0.x; movingWisps[ti].z = p0.z;
      });
    });

    // 2) 혼자 떠도는 불: 언덕과 물 위 (밤엔 더 많이)
    const loners = Array.from({ length: night ? 30 : 16 }, (_, i) => {
      const col = WISP[i % 2];
      const m = part(BALL, new three.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 }), 0.13, 0.17, 0.13);
      const gl = glow(col, 1.4, 0, 0, 0, 0.7);
      return { m, gl, r: i < 6 ? lakeMid + ((i % 3) - 1) * 2 : 24 + ((i * 37) % 50), a: i * 1.7, s: (0.02 + ((i * 13) % 10) / 160) * (i % 2 ? -1 : 1), y: i < 6 ? 0.9 : 2 + (i % 4) * 0.9 };
    });
    anim.push((t, dt) => { for (const w of loners) { w.a += w.s * dt; const x = Math.cos(w.a) * w.r, z = Math.sin(w.a) * w.r; const y = Math.max(groundAt(x, z), -0.4) + w.y + Math.sin(t + w.r) * 0.35; w.m.position.set(x, y, z); w.gl.position.set(x, y, z); } });

    // 3) 발자국: 실제로 손님이 다녀간 집 문 앞에서만
    const visited = spots.filter((sp) => sp.kind === "house" && sp.house!.lit).slice(0, 24);
    const stepGeo = new three.CircleGeometry(0.13, 10); stepGeo.rotateX(-Math.PI / 2); stepGeo.scale(1, 1, 1.5);
    const trails = visited.map((sp, ti) => {
      const v = centers.reduce((b, c, k) => (Math.hypot(sp.x - c.x, sp.z - c.z) < Math.hypot(sp.x - centers[b].x, sp.z - centers[b].z) ? k : b), 0);
      const c = centers[v];
      const dx = c.x - sp.x, dz = c.z - sp.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, px = -uz, pz = ux;
      const steps = Array.from({ length: 8 }, (_, k) => {
        const m = new three.MeshBasicMaterial({ color: "#4A3E30", transparent: true, opacity: 0, depthWrite: false });
        const mesh = new three.Mesh(stepGeo, m);
        const along = 2.0 + k * 0.42, side = (k % 2 ? 1 : -1) * 0.14;
        const x = sp.x + ux * along + px * side, z = sp.z + uz * along + pz * side;
        mesh.position.set(x, groundAt(x, z) + 0.05, z); mesh.rotation.y = Math.atan2(ux, uz);
        scene.add(mesh);
        return m;
      });
      return { steps, period: 14 + (ti % 5) * 3, phase: ti * 2.3 };
    });
    anim.push((t) => { for (const tr of trails) { const q = ((t + tr.phase) % tr.period) / 3.2; tr.steps.forEach((m, k) => { const age = q * 8 - k; m.opacity = age < 0 || q > 2 ? 0 : Math.max(0, 0.55 - age * 0.06); }); } });

    // 4) 오래 쓴 물건이 변한 도깨비들 (빗자루·부지깽이·짚신·키·절굿공이)
    function goblin(kind: "broom" | "poker" | "shoe" | "winnow" | "pestle") {
      const g = new three.Group(); scene.add(g);
      if (kind === "broom") { part(CYL6, mat("#8A6A4A"), 0.03, 0.9, 0.03, 0, 0.75, 0, g); const b = part(CONE, mat("#C9B98F"), 0.22, 0.5, 0.12, 0, 0.25, 0, g); b.rotation.x = Math.PI; }
      else if (kind === "poker") { part(CYL6, mat("#3E3530"), 0.04, 1.0, 0.04, 0, 0.5, 0, g); part(BALL, mat("#FF8A3A", { emissive: "#FF5A10", ei: 1 }), 0.06, 0.06, 0.06, 0, 1.0, 0, g); glow("#FF8A3A", 0.6, 0, 1.0, 0, 0.7, g); }
      else if (kind === "shoe") { const s = part(DOME, mat("#C9B98F"), 0.14, 0.12, 0.3, 0, 0.0, 0, g); ink(s, 1.08); }
      else if (kind === "winnow") { const w = part(CYL, mat("#B79E70", { side: true }), 0.4, 0.04, 0.32, 0, 0.6, 0, g); w.rotation.x = 1.2; }
      else { part(CYL6, mat("#8A6A4A"), 0.07, 0.6, 0.07, 0, 0.5, 0, g); part(CYL6, mat("#7A5A3A"), 0.12, 0.25, 0.12, 0, 0.15, 0, g); part(CYL6, mat("#7A5A3A"), 0.12, 0.25, 0.12, 0, 0.85, 0, g); }
      const eyeY = kind === "shoe" ? 0.12 : kind === "broom" ? 0.45 : kind === "winnow" ? 0.75 : 0.6;
      for (const sx of [-0.05, 0.05]) part(BALL, new three.MeshBasicMaterial({ color: "#FFFFFF" }), 0.025, 0.03, 0.02, sx, eyeY, kind === "shoe" ? 0.18 : 0.08, g);
      glow(WISP[0], 1.1, 0, eyeY, 0, 0.35, g);
      return g;
    }
    villages.forEach((v, vi) => {
      const c = centers[vi];
      if (v.id === "kkomul") { // 빗자루 도깨비가 당산나무 둘레를 쓸고, 키 도깨비가 팔랑인다
        const broom = goblin("broom"), winnow = goblin("winnow");
        anim.push((t) => { const a = t * 0.25; const x = c.x + Math.sin(a) * 4.2, z = c.z + Math.cos(a) * 4.2; broom.position.set(x, groundAt(x, z), z); broom.rotation.set(Math.sin(t * 6) * 0.35, a + Math.PI / 2, 0); const b = -t * 0.18 + 2; const x2 = c.x + Math.sin(b) * 6.5, z2 = c.z + Math.cos(b) * 6.5; winnow.position.set(x2, groundAt(x2, z2) + 0.3 + Math.abs(Math.sin(t * 3)) * 0.4, z2); winnow.rotation.y = b; });
      } else if (v.id === "ttukttak") { // 부지깽이 도깨비가 화톳불 사이를 깡충
        const pk = [goblin("poker"), goblin("poker")];
        anim.push((t) => pk.forEach((p, i) => { const a = t * 0.3 + i * Math.PI; const x = c.x + Math.sin(a) * (LOOP_R + 1.2), z = c.z + Math.cos(a) * (LOOP_R + 1.2); p.position.set(x, groundAt(x, z) + Math.abs(Math.sin(t * 5 + i)) * 0.35, z); p.rotation.y = a; }));
      } else if (v.id === "wagle") { // 짚신 도깨비 둘이 씨름판에서 밀고 당기고, 하나는 뛰어다닌다
        const s1 = goblin("shoe"), s2 = goblin("shoe"), s3 = goblin("shoe");
        anim.push((t) => {
          const push = Math.sin(t * 1.4) * 0.35; const ang = Math.atan2(-c.x, -c.z);
          const fx = Math.sin(ang), fz = Math.cos(ang);
          s1.position.set(c.x + fx * (0.5 + push), groundAt(c.x, c.z) + 0.2, c.z + fz * (0.5 + push)); s1.rotation.y = ang + Math.PI;
          s2.position.set(c.x - fx * (0.5 - push), groundAt(c.x, c.z) + 0.2, c.z - fz * (0.5 - push)); s2.rotation.y = ang;
          s1.rotation.z = Math.sin(t * 2.8) * 0.15; s2.rotation.z = -Math.sin(t * 2.8) * 0.15;
          const a = t * 0.35; const x = c.x + Math.sin(a) * (LOOP_R + 1.4), z = c.z + Math.cos(a) * (LOOP_R + 1.4);
          s3.position.set(x, groundAt(x, z) + 0.15 + Math.abs(Math.sin(t * 7)) * 0.15, z); s3.rotation.y = a + Math.PI / 2;
        });
      } else if (v.id === "jjaekkak") { // 절굿공이 도깨비가 서당 길을 또박또박
        const p = goblin("pestle");
        anim.push((t) => { const a = -t * 0.2; const x = c.x + Math.sin(a) * LOOP_R, z = c.z + Math.cos(a) * LOOP_R; p.position.set(x, groundAt(x, z) + Math.abs(Math.sin(t * 4)) * 0.2, z); p.rotation.y = a - Math.PI / 2; });
      } else if (v.id === "kkambbak") { // 갈대밭 위 도깨비불 무리와 반딧불이
        const fl = Array.from({ length: night ? 40 : 16 }, (_, i) => {
          const m = part(BALL, new three.MeshBasicMaterial({ color: "#E9FF9A", transparent: true }), 0.05, 0.05, 0.05);
          return { m, x: c.x + Math.cos(i * 2.4) * (6 + (i % 7) * 2.4), z: c.z + Math.sin(i * 2.4) * (6 + (i % 7) * 2.4), ph: i * 0.9 };
        });
        anim.push((t) => fl.forEach((f) => { const x = f.x + Math.sin(t * 0.4 + f.ph) * 0.8, z = f.z + Math.cos(t * 0.3 + f.ph) * 0.8; f.m.position.set(x, groundAt(x, z) + 0.6 + Math.sin(t * 0.7 + f.ph) * 0.4, z); (f.m.material as T.MeshBasicMaterial).opacity = Math.max(0, Math.sin(t * 1.6 + f.ph)); }));
        if (marsh) {
          const big = Array.from({ length: 7 }, (_, i) => ({ m: part(BALL, new three.MeshBasicMaterial({ color: WISP[i % 2], transparent: true }), 0.15, 0.19, 0.15), gl: glow(WISP[i % 2], 1.8, 0, 0, 0, 0.8), ph: i * 0.9 }));
          anim.push((t) => big.forEach((b) => { const x = marsh.x + Math.sin(t * 0.25 + b.ph) * marsh.r * 0.7, z = marsh.z + Math.cos(t * 0.2 + b.ph * 1.3) * marsh.r * 0.7; const y = 0.5 + Math.sin(t + b.ph) * 0.3; b.m.position.set(x, y, z); b.gl.position.set(x, y, z); }));
        }
      }
    });
  }

  function walkable(x: number, z: number) {
    if (Math.hypot(x, z) > ISLAND_R - 9) return false;
    if (inLake(x, z) && !onBridge(x, z)) return false;
    return solids.every((o) => Math.hypot(x - o.x, z - o.z) > o.r + 0.25);
  }
  /** 지금 서 있는 곳: 다섯 마을 또는 시대 마을 (마을 이름 띠용) */
  function placeAt(x: number, z: number): WorldVillage | null {
    const v = villageAt(x, z); if (v) return v;
    for (const e of ERAS) { const c = eraCenter(e); if (Math.hypot(x - c.x, z - c.z) < ERA_RADIUS + 2) return { id: e.id, name: e.name, topics: e.topics, mood: "", themes: [] }; }
    return null;
  }
  function villageAt(x: number, z: number) {
    let best = -1, bd = 24;
    centers.forEach((c, i) => { const d = Math.hypot(x - c.x, z - c.z); if (d < bd) { bd = d; best = i; } });
    return best < 0 ? null : villages[best];
  }
  /** 소리용: 지금 자리에서 물·불·도깨비불이 얼마나 가까운지 (0~1) */
  function ambienceAt(x: number, z: number) {
    const water = clamp01(1 - (Math.abs(Math.hypot(x, z) - lakeMid) - lakeHalf) / 10);
    let fire = 0; for (const f of firePoints) fire = Math.max(fire, f.loud * clamp01(1 - Math.hypot(x - f.x, z - f.z) / 12));
    let wisp = 0; for (const w of [...wispSpots, ...movingWisps]) wisp = Math.max(wisp, clamp01(1 - Math.hypot(x - w.x, z - w.z) / 6));
    return { water, fire, wisp };
  }
  function setActive(ids: Set<string>) { for (const [id, st] of houseState) st.active = ids.has(id); }
  buildEras({ three, scene, night, part, mat, ink, glow, textSprite, smokeMat, G: { BOX, CYL, CYL6, BALL, CONE, DOME, DISC, TORUS }, solids, anim, spots, nameTags, occluders, firePoints, wispSpots, player });
  return { spots, anim, nameTags, fades, occluders, heightAt, walkable, villageAt, placeAt, setActive, player, ambienceAt };
}
