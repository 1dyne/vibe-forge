import type * as T from "three";

// 도깨비 마을 3D 세계를 짓는다. 가운데 광장(본관 공사장)과 그 둘레 다섯 마을이 하나로 이어진 섬.
// 미술 규칙은 하나(로우폴리·납작한 색·둥근 비율)로 통일하고, 마을마다 색·재료·집 양식·랜드마크·자연물만 바꾼다.

export type WorldHouse = { id: string; nickname: string; theme: string; alleySeq: number; plotNo: number; color: string; peak: number; fuel: number; wants: number; lit: boolean; stage: 1 | 2 | 3; fires: number };
export type WorldVillage = { id: string; name: string; topics: string; mood: string; themes: string[] };
export type Spot = { x: number; z: number; r: number; kind: "house" | "hall" | "plot"; house?: WorldHouse; village?: string; label: string };
export type NameTag = { s: T.Sprite; x: number; z: number; always: boolean };

type Look = {
  grass: string; path: string; wall: string; roof: string; trim: string; accent: string; wood: string;
  gate: string; gateText: string;
};
export const LOOKS: Record<string, Look> = {
  // 꼬물: 세이지 그린·크림, 밝은 목재·회벽
  kkomul: { grass: "#A9CF9A", path: "#E9D7B0", wall: "#F6EEDC", roof: "#8FB79A", trim: "#D9B98C", accent: "#F2A3B3", wood: "#C99A6B", gate: "#C99A6B", gateText: "#FFFFFF" },
  // 뚝딱: 테라코타·황동, 붉은 벽돌·목재·함석
  ttukttak: { grass: "#B8C79A", path: "#C2BAAA", wall: "#C0634A", roof: "#9EA6AA", trim: "#C9A24A", accent: "#C9A24A", wood: "#8B6A4A", gate: "#8E4B37", gateText: "#F6D98A" },
  // 째깍: 남색·회청색, 회색 석재·짙은 목재
  jjaekkak: { grass: "#A3C2AE", path: "#B4BBC4", wall: "#9AA4B0", roof: "#34446E", trim: "#5A4636", accent: "#E8C25A", wood: "#5A4636", gate: "#34446E", gateText: "#F3E6C4" },
  // 와글: 코랄·버터 옐로, 채색 목재·에나멜 금속
  wagle: { grass: "#BCDC98", path: "#F1DDB2", wall: "#FFE39A", roof: "#FF8C7A", trim: "#6FC3E8", accent: "#FF8C7A", wood: "#E7A56B", gate: "#FF8C7A", gateText: "#FFFFFF" },
  // 깜빡: 청록·연보라, 유리·구리·밝은 석재
  kkambbak: { grass: "#9FD0C2", path: "#D3D9DD", wall: "#ECEEF0", roof: "#7FD3CB", trim: "#C27C4E", accent: "#B9A3E3", wood: "#C27C4E", gate: "#3E9C95", gateText: "#FFFFFF" }
};

export const ISLAND_R = 80;
const VILLAGE_D = 38;
const PLAZA_R = 13;
const LOOP_R = 8;
const RINGS = [12.5, 18.5];
const SLOT = 4.9;
// 마을 방향(라디안, 0 = 북쪽 -z). 남쪽 광장 끝에서 출발하면 본관 뒤로 두 마을이 보인다.
const ANGLES = [-0.63, 0.63, 1.88, Math.PI, -1.88];

export function villageCenter(i: number) {
  const a = ANGLES[i];
  return { x: Math.sin(a) * VILLAGE_D, z: -Math.cos(a) * VILLAGE_D, a };
}

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

export function buildWorld(three: typeof T, scene: T.Scene, opts: { houses: WorldHouse[]; villages: WorldVillage[]; alleyNames: Record<string, string>; hallStage: number; hallPct: number; myForgeId: string | null; hasForge: boolean }) {
  const { houses, villages, hallStage, hallPct, myForgeId } = opts;
  const spots: Spot[] = [];
  const solids: Array<{ x: number; z: number; r: number }> = [];
  const anim: Array<(t: number, dt: number) => void> = [];
  const nameTags: NameTag[] = [];
  // 카메라가 가까이 지나가면 투명해지는 것(마을 문)
  const fades: Array<{ x: number; z: number; mats: T.Material[] }> = [];
  const centers = villages.map((_, i) => villageCenter(i));
  const pond = (() => {
    const i = villages.findIndex((v) => v.id === "kkambbak");
    if (i < 0) return null;
    const c = centers[i];
    return { x: c.x + Math.sin(c.a) * 3 + Math.cos(c.a) * 21, z: c.z - Math.cos(c.a) * 3 + Math.sin(c.a) * 21, r: 5.2 };
  })();

  // ── 공용 재료·모양 (같은 건 한 번만 만든다) ──
  const mats = new Map<string, T.Material>();
  const mat = (color: string, o: { emissive?: string; ei?: number; opacity?: number; flat?: boolean; side?: boolean } = {}) => {
    const key = JSON.stringify([color, o]);
    let m = mats.get(key);
    if (!m) {
      m = new three.MeshStandardMaterial({ color, roughness: 0.85, flatShading: o.flat ?? true, emissive: o.emissive ?? "#000000", emissiveIntensity: o.ei ?? 0, transparent: o.opacity !== undefined, opacity: o.opacity ?? 1, side: o.side ? three.DoubleSide : three.FrontSide });
      mats.set(key, m);
    }
    return m;
  };
  const geos = new Map<string, T.BufferGeometry>();
  const geo = (key: string, make: () => T.BufferGeometry) => { let g = geos.get(key); if (!g) { g = make(); geos.set(key, g); } return g; };
  const BOX = geo("box", () => new three.BoxGeometry(1, 1, 1));
  const CYL = geo("cyl", () => new three.CylinderGeometry(1, 1, 1, 10));
  const CYL6 = geo("cyl6", () => new three.CylinderGeometry(1, 1, 1, 6));
  const BALL = geo("ball", () => new three.IcosahedronGeometry(1, 1));
  const CONE4 = geo("cone4", () => { const g = new three.ConeGeometry(1, 1, 4); g.rotateY(Math.PI / 4); return g; });
  const CONE = geo("cone", () => new three.ConeGeometry(1, 1, 8));
  const DOME = geo("dome", () => new three.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2));
  const GABLE = geo("gable", () => {
    const s = new three.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0);
    const g = new three.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g;
  });
  const TORUS = geo("torus", () => new three.TorusGeometry(1, 0.12, 6, 16));
  const DISC = geo("disc", () => { const g = new three.CircleGeometry(1, 20); g.rotateX(-Math.PI / 2); return g; });

  function part(g: T.BufferGeometry, m: T.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, parent?: T.Object3D) {
    const mesh = new three.Mesh(g, m);
    mesh.scale.set(sx, sy, sz); mesh.position.set(x, y, z);
    (parent ?? scene).add(mesh);
    return mesh;
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
  function textBoard(text: string, w: number, h: number, bg: string, fg: string, font = 60, both = true) {
    const c = document.createElement("canvas");
    c.width = Math.round(w * 128); c.height = Math.round(h * 128);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = fg; ctx.font = `${font}px Jua, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, c.width / 2, c.height / 2 + 4);
    const tex = new three.CanvasTexture(c); tex.colorSpace = three.SRGBColorSpace;
    return new three.Mesh(new three.PlaneGeometry(w, h), new three.MeshBasicMaterial({ map: tex, side: both ? three.DoubleSide : three.FrontSide }));
  }

  // ── 땅: 높낮이 + 마을별 풀색 + 길 ──
  const spokes = centers.map((c) => ({ ax: Math.sin(c.a) * (PLAZA_R - 1), az: -Math.cos(c.a) * (PLAZA_R - 1), bx: Math.sin(c.a) * (VILLAGE_D - LOOP_R), bz: -Math.cos(c.a) * (VILLAGE_D - LOOP_R) }));
  const outerLoop = villages.map((v) => houses.filter((h) => v.themes.includes(h.theme)).length > ringCapacity(RINGS[0]));
  const bumps: Array<[number, number, number, number]> = [];
  ANGLES.forEach((a) => {
    const b = a + 0.63 * (a === Math.PI ? 1 : 1);
    bumps.push([Math.sin(b) * 47, -Math.cos(b) * 47, 3.2, 6]);
    bumps.push([Math.sin(a) * 66, -Math.cos(a) * 66, 4, 8]);
    bumps.push([Math.sin(a + 0.3) * 58, -Math.cos(a + 0.3) * 58, 2.2, 5]);
  });

  function builtDist(x: number, z: number) {
    let d = Math.hypot(x, z) - PLAZA_R - 2;
    for (const s of spokes) d = Math.min(d, segDist(x, z, s.ax, s.az, s.bx, s.bz) - 2.5);
    for (const c of centers) d = Math.min(d, Math.hypot(x - c.x, z - c.z) - 22);
    return d;
  }
  function heightAt(x: number, z: number) {
    const free = clamp01(builtDist(x, z) / 5);
    let h = 0;
    if (free > 0) {
      for (const [bx, bz, amp, sig] of bumps) h += amp * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (2 * sig * sig));
      h += 0.35 * Math.sin(x * 0.21) * Math.cos(z * 0.17);
      h *= free;
    }
    if (pond) { const d = Math.hypot(x - pond.x, z - pond.z); if (d < pond.r + 2) h -= 1.3 * (1 - clamp01((d - pond.r + 1.2) / 3)); }
    const r = Math.hypot(x, z);
    if (r > ISLAND_R - 10) h -= ((r - (ISLAND_R - 10)) / 10) ** 2 * 2.6;
    return h;
  }
  function pathMix(x: number, z: number): { color: string; w: number } | null {
    const r = Math.hypot(x, z);
    let best: { color: string; w: number } | null = null;
    const take = (color: string, w: number) => { if (w > 0 && (!best || w > best.w)) best = { color, w: Math.min(1, w) }; };
    take(r > 4.6 && r < 6.6 ? "#E2D3B4" : "#EFE6D2", (PLAZA_R - r) / 0.8);
    for (let i = 0; i < centers.length; i++) {
      const look = LOOKS[villages[i].id];
      const s = spokes[i];
      take(look.path, (1.6 - segDist(x, z, s.ax, s.az, s.bx, s.bz)) / 0.7);
      const dc = Math.hypot(x - centers[i].x, z - centers[i].z);
      take(look.path, (1.4 - Math.abs(dc - LOOP_R)) / 0.7);
      if (outerLoop[i]) take(look.path, (1.2 - Math.abs(dc - (RINGS[0] + RINGS[1]) / 2)) / 0.7);
    }
    return best;
  }
  function pathAt(x: number, z: number) { const p = pathMix(x, z); return p && p.w > 0.3 ? p.color : null; }

  {
    const SIZE = ISLAND_R * 2 + 6, SEG = 240;
    const g = new three.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as T.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const tmp = new three.Color(), acc = new three.Color();
    const grassCols = villages.map((v) => new three.Color(LOOKS[v.id].grass));
    const plazaGrass = new three.Color("#B3D3A4"), sand = new three.Color("#EBD9AE"), wet = new three.Color("#C9B98F");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      const r = Math.hypot(x, z);
      // 마을 풀색을 거리로 섞는다
      let wsum = Math.exp(-((r / 16) ** 2)) * 0.7;
      acc.copy(plazaGrass).multiplyScalar(wsum);
      centers.forEach((c, k) => { const w = Math.exp(-(((x - c.x) ** 2 + (z - c.z) ** 2) / (2 * 15 * 15))); wsum += w; acc.add(tmp.copy(grassCols[k]).multiplyScalar(w)); });
      acc.multiplyScalar(1 / Math.max(wsum, 1e-4));
      const p = pathMix(x, z);
      if (p) acc.lerp(tmp.set(p.color), 0.92 * p.w);
      if (h > 1.2) acc.lerp(tmp.set("#9BBF86"), clamp01((h - 1.2) / 3) * 0.5);
      if (r > ISLAND_R - 11) acc.lerp(sand, clamp01((r - (ISLAND_R - 11)) / 3));
      if (h < -0.4) acc.lerp(wet, 0.8);
      // 아주 살짝 얼룩(손으로 칠한 느낌)
      const n = (Math.sin(x * 1.7 + z * 0.9) + Math.sin(z * 2.3 - x * 0.4)) * 0.012;
      colors[i * 3] = acc.r + n; colors[i * 3 + 1] = acc.g + n; colors[i * 3 + 2] = acc.b + n;
    }
    g.setAttribute("color", new three.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const ground = new three.Mesh(g, new three.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    scene.add(ground);
    const sea = new three.Mesh(new three.CircleGeometry(260, 48), new three.MeshStandardMaterial({ color: "#8ED2E3", roughness: 0.6 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.55; scene.add(sea);
    if (pond) {
      const water = new three.Mesh(new three.CircleGeometry(pond.r + 0.6, 28), new three.MeshStandardMaterial({ color: "#7CCBD6", roughness: 0.3, emissive: "#2C7F8C", emissiveIntensity: 0.15 }));
      water.rotation.x = -Math.PI / 2; water.position.set(pond.x, -0.42, pond.z); scene.add(water);
      solids.push({ x: pond.x, z: pond.z, r: pond.r + 0.4 });
      // 연잎
      const rr = rng(77);
      for (let i = 0; i < 6; i++) { const a = rr() * 6.28, d = rr() * pond.r * 0.8; part(DISC, mat("#5FAF7E"), 0.45, 1, 0.45, pond.x + Math.cos(a) * d, -0.38, pond.z + Math.sin(a) * d); }
    }
  }

  // ── 자연물·소품 ──
  function tree(x: number, z: number, kind: "round" | "apple" | "ginkgo" | "bush" | "pine", s = 1) {
    const y = heightAt(x, z);
    const g = new three.Group(); g.position.set(x, y, z); g.scale.setScalar(s); g.rotation.y = (x * 13 + z * 7) % 6.28; scene.add(g);
    if (kind === "bush") { part(BALL, mat("#6DB57E"), 0.9, 0.7, 0.9, 0, 0.5, 0, g); part(BALL, mat("#7CC48B"), 0.6, 0.5, 0.6, 0.6, 0.45, 0.3, g); return; }
    part(CYL6, mat("#8B6A4A"), 0.18, 1.3, 0.18, 0, 0.65, 0, g);
    if (kind === "pine") { part(CONE, mat("#4E9A6E"), 1, 1.8, 1, 0, 1.9, 0, g); part(CONE, mat("#5DAF7C"), 0.75, 1.4, 0.75, 0, 2.7, 0, g); }
    else if (kind === "ginkgo") { part(CONE, mat("#F2C14E"), 1.1, 2.2, 1.1, 0, 2.1, 0, g); part(BALL, mat("#F6D06B"), 0.7, 0.6, 0.7, 0.3, 2.9, 0, g); }
    else {
      part(BALL, mat(kind === "apple" ? "#79B866" : "#73B781"), 1.2, 1.0, 1.2, 0, 2.0, 0, g);
      part(BALL, mat(kind === "apple" ? "#86C374" : "#7FC28C"), 0.8, 0.7, 0.8, 0.5, 2.5, 0.2, g);
      if (kind === "apple") for (let i = 0; i < 5; i++) { const a = i * 1.3; part(BALL, mat("#E2574C"), 0.13, 0.13, 0.13, Math.cos(a) * 1.05, 1.8 + (i % 2) * 0.4, Math.sin(a) * 1.05, g); }
    }
    solids.push({ x, z, r: 0.55 * s });
  }
  function flowers(x: number, z: number, colors: string[], n = 6, spread = 0.9) {
    const r = rng(Math.round(x * 100 + z * 7));
    for (let i = 0; i < n; i++) {
      const fx = x + (r() - 0.5) * spread * 2, fz = z + (r() - 0.5) * spread * 2, y = heightAt(fx, fz);
      part(CYL6, mat("#5E9E5E"), 0.03, 0.35, 0.03, fx, y + 0.17, fz);
      part(BALL, mat(colors[i % colors.length]), 0.12, 0.1, 0.12, fx, y + 0.38, fz);
    }
  }
  function localFence(g: T.Group, x: number, z: number, len: number, color: string) {
    const n = Math.max(2, Math.round(len / 0.6));
    for (let i = 0; i < n; i++) { if (i === Math.floor(n / 2)) continue; part(BOX, mat(color), 0.09, 0.55, 0.09, x - len / 2 + (i * len) / (n - 1), 0.27, z, g); }
    part(BOX, mat(color), len / 2 - 0.4, 0.06, 0.05, x - len / 4 - 0.2, 0.42, z, g); part(BOX, mat(color), len / 2 - 0.4, 0.06, 0.05, x + len / 4 + 0.2, 0.42, z, g);
  }
  function lamp(x: number, z: number, post: string, light = "#FFD27A") {
    const y = heightAt(x, z);
    part(CYL6, mat(post), 0.07, 2.2, 0.07, x, y + 1.1, z);
    part(BALL, mat(light, { emissive: light, ei: 0.7 }), 0.2, 0.24, 0.2, x, y + 2.3, z);
    solids.push({ x, z, r: 0.3 });
  }
  function grassTuft(x: number, z: number, color: string, h = 0.6) {
    const y = heightAt(x, z);
    for (let i = 0; i < 4; i++) { const m = part(CONE, mat(color), 0.07, h, 0.07, x + (i % 2) * 0.12 - 0.06, y + h / 2, z + (i > 1 ? 0.1 : -0.1)); m.rotation.z = (i - 1.5) * 0.18; }
  }

  // ── 집: 마을 양식 5종 × 성장 3단계 ──
  function chimney(g: T.Group, x: number, y: number, z: number, color: string, h: WorldHouse) {
    part(BOX, mat(color), 0.38, 0.9, 0.38, x, y, z, g);
    const fl = part(BALL, mat("#FF8F3F", { emissive: "#FF6A1F", ei: 0.9 }), 0.18, 0.28, 0.18, x, y + 0.6, z, g);
    const ph = (h.peak % 7);
    anim.push((t) => { fl.scale.y = 0.28 + Math.sin(t * 6 + ph) * 0.05; });
    if (h.fuel > 0) {
      // 받은 장작이 있으면 굴뚝 연기
      const puffs = Array.from({ length: Math.min(4, 1 + h.fuel) }, (_, i) => ({ m: part(BALL, mat("#F4F1EA", { opacity: 0.75 }), 0.22, 0.22, 0.22, x, y + 0.8, z, g), o: i * 0.9 }));
      anim.push((t) => { for (const p of puffs) { const k = ((t * 0.45 + p.o) % 3.6) / 3.6; p.m.position.set(x + k * 0.5, y + 0.8 + k * 2.2, z); p.m.scale.setScalar(0.18 + k * 0.35); (p.m.material as T.MeshStandardMaterial).opacity = 0.75 * (1 - k); } });
    }
  }
  function windowsOf(h: WorldHouse) {
    const glow = h.lit || h.fuel > 0;
    return glow ? mat("#FFD983", { emissive: "#FFB84D", ei: Math.min(1, 0.35 + h.fuel * 0.15) }) : mat("#D8E2E6");
  }

  function house(h: WorldHouse, style: string, x: number, z: number, face: number) {
    const look = LOOKS[style];
    const st = h.stage;
    const g = new three.Group();
    g.position.set(x, heightAt(x, z), z); g.rotation.y = face; g.scale.setScalar([0.86, 1, 1.12][st - 1]);
    scene.add(g);
    const win = windowsOf(h);
    const door = mat(look.wood);
    const rnd = rng(hashOf(h.id));
    const wallTint = new three.Color(look.wall).offsetHSL(0, 0, (rnd() - 0.5) * 0.06).getStyle();
    const roofTint = new three.Color(look.roof).offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.08).getStyle();

    if (style === "kkomul") {
      part(BOX, mat(wallTint), 2.5, 1.6, 2.2, 0, 0.8, 0, g);
      part(GABLE, mat(roofTint), 2.9, 1.25, 2.6, 0, 1.6, 0, g);
      part(BOX, door, 0.6, 1.0, 0.06, 0.5, 0.5, 1.11, g);
      part(CYL, win, 0.28, 0.06, 0.28, -0.55, 1.0, 1.11, g).rotation.x = Math.PI / 2;
      localFence(g, 0, 2.4, 3.2, look.trim); // 앞마당 울타리
      if (st >= 2) { chimney(g, -0.75, 2.2, -0.4, "#D9CBB5", h); part(BOX, mat(look.wood), 0.9, 0.2, 0.25, -0.55, 0.62, 1.2, g); for (let i = 0; i < 3; i++) part(BALL, mat(["#F2A3B3", "#FFD27A", "#B9A3E3"][i]), 0.1, 0.1, 0.1, -0.85 + i * 0.3, 0.78, 1.2, g); }
      if (st >= 3) { part(BOX, mat(wallTint), 1.4, 1.2, 1.7, 1.85, 0.6, -0.1, g); part(GABLE, mat(roofTint), 1.7, 0.8, 1.9, 1.85, 1.2, -0.1, g); part(BOX, mat("#BFE3D6", { opacity: 0.7 }), 1.0, 0.7, 1.2, -1.8, 0.35, 0.2, g); }
    } else if (style === "ttukttak") {
      part(BOX, mat(wallTint), 2.7, 1.9, 2.2, 0, 0.95, 0, g);
      const roof = part(BOX, mat(roofTint), 3.1, 0.14, 2.7, 0, 2.05, 0, g); roof.rotation.x = -0.18;
      for (let i = 0; i < 6; i++) part(BOX, mat("#8D9599"), 0.04, 0.05, 2.7, -1.3 + i * 0.52, 2.13, 0, g).rotation.x = -0.18; // 함석 골
      part(BOX, door, 0.8, 1.15, 0.06, -0.5, 0.58, 1.11, g);
      part(BOX, win, 0.8, 0.6, 0.06, 0.6, 1.0, 1.11, g);
      const awn = part(BOX, mat(look.trim), 2.4, 0.06, 0.8, 0, 1.55, 1.45, g); awn.rotation.x = 0.35;
      const gear = part(TORUS, mat(look.accent), 0.3, 0.3, 0.3, 0, 1.75, 1.14, g);
      anim.push((t) => { gear.rotation.z = t * 0.8; });
      if (st >= 2) { chimney(g, 0.95, 2.3, -0.6, "#8E4B37", h); part(BOX, mat(look.wood), 0.5, 0.45, 0.5, 1.6, 0.23, 1.3, g); part(BOX, mat(look.wood), 0.4, 0.38, 0.4, 1.65, 0.65, 1.3, g); }
      if (st >= 3) { part(BOX, mat(wallTint), 1.7, 1.1, 1.5, -0.4, 2.6, -0.3, g); const r2 = part(BOX, mat(roofTint), 2.0, 0.12, 1.8, -0.4, 3.25, -0.3, g); r2.rotation.x = -0.18; const g2 = part(TORUS, mat(look.accent), 0.45, 0.45, 0.45, -0.4, 2.7, 0.47, g); anim.push((t) => { g2.rotation.z = -t; }); }
    } else if (style === "jjaekkak") {
      part(BOX, mat(wallTint), 2.0, 2.5, 2.0, 0, 1.25, 0, g);
      part(CONE4, mat(roofTint), 1.75, 1.9, 1.75, 0, 3.45, 0, g);
      part(BOX, door, 0.62, 1.1, 0.06, 0, 0.55, 1.01, g);
      part(BOX, win, 0.38, 0.5, 0.06, -0.55, 1.6, 1.01, g); part(BOX, win, 0.38, 0.5, 0.06, 0.55, 1.6, 1.01, g);
      const face = part(CYL, mat("#F6F1E4"), 0.3, 0.05, 0.3, 0, 2.2, 1.02, g); face.rotation.x = Math.PI / 2;
      const hand = part(BOX, mat("#34446E"), 0.04, 0.22, 0.03, 0, 2.27, 1.06, g);
      anim.push((t) => { hand.rotation.z = -t * 0.5; hand.position.set(Math.sin(t * 0.5) * 0.08, 2.2 + Math.cos(t * 0.5) * 0.08, 1.06); });
      if (st >= 2) { chimney(g, 0.6, 3.1, -0.5, "#7D8794", h); part(CYL6, mat(look.trim), 0.06, 1.9, 0.06, -1.3, 0.95, 1.5, g); part(BALL, mat("#FFE6A3", { emissive: "#FFD27A", ei: 0.7 }), 0.17, 0.2, 0.17, -1.3, 2.0, 1.5, g); }
      if (st >= 3) { part(CYL, mat(wallTint), 0.6, 3.6, 0.6, 1.35, 1.8, -0.3, g); part(CONE, mat(roofTint), 0.75, 1.4, 0.75, 1.35, 4.3, -0.3, g); }
    } else if (style === "wagle") {
      part(CYL, mat(wallTint), 1.35, 1.8, 1.35, 0, 0.9, 0, g);
      part(TORUS, mat(look.roof), 1.36, 1.36, 0.6, 0, 1.0, 0, g).rotation.x = Math.PI / 2;
      part(CONE, mat(roofTint), 1.7, 1.4, 1.7, 0, 2.5, 0, g);
      part(BOX, door, 0.62, 1.05, 0.06, 0, 0.52, 1.36, g);
      part(CYL, win, 0.22, 0.06, 0.22, -0.75, 1.25, 1.12, g).rotation.x = Math.PI / 2;
      const wheel = new three.Group(); wheel.position.set(0, 3.25, 0.1); g.add(wheel);
      ["#6FC3E8", "#FFD27A", "#FF8C7A", "#9ED36A"].forEach((c, i) => { const b = part(BOX, mat(c), 0.12, 0.5, 0.04, 0, 0.25, 0, wheel); const holder = new three.Group(); holder.rotation.z = (i * Math.PI) / 2; holder.add(b); wheel.add(holder); });
      anim.push((t) => { wheel.rotation.z = t * 2.4; });
      if (st >= 2) chimney(g, 0.7, 2.4, -0.5, "#E7A56B", h);
      if (st >= 3) {
        part(CYL, mat(look.roof), 0.7, 2.6, 0.7, 1.65, 1.3, -0.2, g); part(CONE, mat(look.wall), 0.9, 0.9, 0.9, 1.65, 3.05, -0.2, g);
        const balloon = part(BALL, mat("#6FC3E8"), 0.35, 0.42, 0.35, -1.4, 3.4, 0.6, g); part(CYL6, mat("#FFFFFF"), 0.01, 1.6, 0.01, -1.4, 2.4, 0.6, g);
        anim.push((t) => { balloon.position.y = 3.4 + Math.sin(t * 1.5) * 0.12; });
      }
    } else {
      // 깜빡: 밝은 석재 + 유리 돔 + 구리 테 + 깜빡이는 안테나
      part(BOX, mat(wallTint), 2.4, 1.6, 2.2, 0, 0.8, 0, g);
      part(DOME, mat(look.roof, { opacity: 0.6 }), 1.15, 1.0, 1.15, 0, 1.6, 0, g);
      part(TORUS, mat(look.trim), 1.15, 1.15, 0.6, 0, 1.6, 0, g).rotation.x = Math.PI / 2;
      part(BOX, door, 0.6, 1.0, 0.06, 0.55, 0.5, 1.11, g);
      part(BOX, win, 0.6, 0.45, 0.06, -0.5, 1.0, 1.11, g);
      part(CYL6, mat(look.trim), 0.03, 1.0, 0.03, -0.9, 2.1, -0.7, g);
      const blink = part(BALL, mat(look.accent, { emissive: look.accent, ei: 1 }), 0.1, 0.1, 0.1, -0.9, 2.65, -0.7, g);
      const off = rnd() * 3;
      anim.push((t) => { blink.visible = Math.sin(t * 3 + off) > -0.2; });
      if (st >= 2) chimney(g, 0.9, 1.9, -0.6, look.trim, h);
      if (st >= 3) { const scope = part(CYL, mat(look.trim), 0.16, 1.5, 0.16, -0.3, 2.4, 0.1, g); scope.rotation.x = -0.9; part(BOX, mat("#CFEDEA", { opacity: 0.6 }), 1.3, 0.9, 1.3, 1.95, 0.45, 0.2, g); }
    }

    // 간판(모든 집) + 떠 있는 도깨비불
    part(CYL6, mat(look.wood), 0.05, 0.9, 0.05, 1.45, 0.45, 1.6, g);
    part(BOX, mat(look.trim), 0.7, 0.4, 0.06, 1.45, 0.95, 1.6, g);
    const orb = part(BALL, mat(h.color, { emissive: h.color, ei: 0.9 }), 0.16, 0.2, 0.16, 1.45, 1.55, 1.6, g);
    const ph = rnd() * 6;
    anim.push((t) => { orb.position.y = 1.55 + Math.sin(t * 2 + ph) * 0.1; });
    if (h.wants >= 5) { part(CYL6, mat("#555"), 0.03, 1.5, 0.03, -1.3, 2.4, 0.9, g); part(BOX, mat("#9B7BFF", { side: true }), 0.6, 0.35, 0.02, -1.0, 2.95, 0.9, g); }

    const mine = h.id === myForgeId;
    if (mine) { const ring = part(TORUS, mat("#FF8F3F", { emissive: "#FF8F3F", ei: 0.6 }), 2.2, 2.2, 0.4, 0, 0.05, 0, g); ring.rotation.x = Math.PI / 2; }
    const tag = textSprite(mine ? "내 대장간" : h.nickname, mine ? { bg: "#1E1F24", fg: "#fff" } : {});
    tag.position.set(x, heightAt(x, z) + 4.4, z);
    scene.add(tag);
    nameTags.push({ s: tag, x, z, always: mine });
    solids.push({ x, z, r: 1.55 * g.scale.x });
    spots.push({ x, z, r: 3.2, kind: "house", house: h, label: mine ? "내 대장간" : `${h.nickname}의 대장간` });
  }

  function vacantPlot(x: number, z: number, face: number, village: string) {
    const g = new three.Group(); g.position.set(x, heightAt(x, z), z); g.rotation.y = face; scene.add(g);
    const look = LOOKS[village];
    for (const [px, pz] of [[-1.2, -1], [1.2, -1], [-1.2, 1], [1.2, 1]]) part(BOX, mat(look.wood), 0.1, 0.5, 0.1, px, 0.25, pz, g);
    part(BOX, mat("#FFFFFF"), 2.4, 0.04, 0.02, 0, 0.42, 1, g);
    part(BOX, mat("#FFFFFF"), 2.4, 0.04, 0.02, 0, 0.42, -1, g);
    part(CYL6, mat(look.wood), 0.05, 1.1, 0.05, 0, 0.55, 1.3, g);
    const board = textBoard("빈 터", 0.9, 0.42, "#FFFFFF", "#1E1F24", 44); board.position.set(0, 1.05, 1.33); g.add(board);
    spots.push({ x, z, r: 2.6, kind: "plot", village, label: "빈 터" });
  }

  function signpost(x: number, z: number, text: string, look: Look) {
    const y = heightAt(x, z);
    part(CYL6, mat(look.wood), 0.07, 1.8, 0.07, x, y + 0.9, z);
    const b = textBoard(text, 1.9, 0.5, look.gate, look.gateText, 52); b.position.set(x, y + 1.55, z);
    b.lookAt(0, y + 1.55, 0);
    scene.add(b);
  }

  function ringCapacity(r: number) { return Math.floor((Math.PI * 2 * r - 6) / SLOT); }

  // ── 마을마다: 문, 랜드마크, 집, 자연물 ──
  villages.forEach((v, i) => {
    const c = centers[i];
    const look = LOOKS[v.id];
    const toPlaza = Math.atan2(-c.x, -c.z); // 마을 중심에서 광장을 보는 각도(x=sin, z=cos 기준)

    // 마을 문
    {
      const gd = 18.5;
      const gx = Math.sin(c.a) * gd, gz = -Math.cos(c.a) * gd;
      const side = { x: Math.cos(c.a), z: Math.sin(c.a) };
      const y = heightAt(gx, gz);
      const gateMat = new three.MeshStandardMaterial({ color: look.gate, roughness: 0.85, flatShading: true, transparent: true });
      const fadeMats: T.Material[] = [gateMat];
      for (const s of [-1, 1]) { part(BOX, gateMat, 0.35, 3.6, 0.35, gx + side.x * 2.3 * s, y + 1.8, gz + side.z * 2.3 * s); solids.push({ x: gx + side.x * 2.3 * s, z: gz + side.z * 2.3 * s, r: 0.45 }); }
      const bar = part(BOX, gateMat, 5.4, 0.3, 0.4, gx, y + 3.6, gz); bar.rotation.y = -c.a;
      for (const flip of [0, Math.PI]) { const plate = textBoard(v.name, 3.2, 0.9, look.gate, look.gateText, 84, false); (plate.material as T.MeshBasicMaterial).transparent = true; fadeMats.push(plate.material as T.Material); plate.position.set(gx, y + 3.05, gz); plate.rotation.y = -c.a + flip; plate.translateZ(0.21); scene.add(plate); }
      fades.push({ x: gx, z: gz, mats: fadeMats });
    }

    landmark(v.id, c.x, c.z, look, toPlaza);

    // 집 배치: 안쪽 고리 → 바깥 고리. 광장 쪽 입구는 비운다.
    const list = houses.filter((h) => v.themes.includes(h.theme)).sort((a, b) => a.theme.localeCompare(b.theme) || a.alleySeq - b.alleySeq || a.plotNo - b.plotNo);
    const slots: Array<{ x: number; z: number; face: number; ang: number; ring: number }> = [];
    RINGS.forEach((r, ri) => {
      const n = ringCapacity(r);
      const gap = 3.2 / r;
      const step = (Math.PI * 2 - gap * 2) / n;
      for (let k = 0; k < n; k++) {
        const ang = toPlaza + gap + step * (k + 0.5);
        const x = c.x + Math.sin(ang) * r, z = c.z + Math.cos(ang) * r;
        if (pond && Math.hypot(x - pond.x, z - pond.z) < pond.r + 3) continue;
        slots.push({ x, z, face: ang + Math.PI, ang, ring: ri });
      }
    });
    let lastTheme = "";
    list.slice(0, slots.length).forEach((h, k) => {
      const s = slots[k];
      if (h.theme !== lastTheme) {
        lastTheme = h.theme;
        const r = RINGS[s.ring] - 3.4, a = s.ang - 0.22;
        signpost(c.x + Math.sin(a) * r, c.z + Math.cos(a) * r, opts.alleyNames[h.theme] ?? h.theme, look);
      }
      house(h, v.id, s.x, s.z, s.face);
    });
    if (list.length > slots.length) {
      const t = textSprite(`${v.name} · ${list.length}채`, { bg: look.gate, fg: look.gateText, size: 48, scale: 1 });
      t.position.set(c.x, 9, c.z); scene.add(t);
    }
    const vacant = Math.max(0, Math.min(slots.length - list.length, list.length < 4 ? 4 - list.length + 2 : 0));
    for (let k = 0; k < vacant; k++) { const s = slots[list.length + k]; vacantPlot(s.x, s.z, s.face, v.id); }

    // 자연물: 마을 바깥 테두리와 고리 사이 빈 곳
    const r = rng(i * 101 + 5);
    const occupied = (x: number, z: number, pad: number) => solids.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad) || pathAt(x, z) !== null || Math.hypot(x, z) < PLAZA_R + 1;
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
      scatter(10, 21, 30, (x, z) => tree(x, z, "apple", 0.9 + r() * 0.4));
      scatter(6, 20, 30, (x, z) => tree(x, z, "round", 1 + r() * 0.5));
      between((x, z) => flowers(x, z, ["#F2A3B3", "#FFFFFF", "#FFD27A", "#B9A3E3"], 7), 10);
      between((x, z) => { const y = heightAt(x, z); for (let q = 0; q < 5; q++) part(DISC, mat("#6FB06A"), 0.28, 1, 0.28, x + (q % 3) * 0.3 - 0.3, y + 0.04, z + Math.floor(q / 3) * 0.3); }, 8); // 클로버
    } else if (v.id === "ttukttak") {
      scatter(8, 21, 30, (x, z) => tree(x, z, "round", 0.9 + r() * 0.4));
      between((x, z) => { const y = heightAt(x, z); part(CYL, mat("#8B6A4A"), 0.35, 0.8, 0.35, x, y + 0.4, z); part(TORUS, mat("#5A4636"), 0.36, 0.36, 0.5, x, y + 0.6, z).rotation.x = Math.PI / 2; solids.push({ x, z, r: 0.5 }); }, 6); // 나무통
      between((x, z) => { const y = heightAt(x, z); part(BOX, mat("#B28A5A"), 0.7, 0.6, 0.7, x, y + 0.3, z); solids.push({ x, z, r: 0.5 }); }, 6); // 상자
      between((x, z) => { const y = heightAt(x, z); const m = part(TORUS, mat(look.accent), 0.45, 0.45, 0.6, x, y + 0.45, z); m.rotation.y = r() * 3; }, 4); // 굴러다니는 톱니
      for (let k = 0; k < 6; k++) { const a = k * 1.05; lamp(c.x + Math.sin(a) * (LOOP_R + 1.8), c.z + Math.cos(a) * (LOOP_R + 1.8), "#4A4A4A"); }
    } else if (v.id === "jjaekkak") {
      scatter(12, 20, 30, (x, z) => tree(x, z, "ginkgo", 0.9 + r() * 0.4));
      between((x, z) => grassTuft(x, z, "#D9D2C0", 0.7), 14, 0.5); // 억새
      for (let k = 0; k < 6; k++) { const a = k * 1.05 + 0.5; lamp(c.x + Math.sin(a) * (LOOP_R + 1.8), c.z + Math.cos(a) * (LOOP_R + 1.8), "#34446E", "#FFE6A3"); }
    } else if (v.id === "wagle") {
      scatter(10, 20, 31, (x, z) => tree(x, z, "bush", 1 + r() * 0.6));
      scatter(4, 22, 30, (x, z) => tree(x, z, "round", 1));
      between((x, z) => flowers(x, z, ["#FFE066", "#FFFFFF"], 8), 12); // 민들레
      between((x, z) => { const y = heightAt(x, z); const col = ["#6FC3E8", "#FF8C7A", "#FFD27A"][Math.floor(r() * 3)]; const b = part(BALL, mat(col), 0.35, 0.35, 0.35, x, y + 0.35, z); const o = r() * 6; anim.push((t) => { b.position.y = y + 0.35 + Math.abs(Math.sin(t * 2 + o)) * 0.5; }); }, 5); // 통통 튀는 공
    } else {
      scatter(8, 21, 30, (x, z) => tree(x, z, "pine", 0.9 + r() * 0.4));
      if (pond) for (let k = 0; k < 16; k++) { const a = k * 0.4, d = pond.r + 0.6 + (k % 3) * 0.3; grassTuft(pond.x + Math.cos(a) * d, pond.z + Math.sin(a) * d, "#9C8A5E", 1.0); }
      between((x, z) => { const y = heightAt(x, z); part(DISC, mat("#7DB88A"), 0.6 + r() * 0.5, 1, 0.5 + r() * 0.4, x, y + 0.03, z); }, 10); // 이끼
      between((x, z) => { // 반짝이는 신호등
        const y = heightAt(x, z); part(CYL6, mat("#C27C4E"), 0.05, 1.3, 0.05, x, y + 0.65, z);
        const cols = ["#7FD3CB", "#B9A3E3", "#FFD27A"]; const bulbs = cols.map((cc, q) => part(BALL, mat(cc, { emissive: cc, ei: 1 }), 0.1, 0.1, 0.1, x, y + 1.0 + q * 0.2, z));
        const o = r() * 5; anim.push((t) => { const on = Math.floor(t * 1.5 + o) % 3; bulbs.forEach((b, q) => { b.visible = q === on; }); }); solids.push({ x, z, r: 0.3 });
      }, 5);
    }
  });

  // 마을 사이 언덕·해변 나무
  {
    const r = rng(9);
    for (let k = 0; k < 70; k++) {
      const a = r() * Math.PI * 2, d = 26 + r() * 46;
      const x = Math.sin(a) * d, z = -Math.cos(a) * d;
      if (builtDist(x, z) < 2 || Math.hypot(x, z) > ISLAND_R - 11) continue;
      if (solids.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 1.5)) continue;
      tree(x, z, r() < 0.5 ? "pine" : "round", 1 + r() * 0.7);
    }
  }

  // ── 랜드마크 ──
  function landmark(id: string, x: number, z: number, look: Look, a: number) {
    const y = heightAt(x, z);
    const g = new three.Group(); g.position.set(x, y, z); g.rotation.y = a; scene.add(g); // 앞면이 광장을 본다
    if (id === "kkomul") {
      // 거대한 나무 아래 둥근 공동 쉼터
      part(CYL, mat("#8B6A4A"), 1.0, 7, 1.0, 0, 3.5, 0, g);
      for (const [cx, cy, cz, s] of [[0, 8, 0, 4.2], [2.6, 7, 1, 2.8], [-2.4, 7.2, -0.8, 3], [0.6, 9.6, -1.4, 2.6], [-0.8, 6.6, 2.4, 2.4]]) part(BALL, mat(["#7FBF7A", "#8ECB86", "#73B36E"][Math.round(cx + cz) & 1]), s, s * 0.8, s, cx, cy, cz, g);
      part(CYL, mat(look.trim), 4.2, 0.2, 4.2, 0, 0.1, 0, g);
      part(TORUS, mat(look.wood), 2.6, 2.6, 2.4, 0, 0.55, 0, g).rotation.x = Math.PI / 2; // 둥근 의자
      for (let k = 0; k < 6; k++) { const q = (k / 6) * Math.PI * 2; const l = part(BALL, mat("#FFE6A3", { emissive: "#FFD27A", ei: 0.8 }), 0.18, 0.22, 0.18, Math.cos(q) * 3, 4.6, Math.sin(q) * 3, g); const o = k; anim.push((t) => { l.position.y = 4.6 + Math.sin(t * 1.4 + o) * 0.08; }); }
      solids.push({ x, z, r: 3.4 });
    } else if (id === "ttukttak") {
      // 커다란 톱니바퀴가 돌아가는 풍차
      part(CYL, mat(look.wall), 1.3, 7, 1.7, 0, 3.5, 0, g);
      part(CONE, mat(look.roof), 1.6, 1.6, 1.6, 0, 7.8, 0, g);
      const hub = new three.Group(); hub.position.set(0, 6.4, 1.6); hub.rotation.y = 0; g.add(hub);
      for (let k = 0; k < 4; k++) { const arm = new three.Group(); arm.rotation.z = (k * Math.PI) / 2; hub.add(arm); part(BOX, mat("#F3E6C4"), 0.8, 3.4, 0.08, 0.3, 1.9, 0, arm); part(BOX, mat(look.wood), 0.12, 3.8, 0.12, 0, 1.9, 0, arm); }
      const gear = new three.Group(); gear.position.set(1.9, 2.6, 0); gear.rotation.y = Math.PI / 2; g.add(gear);
      part(TORUS, mat(look.accent), 1.4, 1.4, 2.4, 0, 0, 0, gear);
      for (let k = 0; k < 10; k++) { const q = (k / 10) * Math.PI * 2; const tth = part(BOX, mat(look.accent), 0.3, 0.45, 0.3, Math.cos(q) * 1.65, Math.sin(q) * 1.65, 0, gear); tth.rotation.z = q; }
      anim.push((t) => { hub.rotation.z = t * 0.7; gear.rotation.z = -t * 0.5; });
      solids.push({ x, z, r: 2.6 });
    } else if (id === "jjaekkak") {
      // 커다란 시계탑 (실제 시각)
      part(BOX, mat(look.wall), 3, 11, 3, 0, 5.5, 0, g);
      part(BOX, mat(look.trim), 3.4, 0.4, 3.4, 0, 11, 0, g);
      for (const hy of [3.2, 6.4]) part(BOX, mat("#B8C0CA"), 3.12, 0.25, 3.12, 0, hy, 0, g);
      for (let k = 0; k < 4; k++) { const f = new three.Group(); f.rotation.y = (k * Math.PI) / 2; g.add(f); part(BOX, mat("#FFD983", { emissive: "#FFB84D", ei: 0.35 }), 0.5, 0.9, 0.06, 0, 4.8, 1.52, f); part(BOX, mat(look.roof), 0.9, 1.6, 0.06, 0, 0.8, 1.52, f); }
      part(CONE4, mat(look.roof), 2.6, 3, 2.6, 0, 12.7, 0, g);
      for (let k = 0; k < 4; k++) { const st = part(BOX, mat("#B8BEC6"), 3.4 - k * 0.3, 0.3, 0.8, 0, 0.15 + k * 0.3, 1.9 + (3 - k) * 0.5, g); st.position.z = 1.9 + (3 - k) * 0.55 - 1.4; } // 돌계단
      const hands: Array<{ h: T.Object3D; m: T.Object3D }> = [];
      for (let k = 0; k < 4; k++) {
        const face = new three.Group(); face.rotation.y = (k * Math.PI) / 2; g.add(face);
        const disc = part(CYL, mat("#F6F1E4"), 1.1, 0.08, 1.1, 0, 8.6, 1.52, face); disc.rotation.x = Math.PI / 2;
        for (let q = 0; q < 12; q++) { const tk = part(BOX, mat(look.roof), 0.07, 0.2, 0.03, Math.sin((q / 12) * 6.283) * 0.9, 8.6 + Math.cos((q / 12) * 6.283) * 0.9, 1.57, face); tk.rotation.z = -(q / 12) * 6.283; }
        const hp = new three.Group(); hp.position.set(0, 8.6, 1.6); face.add(hp); part(BOX, mat(look.roof), 0.12, 0.55, 0.04, 0, 0.27, 0, hp);
        const mp = new three.Group(); mp.position.set(0, 8.6, 1.63); face.add(mp); part(BOX, mat(look.roof), 0.08, 0.85, 0.04, 0, 0.42, 0, mp);
        hands.push({ h: hp, m: mp });
      }
      const bell = part(CONE, mat(look.accent), 0.6, 0.8, 0.6, 0, 10.2, 0, g);
      anim.push((t) => {
        const d = new Date(); const m = d.getMinutes() + d.getSeconds() / 60, h = (d.getHours() % 12) + m / 60;
        for (const p of hands) { p.h.rotation.z = -(h / 12) * Math.PI * 2; p.m.rotation.z = -(m / 60) * Math.PI * 2; }
        bell.rotation.z = Math.sin(t * 2) * 0.15;
      });
      solids.push({ x, z, r: 2.5 });
    } else if (id === "wagle") {
      // 여러 방향으로 움직이는 거대한 태엽 장난감
      const body = new three.Group(); g.add(body);
      part(BOX, mat(look.roof), 3.2, 2.6, 2.4, 0, 2.6, 0, body);
      part(BOX, mat(look.wall), 2.4, 1.8, 2.0, 0, 4.8, 0, body);
      for (const s of [-1, 1]) { part(BALL, mat("#FFFFFF"), 0.35, 0.35, 0.2, s * 0.55, 5.0, 1.0, body); part(BALL, mat("#1E1F24"), 0.15, 0.15, 0.1, s * 0.55, 5.0, 1.15, body); }
      part(CYL6, mat("#6FC3E8"), 0.05, 1.2, 0.05, 0, 6.3, 0, body); const ant = part(BALL, mat("#FFD27A", { emissive: "#FFD27A", ei: 0.6 }), 0.25, 0.25, 0.25, 0, 7, 0, body);
      const legs = [-1, 1].map((s) => { const l = new three.Group(); l.position.set(s * 0.9, 1.3, 0); body.add(l); part(CYL, mat("#6FC3E8"), 0.35, 1.3, 0.35, 0, -0.6, 0, l); part(BOX, mat(look.roof), 0.8, 0.3, 1.1, 0, -1.2, 0.2, l); return l; });
      const arms = [-1, 1].map((s) => { const l = new three.Group(); l.position.set(s * 1.8, 3.4, 0); body.add(l); part(CYL, mat("#6FC3E8"), 0.25, 1.4, 0.25, 0, -0.6, 0, l); part(BALL, mat(look.wall), 0.4, 0.4, 0.4, 0, -1.35, 0, l); return l; });
      const key = new three.Group(); key.position.set(0, 3, -1.4); body.add(key); part(CYL, mat(look.accent), 0.12, 0.8, 0.12, 0, 0, -0.3, key).rotation.x = Math.PI / 2;
      part(TORUS, mat("#FFD27A"), 0.5, 0.5, 1, 0.6, 0, -0.7, key).rotation.y = Math.PI / 2; part(TORUS, mat("#FFD27A"), 0.5, 0.5, 1, -0.6, 0, -0.7, key).rotation.y = Math.PI / 2;
      anim.push((t) => {
        key.rotation.z = t * 2; body.position.y = Math.abs(Math.sin(t * 3)) * 0.25; body.rotation.y = Math.sin(t * 0.6) * 0.6;
        legs[0].rotation.x = Math.sin(t * 3) * 0.4; legs[1].rotation.x = -Math.sin(t * 3) * 0.4;
        arms[0].rotation.x = -Math.sin(t * 3) * 0.6; arms[1].rotation.x = Math.sin(t * 3) * 0.6; ant.position.y = 7 + Math.sin(t * 6) * 0.08;
      });
      solids.push({ x, z, r: 2.6 });
    } else {
      // 커다란 풍향계가 달린 관측탑
      for (const [px, pz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) { const leg = part(BOX, mat(look.trim), 0.22, 8, 0.22, px * 0.8, 4, pz * 0.8, g); leg.rotation.z = px * 0.04; leg.rotation.x = -pz * 0.04; }
      for (let k = 1; k < 4; k++) part(BOX, mat(look.trim), 2.2, 0.12, 2.2, 0, k * 2, 0, g);
      part(CYL, mat(look.wall), 1.8, 1.4, 1.8, 0, 8.6, 0, g);
      part(DOME, mat(look.roof, { opacity: 0.65 }), 1.7, 1.5, 1.7, 0, 9.3, 0, g);
      const vane = new three.Group(); vane.position.set(0, 11.6, 0); g.add(vane);
      part(CYL6, mat(look.trim), 0.05, 1.4, 0.05, 0, -0.6, 0, vane);
      part(BOX, mat(look.trim), 0.1, 0.1, 2.4, 0, 0.1, 0, vane);
      part(CONE, mat(look.accent), 0.25, 0.5, 0.25, 0, 0.1, 1.3, vane).rotation.x = Math.PI / 2;
      part(BOX, mat(look.accent, { side: true }), 0.04, 0.6, 0.6, 0, 0.1, -1.1, vane);
      const scope = part(CYL, mat(look.trim), 0.25, 2, 0.25, 0.9, 9.6, 0.6, g); scope.rotation.x = -0.7; scope.rotation.z = -0.4;
      const beacon = part(BALL, mat(look.accent, { emissive: look.accent, ei: 1 }), 0.25, 0.25, 0.25, 0, 12.5, 0, g);
      anim.push((t) => { vane.rotation.y = Math.sin(t * 0.3) * 1.2 + Math.sin(t * 1.3) * 0.2; beacon.visible = (t * 1.2) % 1 < 0.5; });
      solids.push({ x, z, r: 2.3 });
    }
  }

  // ── 광장: 본관 공사장 + 소식판 + 가로등 + 벤치 ──
  {
    const hall = new three.Group(); scene.add(hall);
    part(BOX, mat("#D9D2C3"), 6, 0.3, 5, 0, 0.15, 0, hall);
    if (hallStage >= 1) for (const [px, pz] of [[-2.7, -2.2], [2.7, -2.2], [-2.7, 2.2], [2.7, 2.2], [0, -2.2], [0, 2.2]]) part(BOX, mat("#8B6A4A"), 0.32, 3.4, 0.32, px, 1.85, pz, hall);
    if (hallStage >= 2) part(GABLE, mat("#E2574C"), 6.8, 2.2, 5.6, 0, 3.55, 0, hall);
    if (hallStage >= 3) { part(BOX, mat("#9E9E9E"), 0.7, 1.6, 0.7, 1.8, 5, -0.8, hall); }
    if (hallStage >= 4) part(BOX, mat("#F6F5F1"), 5.4, 3.2, 4.4, 0, 1.9, 0, hall);
    if (hallStage < 4) {
      // 공사 중: 비계·가림막·자재
      const fence = new three.Mesh(new three.CylinderGeometry(4.4, 4.4, 1.0, 28, 1, true), mat("#FFC48A", { opacity: 0.88, side: true }));
      fence.position.y = 0.5; hall.add(fence);
      for (let k = 0; k < 14; k++) { const q = (k / 14) * Math.PI * 2; if (k % 2) continue; part(BOX, mat("#FFFFFF"), 0.06, 1.02, 0.5, Math.cos(q) * 4.42, 0.5, Math.sin(q) * 4.42, hall).rotation.y = -q; }
      part(BOX, mat("#C99A6B"), 1.6, 0.25, 0.7, 3.2, 1.2, -2.6, hall); part(BOX, mat("#C99A6B"), 1.6, 0.25, 0.7, 3.25, 1.45, -2.5, hall);
      const crane = new three.Group(); crane.position.set(-3, 0, -2.8); hall.add(crane);
      part(BOX, mat("#FFC14D"), 0.3, 8, 0.3, 0, 4, 0, crane);
      const jib = new three.Group(); jib.position.y = 8; crane.add(jib); part(BOX, mat("#FFC14D"), 6, 0.25, 0.25, 2, 0, 0, jib); part(CYL6, mat("#444"), 0.02, 2.5, 0.02, 4.4, -1.25, 0, jib); part(BOX, mat("#8B6A4A"), 0.5, 0.3, 0.5, 4.4, -2.6, 0, jib);
      anim.push((t) => { jib.rotation.y = Math.sin(t * 0.25) * 0.8; });
    }
    const lbl = textSprite(`달그락 대장간 본관 · 공사 ${hallPct}%`, { bg: "#FF8F3F", fg: "#1E1F24", size: 46, scale: 1 });
    lbl.position.set(0, 9.5, 0); scene.add(lbl);
    nameTags.push({ s: lbl, x: 0, z: 0, always: true });
    solids.push({ x: 0, z: 0, r: 4.7 });
    spots.push({ x: 0, z: 0, r: 7.2, kind: "hall", label: "달그락 대장간 본관" });

    // 소식판
    const nb = new three.Group(); nb.position.set(-5.6, 0, 8.4); nb.rotation.y = 0.55; scene.add(nb);
    part(BOX, mat("#8B6A4A"), 0.16, 2.2, 0.16, -1, 1.1, 0, nb); part(BOX, mat("#8B6A4A"), 0.16, 2.2, 0.16, 1, 1.1, 0, nb);
    const board = textBoard("광장 소식판", 2.3, 1.2, "#F6EEDC", "#5A4636", 56); board.position.set(0, 1.6, 0.05); nb.add(board);
    solids.push({ x: -5.6, z: 8.4, r: 1.2 });
    // 가로등·벤치·화단
    for (let k = 0; k < 5; k++) { const q = ANGLES[k] + 0.63; lamp(Math.sin(q) * 10.8, -Math.cos(q) * 10.8, "#5A4636"); }
    for (const q of [0.95, -0.95, 2.4, -2.4]) { const bx = Math.sin(q) * 8.8, bz = -Math.cos(q) * 8.8; const b = new three.Group(); b.position.set(bx, 0, bz); b.rotation.y = -q; scene.add(b); part(BOX, mat("#C99A6B"), 1.6, 0.12, 0.5, 0, 0.45, 0, b); part(BOX, mat("#C99A6B"), 1.6, 0.4, 0.08, 0, 0.75, -0.22, b); part(BOX, mat("#5A4636"), 0.1, 0.45, 0.4, -0.65, 0.22, 0, b); part(BOX, mat("#5A4636"), 0.1, 0.45, 0.4, 0.65, 0.22, 0, b); solids.push({ x: bx, z: bz, r: 0.8 }); }
    flowers(5.8, 8.2, ["#FF8C7A", "#FFD27A", "#B9A3E3"], 12, 1.0);
  }

  // ── 떠다니는 도깨비불 ──
  {
    const cols = ["#9B7BFF", "#FF8F3F", "#3FBF6E", "#4FB3A6"];
    const wisps = Array.from({ length: 22 }, (_, i) => {
      const c = cols[i % 4];
      const m = part(BALL, new three.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 }), 0.2, 0.24, 0.2);
      return { m, r: 8 + ((i * 37) % 50), a: i * 1.7, s: (0.03 + ((i * 13) % 10) / 120) * (i % 2 ? -1 : 1), y: 2 + (i % 4) * 0.8 };
    });
    anim.push((t, dt) => { for (const w of wisps) { w.a += w.s * dt; const x = Math.cos(w.a) * w.r, z = Math.sin(w.a) * w.r; w.m.position.set(x, heightAt(x, z) + w.y + Math.sin(t + w.r) * 0.4, z); } });
  }

  function walkable(x: number, z: number) {
    if (Math.hypot(x, z) > ISLAND_R - 9) return false;
    return solids.every((o) => Math.hypot(x - o.x, z - o.z) > o.r + 0.25);
  }
  function villageAt(x: number, z: number) {
    let best = -1, bd = 24;
    centers.forEach((c, i) => { const d = Math.hypot(x - c.x, z - c.z); if (d < bd) { bd = d; best = i; } });
    return best < 0 ? null : villages[best];
  }

  return { spots, anim, nameTags, fades, heightAt, walkable, villageAt };
}
