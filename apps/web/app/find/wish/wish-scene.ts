import type * as T from "three";
import type { LanternGroup, PublicLantern } from "../../../lib/find/lantern";
import { hueSpriteMaterial } from "../three-hue";

// 소원 선착장 (3D). 밤 호수 앞 나무 선착장에 내 달그락이 서 있고, 호수 건너 말뚝 사이 줄마다 같은 소원의 한지 초롱이 매달려 바람에 흔들린다.
//  - 줄 하나 = 같은 소원 묶음 하나. 등불이 많은 줄일수록 앞줄(선착장 가까이)에 건다.
//  - 이뤄진 소원은 나무 받침에 얹혀 물 위를 천천히 떠다닌다 (유등).
//  - 응원이 많을수록 초롱 불빛이 조금 더 밝다 (4단계, 재질을 나눠 쓴다).
//  고증: 한지 초롱(따뜻한 미색 + 호박빛). 청사초롱(청·홍 비단)은 혼례용이라 쓰지 않는다. 선착장은 맨나무, 단청 없음.
//  가볍게: 렌더러 하나, 모양·재질 공유, 빛 번짐은 스프라이트, 매단 등불은 최대 120개.

export type WishFilter = "all" | "cheered" | "done" | "mine";
export type WishScene = {
  setGroups: (groups: LanternGroup[], opts?: { rise?: string }) => void;
  setFilter: (f: WishFilter) => number;
  select: (id: string | null) => void;
  leave: () => void;
  dispose: () => void;
};
type Opts = { el: HTMLElement; hue: number; onPick: (id: string | null) => void; onExit: () => void; onRiseDone: (id: string) => void };

const MAX_HANG = 120, MAX_PER_ROPE = 16, MAX_FLOAT = 30;
const HANJI = "#F3E7C9", AMBER = "#F2A65A", GOLD = "#FFD27A", WOOD = "#6E5236", WOOD2 = "#5E4430", WOOD3 = "#4E3A2A";
const NIGHT = { top: "#0C1030", mid: "#232B55", hor: "#4A4678", fog: "#2C315C", hemi: ["#A6B4E8", "#3A4466", 1.0] as const, moon: "#C9D3FF" };
const DECK_Y = 0.62, PIER = { x: 1.2, near: 7.6, end: 1.4 };
const ROW0 = -3, ROW_GAP = 3.3, POST_H = 3.5;
const LEVEL = (cheers: number) => (cheers >= 6 ? 3 : cheers >= 3 ? 2 : cheers >= 1 ? 1 : 0);

/** 문자열에서 0..1 사이 고정 값 (등불마다 흔들림 위상을 다르게) */
function hash01(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; }

type Entry = {
  id: string; l: PublicLantern; kind: "hang" | "float";
  root: T.Group; body: T.Mesh; glow: T.Sprite; string?: T.Mesh;
  hook: T.Vector3; ph: number; level: number; match: boolean;
  drift?: { x: number; z: number; vx: number; zMin: number; zMax: number };
  rise?: { t0: number; from: T.Vector3 };
};

export async function createWishScene(three: typeof T, o: Opts): Promise<WishScene> {
  const { el } = o;
  const renderer = new three.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(el.clientWidth, el.clientHeight);
  renderer.outputColorSpace = three.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  const scene = new three.Scene();
  const anim: Array<(t: number, dt: number) => void> = [];
  const disposables: Array<{ dispose: () => void }> = [];

  // ── 하늘·안개 (마을 밤과 같은 색) ──
  {
    const c = document.createElement("canvas"); c.width = 4; c.height = 256; const x = c.getContext("2d")!;
    const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, NIGHT.top); g.addColorStop(0.55, NIGHT.mid); g.addColorStop(1, NIGHT.hor);
    x.fillStyle = g; x.fillRect(0, 0, 4, 256);
    const t = new three.CanvasTexture(c); t.colorSpace = three.SRGBColorSpace; scene.background = t; disposables.push(t);
  }
  scene.fog = new three.Fog(NIGHT.fog, 26, 85);
  scene.add(new three.HemisphereLight(NIGHT.hemi[0], NIGHT.hemi[1], NIGHT.hemi[2]));
  const moonLight = new three.DirectionalLight(NIGHT.moon, 0.55); moonLight.position.set(-20, 25, -40); scene.add(moonLight);
  const warm = new three.PointLight("#FFB870", 1.6, 26, 1.4); warm.position.set(0, 4, ROW0 - 2); scene.add(warm);

  // ── 공유 모양·재질 ──
  const mats = new Map<string, T.MeshStandardMaterial>();
  const mat = (c: string, e?: string, ei = 0) => {
    const k = `${c}|${e}|${ei}`; let m = mats.get(k);
    if (!m) { m = new three.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true, emissive: e ?? "#000", emissiveIntensity: ei }); mats.set(k, m); }
    return m;
  };
  const BOX = new three.BoxGeometry(1, 1, 1), CYL = new three.CylinderGeometry(1, 1, 1, 7), CONE = new three.ConeGeometry(1, 1, 5);
  // 한지 초롱: 가운데가 불룩한 8각 통 (대살에 한지를 바른 모양)
  const LANTERN = new three.LatheGeometry([[0.0, -0.27], [0.11, -0.27], [0.17, -0.18], [0.2, 0], [0.17, 0.18], [0.11, 0.27], [0.0, 0.27]].map(([r, y]) => new three.Vector2(r, y)), 8);
  const CAP = new three.CylinderGeometry(0.12, 0.12, 0.05, 8);
  disposables.push(BOX, CYL, CONE, LANTERN, CAP);
  const litMat = [0.7, 0.9, 1.1, 1.35].map((ei) => mat(HANJI, AMBER, ei));
  const doneMat = mat(HANJI, GOLD, 1.0);
  const dimMat = mat("#8D8676", AMBER, 0.12);
  const capMat = mat(WOOD3), strMat = mat("#8A7350");
  const glowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d")!; const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new three.CanvasTexture(c); t.colorSpace = three.SRGBColorSpace; disposables.push(t); return t;
  })();
  const glowMat = (color: string, opacity: number) => { const m = new three.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: three.AdditiveBlending }); disposables.push(m); return m; };
  const litGlow = [0.42, 0.55, 0.7, 0.85].map((op) => glowMat(AMBER, op));
  const GLOW_SIZE = [1.25, 1.5, 1.8, 2.15];
  const doneGlow = glowMat(GOLD, 0.7);
  const part = (g: T.BufferGeometry, m: T.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, parent: T.Object3D = scene) => {
    const mesh = new three.Mesh(g, m); mesh.scale.set(sx, sy, sz); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  };
  const TEXT_RES = 3;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const crisp = (t: T.CanvasTexture) => { t.colorSpace = three.SRGBColorSpace; t.anisotropy = maxAniso; t.minFilter = three.LinearMipmapLinearFilter; t.generateMipmaps = true; return t; };
  const textSprite = (text: string, o2: { bg?: string; fg?: string; size?: number; scale?: number } = {}) => {
    const c = document.createElement("canvas"); const ctx = c.getContext("2d")!;
    // 글씨는 화면에 보일 크기의 여러 배로 그려야 확대·축소돼도 깨지지 않는다
    const size = (o2.size ?? 36) * TEXT_RES; ctx.font = `${size}px Jua, sans-serif`;
    c.width = Math.ceil(ctx.measureText(text).width) + size; c.height = Math.ceil(size * 1.7);
    ctx.font = `${size}px Jua, sans-serif`; ctx.fillStyle = o2.bg ?? "rgba(42,33,24,.86)";
    ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, c.height / 2); ctx.fill();
    ctx.fillStyle = o2.fg ?? HANJI; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, c.width / 2, c.height / 2 + 2 * TEXT_RES);
    const tex = crisp(new three.CanvasTexture(c));
    const s = new three.Sprite(new three.SpriteMaterial({ map: tex, depthWrite: false, fog: true }));
    const k = o2.scale ?? 0.4; s.scale.set((c.width / c.height) * k, k, 1);
    return s;
  };

  // ── 물: 낮은 물결이 이는 로우폴리 호수 ──
  const waterGeo = new three.PlaneGeometry(90, 80, 30, 26); waterGeo.rotateX(-Math.PI / 2); waterGeo.translate(0, 0, -22);
  const water = new three.Mesh(waterGeo, new three.MeshStandardMaterial({ color: "#1B2450", roughness: 0.45, metalness: 0.15, flatShading: true }));
  scene.add(water); disposables.push(waterGeo, water.material as T.Material);
  {
    const pos = waterGeo.attributes.position as T.BufferAttribute; const base = Float32Array.from(pos.array as Float32Array);
    anim.push((t) => {
      for (let i = 0; i < pos.count; i++) { const x = base[i * 3], z = base[i * 3 + 2]; pos.setY(i, Math.sin(x * 0.45 + t * 0.8) * 0.06 + Math.cos(z * 0.38 - t * 0.6) * 0.07); }
      pos.needsUpdate = true;
    });
  }
  // 달과 물에 비친 달빛
  {
    const moon = new three.Sprite(new three.SpriteMaterial({ map: glowTex, color: "#F4F1E8", fog: false, depthWrite: false })); moon.scale.set(9, 9, 1); moon.position.set(-16, 20, -70); scene.add(moon);
    const disc = new three.Mesh(new three.CircleGeometry(2, 20), new three.MeshBasicMaterial({ color: "#F4F1E8", fog: false })); disc.position.set(-16, 20, -69.5); scene.add(disc);
    const streak = new three.Sprite(new three.SpriteMaterial({ map: glowTex, color: "#9FA9E0", transparent: true, opacity: 0.35, fog: false, depthWrite: false, blending: three.AdditiveBlending }));
    streak.scale.set(3, 26, 1); streak.position.set(-9, 0.15, -45); scene.add(streak);
    anim.push((t) => { streak.material.opacity = 0.3 + Math.sin(t * 1.3) * 0.05; });
  }
  // 별
  {
    const n = 260, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = hash01(`a${i}`) * Math.PI - Math.PI / 2 - 0.2, h = 0.08 + hash01(`h${i}`) * 0.9; arr[i * 3] = Math.sin(a) * 120; arr[i * 3 + 1] = 8 + h * 70; arr[i * 3 + 2] = -Math.cos(a) * 120 + 10; }
    const g = new three.BufferGeometry(); g.setAttribute("position", new three.BufferAttribute(arr, 3));
    scene.add(new three.Points(g, new three.PointsMaterial({ color: "#E8E6F5", size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));
  }
  // 건너편 산 그림자와 먼 마을 불빛
  for (let i = 0; i < 9; i++) {
    const x = -48 + i * 12 + hash01(`hx${i}`) * 4, h = 7 + hash01(`hh${i}`) * 9;
    part(CONE, mat(i % 2 ? "#161B36" : "#1B2140"), 10 + hash01(`hw${i}`) * 6, h, 6, x, h / 2 - 0.5, -60 - hash01(`hz${i}`) * 6);
  }
  for (let i = 0; i < 12; i++) { const s = new three.Sprite(glowMat(AMBER, 0.6)); s.scale.set(1.2, 1.2, 1); s.position.set(-30 + hash01(`v${i}`) * 60, 0.6 + hash01(`vy${i}`) * 1.2, -54 - hash01(`vz${i}`) * 3); scene.add(s); }

  // ── 이쪽 물가와 선착장 (맨나무, 단청 없음) ──
  part(BOX, mat("#262B3E"), 60, 1.2, 12, 0, -0.1, PIER.near + 6);
  for (let i = 0; i < 26; i++) { const x = -14 + i * 1.1 + hash01(`r${i}`) * 0.5; if (Math.abs(x) < PIER.x + 0.6) continue; const r = part(CONE, mat(i % 3 ? "#3E4A3A" : "#4A5240"), 0.12, 0.9 + hash01(`rh${i}`) * 0.6, 0.12, x, 0.85, PIER.near + 0.2 + hash01(`rz${i}`) * 0.6); r.rotation.z = (hash01(`rr${i}`) - 0.5) * 0.4; }
  const pier = new three.Group(); scene.add(pier);
  const plankN = Math.round((PIER.near - PIER.end) / 0.3);
  for (let i = 0; i < plankN; i++) part(BOX, mat(i % 3 === 0 ? WOOD2 : WOOD), PIER.x * 2 - (i % 2) * 0.06, 0.08, 0.27, (i % 2) * 0.03, DECK_Y - 0.04, PIER.end + 0.15 + i * 0.3, pier);
  for (const sx of [-1, 1]) part(BOX, mat(WOOD3), 0.14, 0.14, PIER.near - PIER.end, sx * (PIER.x - 0.15), DECK_Y - 0.15, (PIER.near + PIER.end) / 2, pier);
  for (let z = PIER.end + 0.15; z <= PIER.near; z += 2) for (const sx of [-1, 1]) part(CYL, mat(WOOD3), 0.1, 1.6, 0.1, sx * (PIER.x - 0.1), DECK_Y - 0.75, z, pier);
  // 끝의 계류 말뚝 두 개와 밧줄 감은 것
  for (const sx of [-1, 1]) { part(CYL, mat(WOOD2), 0.12, 1.1, 0.12, sx * (PIER.x - 0.12), DECK_Y + 0.35, PIER.end + 0.2, pier); part(CYL, mat("#B09A72"), 0.14, 0.1, 0.14, sx * (PIER.x - 0.12), DECK_Y + 0.62, PIER.end + 0.2, pier); }
  // 선착장 등: 장대 끝에 매단 한지 초롱 하나
  {
    const px = -PIER.x + 0.15, pz = PIER.end + 2.6;
    part(CYL, mat(WOOD3), 0.05, 2.2, 0.05, px, DECK_Y + 1.1, pz, pier);
    part(BOX, mat(WOOD3), 0.5, 0.05, 0.05, px + 0.22, DECK_Y + 2.15, pz, pier);
    const l = part(LANTERN, litMat[2], 1, 1, 1, px + 0.42, DECK_Y + 1.75, pz, pier);
    part(CAP, capMat, 1, 1, 1, 0, 0.28, 0, l); part(CAP, capMat, 1, 1, 1, 0, -0.28, 0, l);
    const g = new three.Sprite(litGlow[2]); g.scale.set(1.8, 1.8, 1); g.position.set(px + 0.42, DECK_Y + 1.75, pz); pier.add(g);
    const pl = new three.PointLight("#FFC27A", 1.2, 7, 1.6); pl.position.set(px + 0.42, DECK_Y + 1.6, pz + 0.3); scene.add(pl);
    anim.push((t) => { l.rotation.z = Math.sin(t * 1.1) * 0.05; pl.intensity = 1.1 + Math.sin(t * 5.3) * 0.08; });
  }
  // 선착장 목패
  {
    const c = document.createElement("canvas"); c.width = 1152; c.height = 384; const x = c.getContext("2d")!; x.scale(3, 3);
    x.fillStyle = "#8C6A48"; x.fillRect(0, 0, 384, 128); x.fillStyle = "rgba(0,0,0,.12)"; for (let k = 0; k < 6; k++) x.fillRect(0, 18 + k * 20, 384, 3);
    x.fillStyle = "#2A2118"; x.font = "64px Jua, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("소원 선착장", 192, 68);
    const t = crisp(new three.CanvasTexture(c)); disposables.push(t);
    const sign = new three.Mesh(new three.PlaneGeometry(1.5, 0.5), new three.MeshStandardMaterial({ map: t, roughness: 0.9 }));
    sign.position.set(PIER.x + 0.5, DECK_Y + 1.0, PIER.near - 0.4); sign.rotation.y = -0.5; scene.add(sign);
    part(CYL, mat(WOOD3), 0.05, 1.2, 0.05, PIER.x + 0.5, DECK_Y + 0.25, PIER.near - 0.38);
  }
  // 바닥 누르기용 판 (선착장 위)
  const deck = new three.Mesh(new three.BoxGeometry(PIER.x * 2, 0.1, PIER.near - PIER.end), new three.MeshBasicMaterial({ visible: false }));
  deck.position.set(0, DECK_Y, (PIER.near + PIER.end) / 2); scene.add(deck);

  // ── 나가는 화살표: 물가 쪽 선착장 바닥에서 통통 튄다 ──
  const exitPos = new three.Vector3(0.55, DECK_Y + 0.05, PIER.near - 2.3);
  {
    const shape = new three.Shape(); shape.moveTo(0, 0.5); shape.lineTo(0.42, 0.05); shape.lineTo(0.16, 0.05); shape.lineTo(0.16, -0.42); shape.lineTo(-0.16, -0.42); shape.lineTo(-0.16, 0.05); shape.lineTo(-0.42, 0.05); shape.closePath();
    const arrow = new three.Mesh(new three.ShapeGeometry(shape), new three.MeshBasicMaterial({ color: "#FF8F3F", side: three.DoubleSide, fog: false }));
    arrow.rotation.x = -Math.PI / 2; arrow.rotation.z = Math.PI; // 물가(카메라 쪽)를 가리킨다
    arrow.position.copy(exitPos); scene.add(arrow);
    anim.push((t) => { arrow.position.z = exitPos.z + Math.abs(Math.sin(t * 3)) * 0.22; });
    const tag = textSprite("마을로", { bg: "rgba(30,31,36,.85)", fg: "#fff", size: 34, scale: 0.34 }); tag.position.set(exitPos.x, DECK_Y + 0.75, exitPos.z); scene.add(tag);
  }

  // ── 내 달그락 ──
  const loader = new three.TextureLoader();
  const [idleTex, walkTex] = await Promise.all([loader.loadAsync("/find/sprites/idle.webp").catch(() => null), loader.loadAsync("/find/sprites/stoke.webp").catch(() => null)]);
  const me = { pos: new three.Vector3(-0.15, DECK_Y, PIER.near + 2.2), target: new three.Vector3(-0.15, DECK_Y, PIER.end + 1.6) as T.Vector3 | null, then: null as null | (() => void), leaving: false };
  let sp: T.Sprite | null = null;
  if (idleTex) {
    for (const t0 of [idleTex, walkTex]) if (t0) { t0.colorSpace = three.SRGBColorSpace; t0.repeat.set(1 / 25, 1); disposables.push(t0); }
    sp = new three.Sprite(hueSpriteMaterial(three, idleTex, o.hue)); sp.scale.set(1.15, 1.15, 1); scene.add(sp);
    const shadow = new three.Mesh(new three.CircleGeometry(0.3, 14), new three.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.25 })); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
    let f = 0, clockF = 0;
    anim.push((t, dt) => {
      let moving = false;
      if (me.target) {
        const d = me.target.clone().sub(me.pos); d.y = 0; const len = d.length();
        if (len < 0.05) { me.target = null; const fn = me.then; me.then = null; fn?.(); }
        else { me.pos.addScaledVector(d.normalize(), Math.min(len, (me.leaving ? 2.4 : 1.9) * dt)); moving = true; }
      }
      const cur = moving && walkTex ? walkTex : idleTex;
      const m = sp!.material as T.SpriteMaterial & { uniforms?: { map: { value: T.Texture } } };
      if (m.map !== cur) { m.map = cur; m.needsUpdate = true; }
      if (t - clockF > (moving ? 0.05 : 0.09)) { clockF = t; f = (f + 1) % 25; cur.offset.x = f / 25; }
      sp!.position.set(me.pos.x, me.pos.y + 0.55 + (moving ? Math.abs(Math.sin(t * 10)) * 0.05 : 0), me.pos.z);
      shadow.position.set(me.pos.x, me.pos.y + 0.02, me.pos.z);
      if (me.leaving || me.pos.z > PIER.near) { const op = Math.max(0, Math.min(1, (PIER.near + 2 - me.pos.z) / 2)); m.transparent = true; m.opacity = op; (shadow.material as T.MeshBasicMaterial).opacity = 0.25 * op; }
      else if (m.opacity !== 1) { m.opacity = 1; (shadow.material as T.MeshBasicMaterial).opacity = 0.25; }
    });
  } else { me.pos.copy(me.target!); me.target = null; }
  const clampDeck = (v: T.Vector3) => { v.x = Math.max(-PIER.x + 0.35, Math.min(PIER.x - 0.35, v.x)); v.z = Math.max(PIER.end + 0.5, Math.min(PIER.near - 0.3, v.z)); v.y = DECK_Y; return v; };
  const walkTo = (p: T.Vector3, then?: () => void) => { if (me.leaving) return; if (!sp) { then?.(); return; } me.target = clampDeck(p.clone()); me.then = then ?? null; };
  const leave = () => {
    if (me.leaving) return;
    if (!sp) { o.onExit(); return; }
    walkTo(new three.Vector3(0.2, 0, PIER.near - 0.4), () => { me.leaving = true; me.target = new three.Vector3(0.2, DECK_Y, PIER.near + 2.6); me.then = () => o.onExit(); });
    setTimeout(() => o.onExit(), 4500); // 혹시 걸음이 막혀도 나간다
  };

  // ── 카메라: 물가 뒤에서 선착장 너머 호수를 본다. 옆으로 끌면 옆으로, 위아래로 끌면 앞뒤로 ──
  const aspect0 = () => el.clientWidth / Math.max(1, el.clientHeight);
  const fovFor = (a: number) => (a < 0.7 ? 60 : a < 1.1 ? 54 : 46);
  const camera = new three.PerspectiveCamera(fovFor(aspect0()), aspect0(), 0.1, 220);
  const BASE = { y: 4.2, z: 12 };
  const view = { x: 0, z: BASE.z, y: BASE.y, lookY: 1.9 }; // 지금
  const user = { x: 0, z: BASE.z }; // 끌어서 정한 자리
  let focusEntry: Entry | null = null;
  const halfW = (d: number) => d * Math.tan(((camera.fov / 2) * Math.PI) / 180) * camera.aspect;
  let limits = { x: 6, zMin: -6 };

  // ── 소원 줄과 등불 (다시 만들 수 있는 층) ──
  let layer = new three.Group(); scene.add(layer);
  let entries: Entry[] = [];
  let filter: WishFilter = "all";
  let selected: string | null = null;
  let riseId: string | null = null;
  const layerDisposables: Array<{ dispose: () => void }> = [];
  const tmp = new three.Vector3();

  const makeLantern = (l: PublicLantern, kind: "hang" | "float"): Entry => {
    const root = new three.Group();
    const level = LEVEL(l.cheers);
    const done = l.status === "done";
    const bodyY = kind === "hang" ? -0.62 : 0.3;
    const body = part(LANTERN, done ? doneMat : litMat[level], 1, 1, 1, 0, bodyY, 0, root);
    part(CAP, capMat, 1, 1, 1, 0, 0.28, 0, body); part(CAP, capMat, 1, 1, 1, 0, -0.28, 0, body);
    let string: T.Mesh | undefined;
    if (kind === "hang") { string = part(CYL, strMat, 0.008, 0.36, 0.008, 0, -0.18, 0, root); part(CONE, mat("#C9A86A"), 0.04, 0.14, 0.04, 0, bodyY - 0.36, 0, root).rotation.x = Math.PI; } // 아래 술
    else part(BOX, mat(WOOD), 0.56, 0.07, 0.56, 0, 0.0, 0, root); // 나무 받침
    const glow = new three.Sprite(done ? doneGlow : litGlow[level]);
    const gs = done ? 1.6 : GLOW_SIZE[level]; glow.scale.set(gs, gs, 1); glow.userData.base = gs; glow.position.set(0, bodyY, 0.05); root.add(glow);
    return { id: l.id, l, kind, root, body, glow, string, hook: new three.Vector3(), ph: hash01(l.id) * Math.PI * 2, level, match: true };
  };

  const build = (groups: LanternGroup[]) => {
    scene.remove(layer);
    for (const d of layerDisposables.splice(0)) d.dispose();
    layer = new three.Group(); scene.add(layer);
    entries = [];
    const ropes = groups.map((g) => ({ g, lit: g.lanterns.filter((l) => l.status === "lit") })).filter((r) => r.lit.length > 0).sort((a, b) => b.lit.length - a.lit.length);
    // 줄을 앞줄부터 채운다: 그 줄 깊이에서 화면 폭에 들어오는 만큼만 한 열에
    type Placed = { r: (typeof ropes)[number]; w: number; n: number };
    const rows: Placed[][] = [];
    let budget = MAX_HANG;
    for (const r of ropes) {
      if (budget <= 0) break;
      let row = rows[rows.length - 1];
      const rowIdx = row ? rows.length - 1 : 0;
      const z = ROW0 - rowIdx * ROW_GAP;
      const maxW = Math.max(5.5, Math.min(18, halfW(BASE.z - z) * 2 * 0.86));
      const n = Math.min(MAX_PER_ROPE, r.lit.length, budget, Math.floor((maxW - 0.9) / 0.58));
      const w = Math.max(2.6, n * 0.62 + 0.9);
      const used = row ? row.reduce((s, p) => s + p.w + 1.1, 0) : 0;
      if (!row || used + w > maxW) { if (rows.length >= 9) break; row = []; rows.push(row); }
      row.push({ r, w, n }); budget -= n;
    }
    let maxX = 4;
    rows.forEach((row, ri) => {
      // 뒷줄일수록 말뚝이 높고 반 칸씩 엇갈린다 (계단식 객석처럼, 앞줄에 가려지지 않게)
      const z = ROW0 - ri * ROW_GAP;
      const H = POST_H + ri * 0.8;
      const total = row.reduce((s, p) => s + p.w, 0) + (row.length - 1) * 1.1;
      let x0 = -total / 2 + (ri % 2 ? 0.8 : ri ? -0.8 : 0);
      for (const p of row) {
        const ax = x0, bx = x0 + p.w; x0 = bx + 1.1;
        maxX = Math.max(maxX, Math.abs(ax), Math.abs(bx));
        for (const px of [ax, bx]) { part(CYL, mat(WOOD3), 0.08, H + 0.6, 0.08, px, (H - 0.6) / 2, z, layer); }
        const pts: T.Vector3[] = []; const N = 18;
        for (let k = 0; k <= N; k++) { const t = k / N; pts.push(new three.Vector3(ax + (bx - ax) * t, H - 0.05 - Math.sin(Math.PI * t) * 0.5, z)); }
        const lg = new three.BufferGeometry().setFromPoints(pts); layerDisposables.push(lg);
        layer.add(new three.Line(lg, new three.LineBasicMaterial({ color: "#C9B98F" })));
        // 줄 이름표
        const tag = textSprite(`${p.r.g.label} · ${p.r.lit.length}`, { size: 34, scale: 0.32 }); tag.position.set((ax + bx) / 2, H + 0.4, z); layer.add(tag);
        layerDisposables.push(tag.material.map!, tag.material);
        if (p.r.lit.length > p.n) { const more = textSprite(`+${p.r.lit.length - p.n}`, { size: 30, scale: 0.3 }); more.position.set(bx + 0.05, H + 0.05, z); layer.add(more); layerDisposables.push(more.material.map!, more.material); }
        // 응원 많은 등불이 가운데 오도록
        const shown = p.r.lit.slice().sort((a, b) => b.cheers - a.cheers).slice(0, p.n);
        const order = shown.map((_, i) => i).sort((a, b) => Math.abs(a - (p.n - 1) / 2) - Math.abs(b - (p.n - 1) / 2));
        const slots = new Array<PublicLantern>(p.n);
        // slots[k]: 가운데부터 바깥으로 응원 순
        order.forEach((slot, rank) => { slots[slot] = shown[rank]; });
        slots.forEach((l, k) => {
          const t = (k + 1) / (p.n + 1);
          const e = makeLantern(l, "hang");
          e.hook.set(ax + (bx - ax) * t, H - 0.05 - Math.sin(Math.PI * t) * 0.5, z);
          e.root.position.copy(e.hook); layer.add(e.root); entries.push(e);
        });
      }
    });
    // 이뤄진 소원: 물 위를 떠다니는 유등
    const lastZ = ROW0 - Math.max(1, rows.length) * ROW_GAP;
    const done = groups.flatMap((g) => g.lanterns.filter((l) => l.status === "done")).slice(0, MAX_FLOAT);
    done.forEach((l, i) => {
      const e = makeLantern(l, "float");
      const h = hash01(l.id);
      e.drift = { x: (h - 0.5) * 2 * Math.max(5, maxX), z: 0, vx: (0.08 + hash01(`${l.id}v`) * 0.1) * (i % 2 ? 1 : -1), zMin: lastZ, zMax: PIER.end - 1.2 };
      e.drift.z = e.drift.zMax - hash01(`${l.id}z`) * (e.drift.zMax - e.drift.zMin);
      e.root.position.set(e.drift.x, 0, e.drift.z); layer.add(e.root); entries.push(e);
    });
    limits = { x: Math.max(3, maxX - 2), zMin: Math.max(lastZ + 7, -10) };
    applyFilter();
    applySelect();
  };

  const isMatch = (e: Entry, top: number) => {
    if (filter === "all") return true;
    if (filter === "done") return e.l.status === "done";
    if (filter === "mine") return e.l.mine;
    return e.l.cheers > 0 && e.l.cheers >= top;
  };
  const applyFilter = () => {
    const sorted = entries.map((e) => e.l.cheers).filter((n) => n > 0).sort((a, b) => b - a);
    const top = sorted[Math.min(9, sorted.length - 1)] ?? 1; // 응원 많은 순 10개 (같은 수는 함께)
    let n = 0;
    for (const e of entries) {
      e.match = isMatch(e, top); if (e.match) n++;
      const done = e.l.status === "done";
      e.body.material = e.match ? (done ? doneMat : litMat[e.level]) : dimMat;
      e.glow.visible = e.match;
    }
    return n;
  };
  const applySelect = () => {
    focusEntry = entries.find((e) => e.id === selected) ?? null;
    // 고른 등불: 조금 크게, 빛 번짐도 크게
    for (const e of entries) { const on = e.id === selected; e.body.scale.setScalar(on ? 1.3 : 1); const b = (e.glow.userData.base as number) * (on ? 1.7 : 1); e.glow.scale.set(b, b, 1); }
  };

  // ── 매 프레임: 바람(느린 돌풍 + 등불마다 다른 위상), 유등 흘러가기, 새 등불 올라가기, 카메라 ──
  const gust = (t: number) => { const g = Math.sin(t * 0.21) * Math.sin(t * 0.13 + 0.7); return g > 0 ? g : g * 0.3; };
  anim.push((t, dt) => {
    for (const e of entries) {
      if (e.rise) {
        if (e.rise.t0 < 0) e.rise.t0 = t;
        const k = Math.min(1, (t - e.rise.t0) / 2.8), s = k * k * (3 - 2 * k);
        // 선착장에서 위로 떠올랐다가 줄 고리에 걸린다 (2차 베지어)
        const a = e.rise.from, b = e.hook; const cx = (a.x + b.x) / 2, cy = Math.max(a.y, b.y) + 2.6, cz = (a.z + b.z) / 2;
        const u = 1 - s;
        e.root.position.set(u * u * a.x + 2 * u * s * cx + s * s * b.x, u * u * a.y + 2 * u * s * cy + s * s * b.y, u * u * a.z + 2 * u * s * cz + s * s * b.z);
        e.root.rotation.z = Math.sin(t * 3 + e.ph) * 0.12 * (1 - s);
        if (e.string) e.string.visible = k > 0.92;
        if (k >= 1) { const id = e.id; e.rise = undefined; e.root.position.copy(e.hook); if (e.string) e.string.visible = true; riseId = null; o.onRiseDone(id); }
        continue;
      }
      if (e.kind === "hang") {
        const g = gust(t - e.hook.x * 0.12 - e.hook.z * 0.05);
        e.root.rotation.z = Math.sin(t * (1.05 + (e.ph % 0.4)) + e.ph) * 0.06 + g * (0.1 + 0.05 * Math.sin(e.ph));
        e.root.rotation.x = Math.sin(t * 0.8 + e.ph * 1.7) * 0.035 + g * 0.03;
      } else if (e.drift) {
        const d = e.drift; d.x += d.vx * dt; const lim = Math.max(6, limits.x + 3);
        if (d.x > lim) d.x = -lim; if (d.x < -lim) d.x = lim;
        e.root.position.set(d.x, Math.sin(t * 1.2 + e.ph) * 0.05, d.z + Math.sin(t * 0.15 + e.ph) * 0.4);
        e.root.rotation.y = t * 0.05 + e.ph; e.root.rotation.z = Math.sin(t * 1.1 + e.ph) * 0.04;
      }
    }
    // 카메라: 고른 등불이 있으면 그 앞 아래로 (아래 카드에 가리지 않게 화면 위쪽에 오도록)
    let gx = user.x, gz = user.z, gy = BASE.y, ly = 1.9;
    if (focusEntry) { focusEntry.root.getWorldPosition(tmp); gx = tmp.x; gz = tmp.z + 7.2; gy = Math.max(0.9, tmp.y - 1.3); ly = gy - 0.6; }
    const f = 1 - Math.exp(-dt * 3.5);
    view.x += (gx - view.x) * f; view.z += (gz - view.z) * f; view.y += (gy - view.y) * f; view.lookY += (ly - view.lookY) * f;
    camera.position.set(view.x, view.y, view.z); camera.lookAt(view.x, view.lookY, view.z - 14);
  });

  // ── 누르기: 화면에서 가장 가까운 등불을 고른다 (작은 화면에서도 잘 눌리게) ──
  const ray = new three.Raycaster(), ndc = new three.Vector2();
  const screenOf = (v: T.Vector3) => { const p = v.clone().project(camera); const r = renderer.domElement.getBoundingClientRect(); return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height, front: p.z < 1 && p.z > -1 }; };
  const pickLantern = (cx: number, cy: number): Entry | null => {
    let best: Entry | null = null, bestD = Infinity;
    for (const e of entries) {
      if (e.rise) continue;
      e.body.getWorldPosition(tmp); const s = screenOf(tmp); if (!s.front) continue;
      const dist = camera.position.distanceTo(tmp);
      const radius = Math.max(30, Math.min(60, 520 / dist)); // 가까운 등불은 크게 잡힌다
      const d = Math.hypot(s.x - cx, s.y - cy) * (e.match ? 1 : 1.6);
      if (d < radius && d < bestD) { best = e; bestD = d; }
    }
    return best;
  };
  let drag: { x: number; y: number; ux: number; uz: number; moved: boolean; id: number } | null = null;
  const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, ux: user.x, uz: user.z, moved: false, id: e.pointerId }; };
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 8) { drag.moved = true; if (selected) { selected = null; applySelect(); o.onPick(null); } }
    if (!drag.moved) return;
    const k = 14 / Math.max(320, el.clientHeight);
    user.x = Math.max(-limits.x, Math.min(limits.x, drag.ux - dx * k));
    user.z = Math.max(limits.zMin, Math.min(BASE.z, drag.uz + dy * k * 1.6)); // 위로 끌면 앞으로
  };
  const up = (e: PointerEvent) => {
    const d = drag; drag = null;
    if (!d || d.moved || e.pointerId !== d.id) return;
    const ex = screenOf(exitPos);
    if (Math.hypot(ex.x - e.clientX, ex.y - e.clientY) < 46) { leave(); return; }
    const hit = pickLantern(e.clientX, e.clientY);
    if (hit) { selected = hit.id; applySelect(); o.onPick(hit.id); return; }
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const fl = ray.intersectObject(deck)[0];
    if (fl) walkTo(fl.point);
    if (selected) { selected = null; applySelect(); o.onPick(null); }
  };
  const cv = renderer.domElement;
  cv.style.touchAction = "none";
  cv.addEventListener("pointerdown", down); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  const onResize = () => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = aspect0(); camera.fov = fovFor(camera.aspect); camera.updateProjectionMatrix(); };
  window.addEventListener("resize", onResize);

  const clock = new three.Clock();
  let raf = 0, last = 0;
  const tick = () => { const t = clock.getElapsedTime(); const dt = Math.min(0.05, t - last); last = t; for (const fn of anim) fn(t, dt); renderer.render(scene, camera); raf = requestAnimationFrame(tick); };
  tick();

  return {
    setGroups(groups, opts2) {
      build(groups);
      if (opts2?.rise) {
        const e = entries.find((x) => x.id === opts2.rise);
        if (e && e.kind === "hang") {
          riseId = e.id;
          e.rise = { t0: -1, from: new three.Vector3(me.pos.x, me.pos.y + 1.1, me.pos.z - 0.2) };
          e.root.position.copy(e.rise.from); if (e.string) e.string.visible = false;
          focusEntry = e; // 올라가는 동안 그 줄을 따라 본다
          selected = e.id; applySelect(); focusEntry = e;
        } else o.onRiseDone(opts2.rise);
      }
    },
    setFilter(f) { filter = f; return applyFilter(); },
    select(id) { if (riseId) return; selected = id; applySelect(); },
    leave,
    dispose() {
      cancelAnimationFrame(raf);
      cv.removeEventListener("pointerdown", down); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("resize", onResize);
      for (const d of layerDisposables) d.dispose();
      for (const d of disposables) d.dispose();
      for (const m of mats.values()) m.dispose();
      renderer.dispose(); if (cv.parentElement === el) el.removeChild(cv);
    }
  };
}
