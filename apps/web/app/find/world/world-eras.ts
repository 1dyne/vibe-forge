import type * as T from "three";

// 시대 마을: 도깨비는 '오래 쓴 물건'이 변한 존재라서, 물건이 쌓인 시간만큼 마을이 이어진다.
//   선사시대 불씨 언덕(처음 불을 피운 곳) → 한옥 다섯 마을(조선) → 1970–80년대 연탄 골목 → 2000년대 초 PC방 골목.
// 지금은 한국 사회의 시간만 둔다(나중에 인류사로 넓힐 수 있게 시대를 목록으로 둔다).
// 시대 마을에는 주민 대장간이 없다. 그 시대 물건이 변한 도깨비들이 산다.

export type Era = { id: string; name: string; period: string; topics: string; angle: number; ground: string; alley: string | null };
export const ERAS: Era[] = [
  { id: "prehistory", name: "불씨 언덕", period: "선사시대", topics: "사람이 처음 불을 피운 곳 · 모든 도깨비불은 여기서 처음 피어났대", angle: 0, ground: "#7E8A5E", alley: "#8A7556" },
  { id: "modern", name: "연탄 골목", period: "1970–80년대", topics: "연탄 때던 시절 · 브라운관과 다이얼 전화기가 도깨비가 된 골목", angle: 2.51, ground: "#8C8A82", alley: "#A3A098" },
  { id: "y2k", name: "PC방 골목", period: "2000년대 초", topics: "삐삐와 폴더폰의 시절 · 걸어다니는 C언어를 만날 수 있어", angle: -2.51, ground: "#6E6C72", alley: "#56545C" }
];
export const ERA_R = 84;      // 섬 가운데서 시대 마을 가운데까지
export const ERA_RADIUS = 16; // 시대 마을 반지름

export function eraCenter(e: Era) { return { x: Math.sin(e.angle) * ERA_R, z: -Math.cos(e.angle) * ERA_R }; }
/** 월드 좌표 → 그 시대 마을의 로컬 좌표(+z = 섬 가운데 쪽 입구) */
export function toLocal(e: Era, x: number, z: number) {
  const c = eraCenter(e), dx = x - c.x, dz = z - c.z, th = -e.angle;
  return { lx: dx * Math.cos(th) - dz * Math.sin(th), lz: dx * Math.sin(th) + dz * Math.cos(th) };
}
/** 땅 색: 시대 마을 바닥과 골목길 */
export function eraTint(x: number, z: number): { color: string; w: number } | null {
  for (const e of ERAS) {
    const c = eraCenter(e); const d = Math.hypot(x - c.x, z - c.z);
    if (d > ERA_RADIUS + 4) continue;
    const { lx, lz } = toLocal(e, x, z);
    if (e.alley && Math.abs(lx) < 2.3 && lz > -12 && lz < ERA_RADIUS + 3) return { color: e.alley, w: 1 };
    return { color: e.ground, w: Math.max(0, Math.min(1, (ERA_RADIUS + 4 - d) / 4)) };
  }
  return null;
}

type Spot = { x: number; z: number; r: number; kind: "npc"; label: string; line: string };
export type EraCtx = {
  three: typeof T; scene: T.Scene; night: boolean;
  part: (g: T.BufferGeometry, m: T.Material, sx: number, sy: number, sz: number, x?: number, y?: number, z?: number, parent?: T.Object3D) => T.Mesh;
  mat: (color: string, o?: { emissive?: string; ei?: number; opacity?: number; flat?: boolean; side?: boolean }) => T.Material;
  ink: (m: T.Mesh, k?: number) => void;
  glow: (color: string, size: number, x: number, y: number, z: number, opacity?: number, parent?: T.Object3D) => T.Sprite;
  textSprite: (text: string, o?: { bg?: string; fg?: string; size?: number; scale?: number }) => T.Sprite;
  smokeMat: () => T.MeshStandardMaterial;
  G: { BOX: T.BufferGeometry; CYL: T.BufferGeometry; CYL6: T.BufferGeometry; BALL: T.BufferGeometry; CONE: T.BufferGeometry; DOME: T.BufferGeometry; DISC: T.BufferGeometry; TORUS: T.BufferGeometry };
  solids: Array<{ x: number; z: number; r: number }>;
  anim: Array<(t: number, dt: number) => void>;
  spots: Array<{ x: number; z: number; r: number; kind: string; label: string; line?: string }>;
  nameTags: Array<{ s: T.Sprite; x: number; z: number; always: boolean }>;
  occluders: T.Object3D[];
  firePoints: Array<{ x: number; z: number; loud: number }>;
  wispSpots: Array<{ x: number; z: number }>;
  player: { x: number; z: number };
};

export function buildEras(c: EraCtx) {
  const { three, part, mat, ink, glow, G } = c;
  const { BOX, CYL, CYL6, BALL, CONE, DOME, DISC, TORUS } = G;
  const AMBER = "#F2A65A";

  // 캔버스 간판: 빛을 받지 않는 재질이라 해 질 녘에도 또렷하다
  function sign(text: string, w: number, h: number, bg: string, fg: string, font = 64, border?: string) {
    const cv = document.createElement("canvas"); cv.width = Math.round(w * 128); cv.height = Math.round(h * 128);
    const x = cv.getContext("2d")!;
    x.fillStyle = bg; x.fillRect(0, 0, cv.width, cv.height);
    if (border) { x.strokeStyle = border; x.lineWidth = 8; x.strokeRect(6, 6, cv.width - 12, cv.height - 12); }
    x.fillStyle = fg; x.font = `${font}px Jua, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(text, cv.width / 2, cv.height / 2 + 4);
    const tex = new three.CanvasTexture(cv); tex.colorSpace = three.SRGBColorSpace;
    return new three.Mesh(new three.PlaneGeometry(w, h), new three.MeshBasicMaterial({ map: tex, transparent: true, side: three.DoubleSide }));
  }

  // ── 움직이는 물건 도깨비: 다가가면 한마디 ──
  function npc(name: string, line: string, body: T.Object3D, path: (t: number) => { x: number; z: number; y?: number; ry?: number }) {
    c.scene.add(body);
    const eye = new three.MeshBasicMaterial({ color: "#FFFFFF" });
    const box = new three.Box3().setFromObject(body); const top = box.max.y - body.position.y;
    for (const sx of [-0.06, 0.06]) { const m = part(BALL, eye, 0.03, 0.035, 0.02, sx, top * 0.7, 0.16, body); m.renderOrder = 2; }
    glow("#7FE0D2", 1.0, 0, top * 0.6, 0, 0.3, body);
    const spot: Spot = { x: 0, z: 0, r: 2.6, kind: "npc", label: name, line };
    c.spots.push(spot);
    c.anim.push((t) => { const p = path(t); body.position.set(p.x, p.y ?? 0, p.z); body.rotation.y = p.ry ?? 0; spot.x = p.x; spot.z = p.z; });
  }
  /** 시대 마을 로컬 원을 도는 경로 */
  const circle = (e: Era, r: number, speed: number, phase = 0, hop = 0) => (t: number) => {
    const ctr = eraCenter(e), th = -e.angle, a = t * speed + phase;
    const lx = Math.sin(a) * r, lz = Math.cos(a) * r;
    const x = ctr.x + lx * Math.cos(th) + lz * Math.sin(th), z = ctr.z - lx * Math.sin(th) + lz * Math.cos(th);
    return { x, z, y: Math.abs(Math.sin(t * 6 + phase)) * hop, ry: a + th + (speed > 0 ? Math.PI / 2 : -Math.PI / 2) };
  };
  const E = (id: string) => ERAS.find((e) => e.id === id)!;

  // ── 선사시대: 불씨 언덕 ──
  function prehistory(g: T.Group, at: (lx: number, lz: number, ry?: number) => T.Group, solid: (lx: number, lz: number, r: number) => void, w: (lx: number, lz: number) => T.Vector3) {
    // 가운데 큰 모닥불: 돌을 둘러 쌓은 화덕, 연기 기둥은 멀리서도 보인다
    const fire = at(0, 0);
    for (let k = 0; k < 12; k++) { const q = (k / 12) * Math.PI * 2; part(BALL, mat(["#7A766C", "#8C877C"][k % 2]), 0.38, 0.28, 0.34, Math.cos(q) * 1.6, 0.14, Math.sin(q) * 1.6, fire); }
    for (let k = 0; k < 6; k++) { const l = part(CYL6, mat("#5A4030"), 0.09, 1.6, 0.09, Math.cos(k) * 0.35, 0.55, Math.sin(k) * 0.35, fire); l.rotation.set(Math.sin(k) * 0.55, 0, Math.cos(k) * 0.55); }
    const flames = [0, 1, 2].map((i) => part(CONE, mat(i === 1 ? "#FFD27A" : "#FF9A3A", { emissive: i === 1 ? "#FFB84D" : "#FF6A1F", ei: 1.1 }), 0.45 - i * 0.08, 1.4 - i * 0.2, 0.45 - i * 0.08, (i - 1) * 0.3, 0.9, (i % 2) * 0.2, fire));
    const big = glow(AMBER, 9, 0, 1.4, 0, 0.85, fire);
    const puffs = Array.from({ length: 8 }, (_, i) => ({ m: part(BALL, c.smokeMat(), 0.5, 0.5, 0.5, 0, 2, 0, fire), o: i / 8 }));
    // 불에서 도깨비불이 하나씩 피어올라 마을 쪽으로 흩어진다
    const sparks = Array.from({ length: 6 }, (_, i) => ({ m: part(BALL, new three.MeshBasicMaterial({ color: i % 2 ? "#B9A3E3" : "#7FE0D2", transparent: true }), 0.13, 0.17, 0.13, 0, 0, 0, fire), gl: glow(i % 2 ? "#B9A3E3" : "#7FE0D2", 1.3, 0, 0, 0, 0.7, fire), o: i / 6 }));
    c.anim.push((t) => {
      flames.forEach((f, i) => { f.scale.y = (1.4 - i * 0.2) * (1 + Math.sin(t * 8 + i * 2) * 0.18); });
      big.material.opacity = 0.75 + Math.sin(t * 7) * 0.1;
      puffs.forEach((p) => { const k = (t * 0.07 + p.o) % 1; p.m.position.set(Math.sin(k * 6) * 0.6 + k * 2, 2 + k * 16, 0); p.m.scale.setScalar(0.5 + k * 2.6); (p.m.material as T.MeshStandardMaterial).opacity = 0.55 * (1 - k); });
      sparks.forEach((s, i) => { const k = (t * 0.06 + s.o) % 1; const r = k * 9, a = i * 1.05 + k * 2; const x = Math.sin(a) * r, z = Math.cos(a) * r, y = 1.6 + Math.sin(k * Math.PI) * 4; s.m.position.set(x, y, z); s.gl.position.set(x, y, z); (s.m.material as T.MeshBasicMaterial).opacity = 1 - k * 0.6; });
    });
    solid(0, 0, 2.1);
    const fw = w(0, 0); c.firePoints.push({ x: fw.x, z: fw.z, loud: 1 }); c.wispSpots.push({ x: fw.x, z: fw.z });
    // 움집 다섯: 땅을 파고 원뿔 지붕을 덮은 집, 입구는 불을 향한다
    for (let k = 0; k < 5; k++) {
      const q = Math.PI * 0.35 + (k / 4) * Math.PI * 1.3; const lx = Math.sin(q) * 8.5, lz = Math.cos(q) * 8.5;
      const h = at(lx, lz, q + Math.PI);
      const roofM = part(CONE, mat(["#9C8458", "#A89062"][k % 2]), 2.1, 2.7, 2.1, 0, 1.25, 0, h); ink(roofM, 1.05);
      part(BOX, mat("#2A2118"), 0.7, 0.9, 0.2, 0, 0.45, 1.75, h); // 입구
      part(CYL6, mat("#6E5236"), 0.05, 0.6, 0.05, 0, 2.75, 0, h); // 꼭대기 서까래
      solid(lx, lz, 2.0);
    }
    // 고인돌: 탁자식(북방식) 하나, 바둑판식 하나
    { const d = at(-9.5, -8, 0.4); part(BOX, mat("#8C877C"), 0.45, 1.7, 2.0, -1.0, 0.85, 0, d); part(BOX, mat("#857F72"), 0.45, 1.7, 2.0, 1.0, 0.85, 0, d); const cap = part(BOX, mat("#9A958A"), 3.6, 0.5, 2.8, 0, 1.95, 0, d); ink(cap, 1.04); solid(-9.5, -8, 2.0); }
    { const d = at(9.5, -9, -0.5); for (const [px, pz] of [[-0.9, -0.6], [0.9, -0.6], [-0.9, 0.6], [0.9, 0.6]]) part(BALL, mat("#7A766C"), 0.35, 0.3, 0.35, px, 0.25, pz, d); const cap = part(BALL, mat("#9A958A"), 2.0, 0.55, 1.6, 0, 0.75, 0, d); ink(cap, 1.04); solid(9.5, -9, 2.0); }
    // 선돌 셋
    for (const [lx, lz, h] of [[-12, 4, 3.6], [12, 3, 3.0], [0, -13, 4.2]]) { const s = at(lx, lz); const m = part(BOX, mat("#8C877C"), 0.6, h, 0.45, 0, h / 2, 0, s); m.rotation.z = 0.05; ink(m, 1.06); solid(lx, lz, 0.6); }
    // 빗살무늬토기(바닥이 뾰족한 그릇)와 조개무지
    for (let k = 0; k < 4; k++) { const q = k * 1.4 + 0.6; const s = at(Math.sin(q) * 4.2, Math.cos(q) * 4.2, q); const j = part(CONE, mat("#9C6B4E"), 0.3, 0.7, 0.3, 0, 0.32, 0, s); j.rotation.x = Math.PI; for (let r = 0; r < 3; r++) part(TORUS, mat("#6E4A36"), 0.27 - r * 0.06, 0.27 - r * 0.06, 0.4, 0, 0.55 - r * 0.15, 0, s).rotation.x = Math.PI / 2; }
    { const s = at(6, 11); for (let k = 0; k < 14; k++) part(DISC, mat("#E8E2D2"), 0.18, 1, 0.14, ((k * 37) % 10) / 6 - 0.8, 0.06 + (k % 3) * 0.08, ((k * 53) % 10) / 7 - 0.7, s); }
    for (let k = 0; k < 30; k++) { const q = k * 2.4, r = 5 + (k % 9) * 1.2; const s = at(Math.sin(q) * r, Math.cos(q) * r); for (let i = 0; i < 3; i++) { const b = part(CONE, mat("#8FA06A"), 0.06, 0.9, 0.06, (i - 1) * 0.1, 0.45, 0, s); b.rotation.z = (i - 1) * 0.2; } }
    // 이 시대 물건 도깨비
    const pot = new three.Group(); const pj = part(CONE, mat("#9C6B4E"), 0.22, 0.5, 0.22, 0, 0.3, 0, pot); pj.rotation.x = Math.PI; ink(pj, 1.08);
    npc("빗살무늬토기 도깨비", "나는 이 땅에서 제일 오래된 그릇이야. 바닥이 뾰족해서 모래에 꽂아 썼지.", pot, circle(E("prehistory"), 5.5, 0.25, 0, 0.25));
    const axe = new three.Group(); part(CYL6, mat("#6E5236"), 0.035, 0.8, 0.035, 0, 0.5, 0, axe); const head = part(BOX, mat("#7A766C"), 0.3, 0.16, 0.08, 0.1, 0.85, 0, axe); ink(head, 1.1);
    npc("간석기 도끼 도깨비", "돌을 갈아서 날을 세웠어. 처음 장작을 팬 것도 나야.", axe, circle(E("prehistory"), 11.5, -0.18, 1.5, 0.15));
  }

  // ── 1970–80년대: 연탄 골목 ──
  function modern(g: T.Group, at: (lx: number, lz: number, ry?: number) => T.Group, solid: (lx: number, lz: number, r: number) => void, w: (lx: number, lz: number) => T.Vector3) {
    const wallC = ["#D9D3C4", "#CFC7B4", "#E2DCCB", "#C9C2B0"];
    const gateC = ["#3E7A5E", "#3E5E8A", "#5E7A3E", "#4A6E8A"];
    function slateHouse(lx: number, lz: number, side: 1 | -1, k: number, shop?: { label: string; bg: string; fg: string }) {
      const h = at(lx, lz, side > 0 ? -Math.PI / 2 : Math.PI / 2); // 골목 쪽을 본다
      part(BOX, mat(wallC[k % 4]), 4.2, 2.4, 3.4, 0, 1.2, 0, h);
      for (const s of [-1, 1]) { const r = part(BOX, mat("#8E9296"), 4.6, 0.08, 2.0, 0, 2.75, s * 0.85, h); r.rotation.x = s * 0.42; for (let i = 0; i < 9; i++) { const rib = part(BOX, mat("#7A7E82"), 0.04, 0.05, 2.0, -2.1 + i * 0.52, 2.79, s * 0.85, h); rib.rotation.x = s * 0.42; } } // 골 슬레이트 지붕
      if (shop) {
        part(BOX, mat("#F3E7C9", { emissive: "#FFC27A", ei: 0.7 }), 3.0, 1.5, 0.06, 0, 0.95, 1.72, h); // 미닫이 유리문
        for (let i = 0; i < 4; i++) part(BOX, mat("#4A4A4A"), 0.05, 1.5, 0.08, -1.5 + i, 0.95, 1.74, h);
        const s = sign(shop.label, 3.2, 0.7, shop.bg, shop.fg, 64); s.position.set(0, 2.05, 1.76); h.add(s);
        glow("#FFC27A", 3, 0, 1.0, 2.0, 0.6, h);
      } else {
        part(BOX, mat(gateC[k % 4]), 1.2, 1.7, 0.08, 0.9, 0.85, 1.72, h); // 철 대문
        part(BOX, mat("#F3E7C9", { emissive: "#FFC27A", ei: c.night ? 0.8 : 0.45 }), 0.9, 0.7, 0.05, -1.0, 1.4, 1.72, h); // 창
        // 연탄 더미
        for (let i = 0; i < 6; i++) part(CYL, mat("#2A2828"), 0.2, 0.15, 0.2, -1.6 + (i % 3) * 0.42, 0.08 + Math.floor(i / 3) * 0.16, 1.95, h);
        for (let i = 0; i < 3; i++) part(CYL, mat("#B8B2A8"), 0.2, 0.15, 0.2, 1.8, 0.08 + i * 0.16, 2.0, h); // 연탄재
      }
      solid(lx, lz, 2.6);
    }
    slateHouse(-6.5, 9, 1, 0, { label: "구멍가게", bg: "#2E5E8A", fg: "#FFFFFF" });
    slateHouse(-6.5, 3, 1, 1);
    slateHouse(-6.5, -3, 1, 2, { label: "이발소", bg: "#F3EEE3", fg: "#2A2118" });
    slateHouse(6.5, 9, -1, 3);
    slateHouse(6.5, -3, -1, 0);
    // 전파사(랜드마크): 브라운관 텔레비전이 벽처럼 쌓여 지직거린다
    {
      const h = at(6.5, 3, -Math.PI / 2);
      part(BOX, mat("#D9D3C4"), 4.2, 2.6, 3.4, 0, 1.3, 0, h);
      for (const s of [-1, 1]) { const r = part(BOX, mat("#8E9296"), 4.6, 0.08, 2.0, 0, 2.95, s * 0.85, h); r.rotation.x = s * 0.42; }
      const sg = sign("전파사", 3.0, 0.75, "#FFD24A", "#2A2118", 70, "#2A2118"); sg.position.set(0, 2.3, 1.76); h.add(sg);
      const screens: T.MeshStandardMaterial[] = [];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        part(BOX, mat("#6E5A44"), 0.95, 0.75, 0.6, -1.05 + i * 1.05, 0.45 + j * 0.8, 1.95, h);
        const sm = new three.MeshStandardMaterial({ color: "#9FB8C8", emissive: "#9FD8FF", emissiveIntensity: 0.6, roughness: 0.4 });
        screens.push(sm); const sc = new three.Mesh(BOX, sm); sc.scale.set(0.7, 0.55, 0.04); sc.position.set(-1.05 + i * 1.05, 0.45 + j * 0.8, 2.27); h.add(sc);
      }
      glow("#9FD8FF", 4, 0, 0.9, 2.4, 0.5, h);
      c.anim.push((t) => screens.forEach((m, i) => { m.emissiveIntensity = 0.45 + Math.abs(Math.sin(t * (3 + i) + i)) * 0.5; m.emissive.setHSL(((t * 0.05 + i * 0.13) % 1), 0.25, 0.6); }));
      solid(6.5, 3, 2.6);
    }
    // 이발소 회전 간판
    {
      const cv = document.createElement("canvas"); cv.width = 32; cv.height = 128; const x = cv.getContext("2d")!;
      for (let i = -4; i < 12; i++) { x.fillStyle = ["#C8443A", "#FFFFFF", "#2F5F9E", "#FFFFFF"][((i % 4) + 4) % 4]; x.beginPath(); x.moveTo(0, i * 16); x.lineTo(32, i * 16 - 16); x.lineTo(32, i * 16); x.lineTo(0, i * 16 + 16); x.fill(); }
      const tex = new three.CanvasTexture(cv); tex.wrapS = tex.wrapT = three.RepeatWrapping; tex.colorSpace = three.SRGBColorSpace;
      const pole = new three.Mesh(new three.CylinderGeometry(0.16, 0.16, 1.1, 14), new three.MeshBasicMaterial({ map: tex }));
      const p = at(-4.2, -1.2); pole.position.y = 1.6; p.add(pole); part(CYL6, mat("#555"), 0.05, 1.1, 0.05, 0, 0.55, 0, p);
      c.anim.push((t) => { tex.offset.y = (t * 0.4) % 1; });
    }
    // 평상과 아이스크림 냉장고 (가게 앞)
    { const s = at(-3.4, 9.6); part(BOX, mat("#9C7A58"), 1.6, 0.08, 1.0, 0, 0.42, 0, s); for (const [px, pz] of [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]]) part(BOX, mat("#5E4430"), 0.07, 0.42, 0.07, px, 0.21, pz, s); solid(-3.4, 9.6, 1); }
    { const s = at(-3.6, 7.2); part(BOX, mat("#F3EEE3"), 0.9, 0.8, 0.6, 0, 0.4, 0, s); part(BOX, mat("#9FC8E0", { opacity: 0.7 }), 0.8, 0.04, 0.5, 0, 0.82, 0, s); solid(-3.6, 7.2, 0.6); }
    // 전봇대와 전선, 골목 보안등
    const poles: T.Vector3[] = [];
    for (const [lx, lz] of [[-2.8, 14], [2.8, 6], [-2.8, -1], [2.8, -8]]) {
      const s = at(lx, lz); part(CYL6, mat("#7A766C"), 0.12, 6.5, 0.12, 0, 3.25, 0, s); part(BOX, mat("#5A5650"), 1.4, 0.1, 0.1, 0, 6.0, 0, s);
      const lamp = part(BOX, mat("#3A3A3A"), 0.5, 0.1, 0.18, Math.sign(-lx) * 0.4, 4.6, 0, s); void lamp;
      part(BALL, mat("#FFE6A3", { emissive: "#FFC27A", ei: 1 }), 0.1, 0.08, 0.1, Math.sign(-lx) * 0.6, 4.5, 0, s);
      glow("#FFC27A", 3, Math.sign(-lx) * 0.6, 4.4, 0, 0.6, s);
      poles.push(w(lx, lz).setY(6.0)); solid(lx, lz, 0.3);
    }
    for (let i = 0; i < poles.length - 1; i++) for (const dy of [0, -0.25]) {
      const a = poles[i], b = poles[i + 1]; const pts: T.Vector3[] = [];
      for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push(new three.Vector3(a.x + (b.x - a.x) * t, a.y + dy - Math.sin(Math.PI * t) * 0.6, a.z + (b.z - a.z) * t)); }
      c.scene.add(new three.Line(new three.BufferGeometry().setFromPoints(pts), new three.LineBasicMaterial({ color: "#2A2A2A" })));
    }
    // 시멘트 블록 담장
    for (const side of [-1, 1]) for (const lz of [12.5, 6, 0]) { const s = at(side * 3.9, lz); part(BOX, mat("#A8A49A"), 0.25, 1.1, 2.0, 0, 0.55, 0, s); }
    // 물건 도깨비
    const tv = new three.Group(); const tb = part(BOX, mat("#6E5A44"), 0.5, 0.4, 0.4, 0, 0.35, 0, tv); ink(tb, 1.06);
    const tvScreen = part(BOX, new three.MeshStandardMaterial({ color: "#9FB8C8", emissive: "#9FD8FF", emissiveIntensity: 0.8 }), 0.36, 0.28, 0.02, 0, 0.36, 0.21, tv); void tvScreen;
    part(CYL6, mat("#3A3A3A"), 0.01, 0.35, 0.01, -0.1, 0.7, 0, tv).rotation.z = 0.4; part(CYL6, mat("#3A3A3A"), 0.01, 0.35, 0.01, 0.1, 0.7, 0, tv).rotation.z = -0.4;
    npc("브라운관 도깨비", "옆구리를 탁 치면 화면이 나와. 금 나와라 뚝딱!", tv, circle(E("modern"), 1.4, 0.0001, 0, 0));
    // 위 텔레비전은 골목 가운데 서 있고, 아래 둘은 골목을 오간다
    const phone = new three.Group(); const pb = part(BOX, mat("#3E3A3A"), 0.4, 0.22, 0.32, 0, 0.11, 0, phone); ink(pb, 1.08); part(CYL, mat("#C9C2B0"), 0.12, 0.03, 0.12, 0, 0.24, 0.02, phone);
    npc("다이얼 전화기 도깨비", "따르릉— 아무도 안 받네. 번호를 돌리다 손가락 아팠던 거 기억나?", phone, (t) => { const k = (Math.sin(t * 0.15) + 1) / 2; const v = w(0.6, 13 - k * 22); return { x: v.x, z: v.z, y: Math.abs(Math.sin(t * 5)) * 0.15, ry: -E("modern").angle + (Math.cos(t * 0.15) > 0 ? Math.PI : 0) }; });
    const tape = new three.Group(); const tp = part(BOX, mat("#2A2828"), 0.42, 0.26, 0.06, 0, 0.3, 0, tape); ink(tp, 1.08); part(BOX, mat("#F3E7C9"), 0.3, 0.08, 0.07, 0, 0.36, 0, tape);
    npc("카세트테이프 도깨비", "연필로 감아주면 다시 노래해. 늘어진 것도 정이야.", tape, (t) => { const k = (Math.sin(t * 0.12 + 2) + 1) / 2; const v = w(-0.8, -10 + k * 22); return { x: v.x, z: v.z, y: Math.abs(Math.sin(t * 6)) * 0.2, ry: -E("modern").angle }; });
  }

  // ── 2000년대 초: PC방 골목 ──
  function y2k(g: T.Group, at: (lx: number, lz: number, ry?: number) => T.Group, solid: (lx: number, lz: number, r: number) => void, w: (lx: number, lz: number) => T.Vector3) {
    // 붉은 벽돌 빌라(다세대) 셋: 층마다 창 불빛, 옥상 물탱크, 실외기
    function villa(lx: number, lz: number, side: 1 | -1, floors: number, signs: Array<{ text: string; bg: string; fg: string; floor: number }>) {
      const h = at(lx, lz, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      const H = floors * 2.1;
      part(BOX, mat(["#9C5A44", "#A8644A", "#8E5240"][Math.abs(Math.round(lz)) % 3]), 4.4, H, 4.0, 0, H / 2, 0, h);
      part(BOX, mat("#C9C2B0"), 4.6, 0.25, 4.2, 0, H + 0.12, 0, h); // 옥상 난간
      part(CYL, mat("#3E7AB8"), 0.5, 0.9, 0.5, 1.2, H + 0.6, -0.8, h); // 물탱크
      const wins: T.MeshStandardMaterial[] = [];
      for (let f = 0; f < floors; f++) for (let i = 0; i < 2; i++) {
        const m = new three.MeshStandardMaterial({ color: "#F3E7C9", emissive: ["#FFE6B0", "#BFD8FF", "#FFC27A"][(f + i) % 3], emissiveIntensity: c.night ? 0.9 : 0.5, roughness: 0.6 });
        wins.push(m); const wm = new three.Mesh(BOX, m); wm.scale.set(1.1, 0.8, 0.05); wm.position.set(-1 + i * 2, 1.0 + f * 2.1, 2.02); h.add(wm);
        part(BOX, mat("#C9C9C9"), 0.6, 0.45, 0.35, 1.75 * (i ? 1 : -1), 0.55 + f * 2.1, 2.2, h); // 실외기
      }
      c.anim.push((t) => wins.forEach((m, i) => { if (i % 5 === 2) m.emissiveIntensity = (Math.sin(t * 0.3 + i) > -0.3 ? 1 : 0.15) * (c.night ? 0.9 : 0.5); }));
      for (const sgd of signs) { const s = sign(sgd.text, 3.4, 0.8, sgd.bg, sgd.fg, 70); s.position.set(0, 1.9 + sgd.floor * 2.1, 2.06); h.add(s); glow(sgd.bg, 4, 0, 1.9 + sgd.floor * 2.1, 2.3, 0.55, h); const sm = s.material as T.MeshBasicMaterial; const ph = lz; c.anim.push((t) => { sm.opacity = Math.sin(t * 9 + ph) > 0.97 ? 0.5 : 1; }); }
      solid(lx, lz, 2.9);
    }
    villa(-6.8, 8, 1, 3, [{ text: "PC방", bg: "#FF5FA2", fg: "#FFFFFF", floor: 1 }]);
    villa(-6.8, -2, 1, 2, [{ text: "노래방", bg: "#7A5CFF", fg: "#FFFFFF", floor: 1 }]);
    villa(6.8, -2, -1, 3, [{ text: "비디오", bg: "#2EC4B6", fg: "#0E2A28", floor: 0 }]);
    // 24시 편의점: 하얗게 밝은 가게 앞
    { const h = at(6.8, 8, -Math.PI / 2); part(BOX, mat("#E8E6E0"), 4.2, 2.6, 3.6, 0, 1.3, 0, h); part(BOX, mat("#FFFFFF", { emissive: "#FFFFFF", ei: 0.9 }), 3.6, 1.7, 0.06, 0, 1.0, 1.82, h); const s = sign("24시 편의점", 3.8, 0.6, "#2F5F9E", "#FFFFFF", 56); s.position.set(0, 2.25, 1.86); h.add(s); glow("#FFFFFF", 4.5, 0, 1.0, 2.2, 0.5, h); solid(6.8, 8, 2.6); }
    // 문방구 앞 오락기 둘
    for (const lz of [12.5, 11.2]) { const s = at(-3.4, lz, Math.PI / 2); part(BOX, mat("#2A2A40"), 0.7, 1.5, 0.6, 0, 0.75, 0, s); const sc = part(BOX, mat("#9FD8FF", { emissive: "#5FD0FF", ei: 1 }), 0.5, 0.4, 0.03, 0, 1.15, 0.31, s); void sc; part(BOX, mat("#FF5FA2"), 0.5, 0.1, 0.2, 0, 0.8, 0.35, s); solid(-3.4, lz, 0.5); }
    // 공중전화 부스
    { const s = at(3.3, 13, -Math.PI / 2); part(BOX, mat("#C9D4DE", { opacity: 0.55 }), 1.0, 2.2, 1.0, 0, 1.1, 0, s); part(BOX, mat("#3E7AB8"), 1.06, 0.2, 1.06, 0, 2.3, 0, s); part(BOX, mat("#8C8C8C"), 0.35, 0.5, 0.12, 0, 1.3, -0.42, s); solid(3.3, 13, 0.7); }
    // 전봇대·전단지·가로등
    for (const [lx, lz] of [[2.9, 3], [-2.9, -6]]) { const s = at(lx, lz); part(CYL6, mat("#8C8A82"), 0.12, 6.5, 0.12, 0, 3.25, 0, s); for (let i = 0; i < 4; i++) part(BOX, mat("#F3EEE3"), 0.02, 0.3, 0.22, 0.13, 1.2 + i * 0.32, (i % 2) * 0.05, s); part(BALL, mat("#FFD08A", { emissive: "#FFB060", ei: 1 }), 0.14, 0.1, 0.14, Math.sign(-lx) * 0.6, 4.5, 0, s); glow("#FFB060", 3.4, Math.sign(-lx) * 0.6, 4.4, 0, 0.6, s); solid(lx, lz, 0.3); }
    // 물건 도깨비들
    const flip = new three.Group(); const lower = part(BOX, mat("#B8BCC4"), 0.22, 0.04, 0.4, 0, 0.3, 0, flip); ink(lower, 1.1);
    const hinge = new three.Group(); hinge.position.set(0, 0.32, -0.2); flip.add(hinge); const upper = part(BOX, mat("#B8BCC4"), 0.22, 0.04, 0.4, 0, 0, 0.2, hinge); part(BOX, mat("#9FD8FF", { emissive: "#5FD0FF", ei: 0.8 }), 0.16, 0.045, 0.24, 0, 0.005, 0.2, hinge); void upper;
    c.anim.push((t) => { hinge.rotation.x = -Math.PI / 2 - Math.abs(Math.sin(t * 1.2)) * 1.2; });
    npc("폴더폰 도깨비", "딸깍 열고 문자 쓰던 손맛, 기억나? 한 글자에 버튼 세 번.", flip, circle(E("y2k"), 3.2, 0.3, 0, 0.12));
    const beeper = new three.Group(); const bp = part(BOX, mat("#2A2A40"), 0.32, 0.2, 0.1, 0, 0.3, 0, beeper); ink(bp, 1.1); part(BOX, mat("#BFE8A0", { emissive: "#9FD870", ei: 0.8 }), 0.22, 0.08, 0.02, 0, 0.32, 0.06, beeper);
    npc("삐삐 도깨비", "8282! 빨리빨리 공중전화로 와. 음성 사서함에 남겨줘.", beeper, circle(E("y2k"), 6.5, -0.22, 2, 0.3));
    const floppy = new three.Group(); const fp = part(BOX, mat("#2A2A2A"), 0.4, 0.4, 0.04, 0, 0.35, 0, floppy); ink(fp, 1.08); part(BOX, mat("#B8BCC4"), 0.2, 0.12, 0.05, 0, 0.5, 0, floppy);
    npc("플로피디스크 도깨비", "요즘 애들은 나를 저장 버튼 그림으로만 알더라.", floppy, circle(E("y2k"), 9.5, 0.15, 4, 0.2));
    // 걸어다니는 C언어와 뒤따르는 세미콜론
    const cTag = c.textSprite("C", { bg: "#1E1F24", fg: "#7FE0D2", size: 80, scale: 0.7 }); const cl = new three.Group(); cTag.position.y = 0.55; cl.add(cTag);
    const semi = c.textSprite(";", { bg: "#1E1F24", fg: "#FFD27A", size: 60, scale: 0.4 }); c.scene.add(semi);
    npc("걸어다니는 C언어", "나 아직 살아 있다. 너희 냉장고 속에도 내가 있어.", cl, (t) => { const k = (Math.sin(t * 0.1) + 1) / 2; const v = w(0, -9 + k * 20); return { x: v.x, z: v.z, y: Math.abs(Math.sin(t * 4)) * 0.12 }; });
    c.anim.push((t) => { const k = (Math.sin((t - 1.2) * 0.1) + 1) / 2; const v = w(0.4, -9 + k * 20); semi.position.set(v.x, 0.45 + Math.abs(Math.sin(t * 4 + 1)) * 0.12, v.z); });
    // 디도스 도깨비: 작은 상자들이 한꺼번에 몰려다닌다
    const swarm = new three.Group(); const bits = Array.from({ length: 14 }, (_, i) => part(BOX, mat(i % 2 ? "#B9A3E3" : "#7FE0D2", { emissive: i % 2 ? "#B9A3E3" : "#7FE0D2", ei: 0.6 }), 0.1, 0.1, 0.1, 0, 0.4, 0, swarm));
    c.anim.push((t) => bits.forEach((b, i) => { b.position.set(Math.sin(t * 3 + i * 1.7) * 0.5, 0.4 + Math.abs(Math.sin(t * 5 + i)) * 0.4, Math.cos(t * 2.6 + i * 2.1) * 0.5); }));
    npc("디도스 도깨비 떼", "우린 한꺼번에 몰려다녀. 그래서 문 앞에서 늘 줄을 서지.", swarm, circle(E("y2k"), 12, -0.12, 1, 0));
    const modem = new three.Group(); const md = part(BOX, mat("#D8D4CC"), 0.5, 0.12, 0.34, 0, 0.25, 0, modem); ink(md, 1.08);
    const leds = [0, 1, 2, 3].map((i) => part(BALL, mat("#7FE070", { emissive: "#7FE070", ei: 1 }), 0.025, 0.025, 0.025, -0.15 + i * 0.1, 0.27, 0.18, modem));
    c.anim.push((t) => leds.forEach((l, i) => { l.visible = Math.sin(t * 9 + i * 2) > 0; }));
    npc("전화 모뎀 도깨비", "삐— 지지직… 접속 중이야. 엄마가 전화 들면 끊겨.", modem, circle(E("y2k"), 1.6, 0.0001, 0, 0));
  }

  // 마을 짓기 (위의 도우미들이 다 준비된 뒤)
  for (const e of ERAS) {
    const ctr = eraCenter(e);
    const g = new three.Group(); g.position.set(ctr.x, 0, ctr.z); g.rotation.y = -e.angle; c.scene.add(g);
    const w = (lx: number, lz: number) => { const v = new three.Vector3(lx, 0, lz); g.localToWorld(v); return v; };
    const solid = (lx: number, lz: number, r: number) => { const v = w(lx, lz); c.solids.push({ x: v.x, z: v.z, r }); };
    const at = (lx: number, lz: number, ry = 0) => { const s = new three.Group(); s.position.set(lx, 0, lz); s.rotation.y = ry; g.add(s); c.occluders.push(s); return s; };

    // 입구 이름표
    const gate = at(0, ERA_RADIUS + 1);
    const label = c.textSprite(`${e.name} · ${e.period}`, { bg: "#2A2118", fg: "#F3E7C9", size: 40, scale: 0.55 });
    label.position.set(0, 4.2, 0); gate.add(label);
    c.nameTags.push({ s: label, x: w(0, ERA_RADIUS + 1).x, z: w(0, ERA_RADIUS + 1).z, always: false });

    if (e.id === "prehistory") prehistory(g, at, solid, w);
    else if (e.id === "modern") modern(g, at, solid, w);
    else y2k(g, at, solid, w);
  }

}
