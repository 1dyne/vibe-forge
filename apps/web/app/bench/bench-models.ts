import type * as T from "three";

// 3D 조립 책상의 절차적 부품 모델 (명세서 2차 v0.1 §2).
// 외부 3D 파일 없이 코드로 만든다. 단위는 mm.
// 각 모델의 원점과 핀 위치 규칙은 함수 주석에 적는다. 장면 엔진(bench-scene.ts)이 이 규칙으로 조립한다.

type Three = typeof T;
export const PITCH = 2.54;

export class Kit3D {
  private mats = new Map<string, T.Material>();
  private texCache = new Map<string, T.Texture>();
  constructor(readonly three: Three, readonly maxAniso: number) {}

  std(color: string, o: { metal?: number; rough?: number; emissive?: string; opacity?: number; map?: T.Texture; key?: string } = {}) {
    const k = o.key ?? JSON.stringify([color, o.metal, o.rough, o.emissive, o.opacity]);
    if (!o.map && this.mats.has(k)) return this.mats.get(k)! as T.MeshStandardMaterial;
    const m = new this.three.MeshStandardMaterial({
      color, metalness: o.metal ?? 0, roughness: o.rough ?? 0.6, map: o.map ?? null,
      emissive: o.emissive ?? "#000000", transparent: o.opacity !== undefined, opacity: o.opacity ?? 1
    });
    if (!o.map) this.mats.set(k, m);
    return m;
  }
  get tin() { return this.std("#d9dde3", { metal: 1, rough: 0.22 }); }
  get gold() { return this.std("#e2b75a", { metal: 1, rough: 0.28 }); }
  get copper() { return this.std("#c87a45", { metal: 1, rough: 0.35 }); }
  get steel() { return this.std("#b9bec6", { metal: 1, rough: 0.35 }); }

  canvasTex(key: string, w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void) {
    const hit = this.texCache.get(key);
    if (hit) return hit;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d")!;
    draw(x, w, h);
    const t = new this.three.CanvasTexture(c);
    t.colorSpace = this.three.SRGBColorSpace;
    t.anisotropy = this.maxAniso;
    this.texCache.set(key, t);
    return t;
  }

  mesh(g: T.BufferGeometry, m: T.Material | T.Material[], parent?: T.Object3D, shadow = true) {
    const me = new this.three.Mesh(g, m);
    me.castShadow = shadow; me.receiveShadow = true;
    parent?.add(me);
    return me;
  }
  box(w: number, h: number, d: number, m: T.Material | T.Material[], x: number, y: number, z: number, parent?: T.Object3D) {
    const me = this.mesh(new this.three.BoxGeometry(w, h, d), m, parent);
    me.position.set(x, y, z);
    return me;
  }
  /** 모서리가 둥근 상자 (위에서 본 모양만 둥글다) */
  rbox(w: number, h: number, d: number, r: number, m: T.Material | T.Material[], parent?: T.Object3D) {
    const s = roundedRect(this.three, w, d, r);
    const g = new this.three.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: Math.min(0.6, h * 0.15), bevelSize: Math.min(0.6, r * 0.4), bevelSegments: 2, curveSegments: 8 });
    g.rotateX(-Math.PI / 2);
    const me = this.mesh(g, m, parent);
    return me;
  }
  tube(points: T.Vector3[], r: number, m: T.Material, parent?: T.Object3D, seg = 24, radial = 8, tension = 0.0) {
    const curve = tension ? new this.three.CatmullRomCurve3(points, false, "catmullrom", tension) : new this.three.CatmullRomCurve3(points, false, "centripetal");
    return this.mesh(new this.three.TubeGeometry(curve, seg, r, radial, false), m, parent);
  }
  label(text: string, o: { px?: number; bg?: string; fg?: string; h?: number } = {}) {
    const px = o.px ?? 44, h = o.h ?? 4;
    const key = `label:${text}:${o.bg}:${o.fg}:${px}`;
    let tex = this.texCache.get(key);
    if (!tex) {
      const c = document.createElement("canvas"); const x = c.getContext("2d")!;
      x.font = `700 ${px}px "IBM Plex Sans KR", system-ui, sans-serif`;
      c.width = Math.ceil(x.measureText(text).width + px * 0.9); c.height = Math.ceil(px * 1.5);
      x.font = `700 ${px}px "IBM Plex Sans KR", system-ui, sans-serif`;
      x.fillStyle = o.bg ?? "rgba(24,26,30,.86)"; x.beginPath(); x.roundRect(0, 0, c.width, c.height, c.height / 2); x.fill();
      x.fillStyle = o.fg ?? "#fff"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, c.width / 2, c.height / 2 + 1);
      tex = new this.three.CanvasTexture(c); tex.colorSpace = this.three.SRGBColorSpace;
      this.texCache.set(key, tex);
    }
    const canvas = tex.image as HTMLCanvasElement;
    const s = new this.three.Sprite(new this.three.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set((canvas.width / canvas.height) * h, h, 1);
    s.renderOrder = 20;
    return s;
  }
}

export function roundedRect(three: Three, w: number, d: number, r: number) {
  const s = new three.Shape();
  const x0 = -w / 2, y0 = -d / 2;
  s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + d - r); s.quadraticCurveTo(x0 + w, y0 + d, x0 + w - r, y0 + d);
  s.lineTo(x0 + r, y0 + d); s.quadraticCurveTo(x0, y0 + d, x0, y0 + d - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

// ───────────────────────── 기판 ─────────────────────────

export type GridBoard = { group: T.Group; topY: number; bottomY: number; hole: (name: string) => T.Vector3 | null; nearest: (local: T.Vector3) => string | null };

const COLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function parseHole(name: string) {
  const m = /^([A-Z])(\d+)$/i.exec(name);
  if (!m) return null;
  return { c: COLS.indexOf(m[1].toUpperCase()), r: Number(m[2]) };
}

/**
 * 만능기판. 원점 = 기판 아랫면 가운데. 윗면(부품 면) y = 1.6.
 * 열 A.. = x(왼→오), 행 1.. = z(뒤→앞). 구멍 이름 "C5".
 */
export function perfboard(k: Kit3D, cols = 18, rows = 14): GridBoard {
  const three = k.three, M = 3, T = 1.6;
  const W = (cols - 1) * PITCH + M * 2, D = (rows - 1) * PITCH + M * 2;
  const pxmm = 22;
  const hx = (c: number) => -W / 2 + M + c * PITCH, hz = (r: number) => -D / 2 + M + (r - 1) * PITCH;
  const top = k.canvasTex(`pb-top-${cols}x${rows}`, Math.round(W * pxmm), Math.round(D * pxmm), (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#d8b47c"); g.addColorStop(1, "#cba56c");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.globalAlpha = 0.06; for (let i = 0; i < 900; i++) { x.fillStyle = i % 2 ? "#000" : "#fff"; x.fillRect((i * 997) % w, (i * 613) % h, 3, 2); } x.globalAlpha = 1;
    for (let c = 0; c < cols; c++) for (let r = 1; r <= rows; r++) {
      const px = (hx(c) + W / 2) * pxmm, py = (hz(r) + D / 2) * pxmm;
      x.fillStyle = "rgba(120,80,40,.35)"; x.beginPath(); x.arc(px, py, 0.78 * pxmm, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#1b140c"; x.beginPath(); x.arc(px, py, 0.5 * pxmm, 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = "#3a2a18"; x.font = `700 ${1.25 * pxmm}px "IBM Plex Sans KR", sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
    for (let c = 0; c < cols; c++) x.fillText(COLS[c], (hx(c) + W / 2) * pxmm, 1.4 * pxmm);
    x.font = `700 ${1.05 * pxmm}px "IBM Plex Sans KR", sans-serif`;
    for (let r = 1; r <= rows; r += 1) x.fillText(String(r), 1.35 * pxmm, (hz(r) + D / 2) * pxmm);
  });
  const bottom = k.canvasTex(`pb-bot-${cols}x${rows}`, Math.round(W * pxmm), Math.round(D * pxmm), (x, w, h) => {
    x.fillStyle = "#c79f66"; x.fillRect(0, 0, w, h);
    for (let c = 0; c < cols; c++) for (let r = 1; r <= rows; r++) {
      // 아래에서 보면 좌우가 뒤집힌다: 텍스처는 위에서 본 좌표로 그리고 UV에서 뒤집는다
      const px = (hx(c) + W / 2) * pxmm, py = (hz(r) + D / 2) * pxmm;
      const g = x.createRadialGradient(px - 4, py - 4, 2, px, py, 0.95 * pxmm);
      g.addColorStop(0, "#f0b27a"); g.addColorStop(1, "#b8693a");
      x.fillStyle = g; x.beginPath(); x.arc(px, py, 0.95 * pxmm, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#1b140c"; x.beginPath(); x.arc(px, py, 0.48 * pxmm, 0, Math.PI * 2); x.fill();
    }
  });
  bottom.wrapS = three.RepeatWrapping; bottom.repeat.x = 1;
  const edge = k.std("#b8925c", { rough: 0.8 });
  const topM = k.std("#ffffff", { map: top, rough: 0.75 });
  const botM = k.std("#ffffff", { map: bottom, rough: 0.45, metal: 0.25 });
  const group = new three.Group();
  // BoxGeometry 면 순서: +x, -x, +y, -y, +z, -z
  const g = new three.BoxGeometry(W, T, D);
  // 아랫면 UV: 위에서 본 좌표 그대로 보이도록 v를 뒤집는다
  const uv = g.attributes.uv as T.BufferAttribute;
  for (let i = 12; i < 16; i++) uv.setY(i, 1 - uv.getY(i));
  const me = k.mesh(g, [edge, edge, topM, botM, edge, edge], group);
  me.position.y = T / 2;
  me.userData.board = true;
  const hole = (name: string) => { const p = parseHole(name); if (!p || p.c < 0 || p.c >= cols || p.r < 1 || p.r > rows) return null; return new three.Vector3(hx(p.c), T, hz(p.r)); };
  const nearest = (l: T.Vector3) => {
    const c = Math.round((l.x + W / 2 - M) / PITCH), r = Math.round((l.z + D / 2 - M) / PITCH) + 1;
    if (c < 0 || c >= cols || r < 1 || r > rows) return null;
    return `${COLS[c]}${r}`;
  };
  group.userData.size = [W, T, D];
  return { group, topY: T, bottomY: 0, hole, nearest };
}

/**
 * 브레드보드(400칸형). 원점 = 바닥 가운데. 윗면 y = 8.5.
 * 행 1..30 = x(왼→오), 열 A..J = z(뒤→앞), 가운데 홈.
 */
export function breadboard(k: Kit3D, rowsN = 30): GridBoard {
  const three = k.three, H = 8.5, W = 82, D = 54.6, pxmm = 14;
  const rx = (r: number) => -((rowsN - 1) * PITCH) / 2 + (r - 1) * PITCH;
  const cz = (c: number) => (c < 5 ? -(3.81 + (4 - c) * PITCH) : 3.81 + (c - 5) * PITCH);
  const railZ = [-(13.97 + 5.3), -(13.97 + 7.84), 13.97 + 5.3, 13.97 + 7.84];
  const tex = k.canvasTex(`bb-${rowsN}`, Math.round(W * pxmm), Math.round(D * pxmm), (x, w, h) => {
    x.fillStyle = "#f3f1ea"; x.fillRect(0, 0, w, h);
    const X = (v: number) => (v + W / 2) * pxmm, Z = (v: number) => (v + D / 2) * pxmm;
    x.fillStyle = "#e4e1d8"; x.fillRect(0, Z(-1.3), w, 2.6 * pxmm);
    const sq = (px: number, py: number) => { x.fillStyle = "#cfcac0"; x.fillRect(px - 0.75 * pxmm, py - 0.75 * pxmm, 1.5 * pxmm, 1.5 * pxmm); x.fillStyle = "#26231f"; x.fillRect(px - 0.48 * pxmm, py - 0.48 * pxmm, 0.96 * pxmm, 0.96 * pxmm); };
    for (let r = 1; r <= rowsN; r++) for (let c = 0; c < 10; c++) sq(X(rx(r)), Z(cz(c)));
    for (const z of railZ) for (let r = 1; r <= rowsN; r++) if ((r - 1) % 6 !== 5) sq(X(rx(r)), Z(z));
    x.lineWidth = 0.35 * pxmm;
    for (const [z, col] of [[railZ[1] - 2, "#d43b32"], [railZ[0] + 2, "#2d63c8"], [railZ[2] - 2, "#d43b32"], [railZ[3] + 2, "#2d63c8"]] as Array<[number, string]>) { x.strokeStyle = col; x.beginPath(); x.moveTo(X(-W / 2 + 4), Z(z)); x.lineTo(X(W / 2 - 4), Z(z)); x.stroke(); }
    x.fillStyle = "#8c877c"; x.font = `600 ${1.5 * pxmm}px "IBM Plex Sans KR", sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
    for (let c = 0; c < 10; c++) { x.fillText(COLS[c], X(-W / 2 + 2.2), Z(cz(c))); x.fillText(COLS[c], X(W / 2 - 2.2), Z(cz(c))); }
    for (let r = 1; r <= rowsN; r++) if (r === 1 || r % 5 === 0) { x.fillText(String(r), X(rx(r)), Z(cz(0) - 2.3)); x.fillText(String(r), X(rx(r)), Z(cz(9) + 2.3)); }
  });
  const side = k.std("#e9e6dd", { rough: 0.7 });
  const topM = k.std("#ffffff", { map: tex, rough: 0.7 });
  const group = new three.Group();
  const me = k.mesh(new three.BoxGeometry(W, H, D), [side, side, topM, side, side, side], group);
  me.position.y = H / 2; me.userData.board = true;
  const hole = (name: string) => { const p = parseHole(name); if (!p || p.c < 0 || p.c > 9 || p.r < 1 || p.r > rowsN) return null; return new three.Vector3(rx(p.r), H, cz(p.c)); };
  const nearest = (l: T.Vector3) => {
    const r = Math.round((l.x - rx(1)) / PITCH) + 1;
    let best = -1, bd = 99; for (let c = 0; c < 10; c++) { const d = Math.abs(cz(c) - l.z); if (d < bd) { bd = d; best = c; } }
    if (r < 1 || r > rowsN || bd > 1.6) return null;
    return `${COLS[best]}${r}`;
  };
  group.userData.size = [W, H, D];
  return { group, topY: H, bottomY: 0, hole, nearest };
}

// ───────────────────────── 스루홀 부품 ─────────────────────────
// 다리 꽂는 부품의 원점 = 첫 구멍과 둘째 구멍의 가운데, 기판 윗면 높이. x축 = 첫 구멍 → 둘째 구멍.
// tails: 기판 아래로 나오는 다리 (다리 자르기에서 줄어든다). 원점 = 기판 아랫면.

export type LeadPart = { group: T.Group; tails: T.Mesh[]; boardT: number; /** 다리 구부리기: 0 = 곧게 펴짐(새 부품), 1 = ㄱ자로 꺾여 구멍에 들어갈 모양 */ bend?: (b: number) => void };

const BAND: Record<number, string> = { 0: "#1c1c1c", 1: "#7a4a22", 2: "#d22b22", 3: "#f07b1a", 4: "#f2cf1e", 5: "#2f9a3d", 6: "#2a5bd7", 7: "#8a3fc4", 8: "#8d8d8d", 9: "#f4f4f4" };
function bands(ohms: number) {
  const s = String(Math.round(ohms)); const a = Number(s[0]), b = Number(s[1] ?? 0), mult = Math.max(0, s.length - 2);
  return [BAND[a], BAND[b], BAND[mult]];
}

function addTail(k: Kit3D, parent: T.Object3D, x: number, z: number, len: number, r: number, boardT: number) {
  const g = new k.three.CylinderGeometry(r, r, len, 10); g.translate(0, -len / 2, 0);
  const t = k.mesh(g, k.tin, parent);
  t.position.set(x, -boardT, z);
  t.userData.len = len;
  return t;
}

export function resistor(k: Kit3D, pitch: number, ohms: number, boardT = 1.6): LeadPart {
  const three = k.three, group = new three.Group();
  const L = 6.3, R = 1.2;
  const prof = [[0, -L / 2], [0.85, -L / 2], [R + 0.08, -L / 2 + 0.45], [R + 0.1, -L / 2 + 1.3], [R - 0.12, -L / 2 + 1.9], [R - 0.12, L / 2 - 1.9], [R + 0.1, L / 2 - 1.3], [R + 0.08, L / 2 - 0.45], [0.85, L / 2], [0, L / 2]].map(([r, y]) => new three.Vector2(r, y));
  const bodyG = new three.LatheGeometry(prof, 28); bodyG.rotateZ(Math.PI / 2);
  const body = k.mesh(bodyG, k.std("#d9c39a", { rough: 0.55 }), group);
  const cy = R + 0.12; body.position.y = cy;
  const cols = bands(ohms);
  const bandAt = [-2.1, -1.35, -0.6];
  cols.forEach((c, i) => { const b = k.mesh(new three.CylinderGeometry(bandAt[i] < -1.9 ? R + 0.13 : R - 0.08, bandAt[i] < -1.9 ? R + 0.13 : R - 0.08, 0.5, 24), k.std(c, { rough: 0.5 }), group); b.rotation.z = Math.PI / 2; b.position.set(bandAt[i], cy, 0); });
  const gb = k.mesh(new three.CylinderGeometry(R + 0.12, R + 0.12, 0.45, 24), k.gold, group); gb.rotation.z = Math.PI / 2; gb.position.set(2.15, cy, 0);
  const lr = 0.3;
  // 다리 = 몸통에서 꺾이는 곳까지(고정) + 꺾인 뒤 아래로 가는 부분(돌쩌귀에 달려 펴졌다 꺾였다 한다)
  const tails: T.Mesh[] = [];
  const hinges: Array<{ g: T.Group; s: number }> = [];
  for (const s of [-1, 1]) {
    const x0 = s * (L / 2), xe = s * (pitch / 2), xb = xe - s * 0.9;
    k.tube([new three.Vector3(x0, cy, 0), new three.Vector3((x0 + xb) / 2, cy, 0), new three.Vector3(xb, cy, 0)], lr, k.tin, group, 6, 8);
    const hinge = new three.Group(); hinge.position.set(xb, cy, 0); group.add(hinge);
    k.tube([new three.Vector3(0, 0, 0), new three.Vector3(s * 0.75, -0.15, 0), new three.Vector3(s * 0.9, -0.9, 0), new three.Vector3(s * 0.9, -cy, 0), new three.Vector3(s * 0.9, -cy - boardT, 0)], lr, k.tin, hinge, 24, 8);
    const t = addTail(k, hinge, s * 0.9, 0, 8, lr, boardT); t.position.y = -cy - boardT;
    tails.push(t); hinges.push({ g: hinge, s });
  }
  const bend = (b: number) => { for (const h of hinges) h.g.rotation.z = h.s * (1 - Math.min(1, Math.max(0, b))) * (Math.PI / 2); };
  bend(1);
  return { group, tails, boardT, bend };
}

/** LED 5mm. 첫 구멍 = 애노드(긴 다리), 둘째 = 캐소드. */
export function led5(k: Kit3D, color: string, boardT = 1.6): LeadPart & { lens: T.MeshStandardMaterial; glow: T.Object3D } {
  const three = k.three, group = new three.Group(), lift = 1.6;
  const lens = new three.MeshStandardMaterial({ color, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.82, emissive: color, emissiveIntensity: 0 });
  const prof: T.Vector2[] = [new three.Vector2(0, 0), new three.Vector2(2.45, 0), new three.Vector2(2.45, 5.6)];
  for (let i = 1; i <= 10; i++) { const a = (i / 10) * (Math.PI / 2); prof.push(new three.Vector2(2.45 * Math.cos(a), 5.6 + 2.45 * Math.sin(a))); }
  const domeG = new three.LatheGeometry(prof, 32);
  const dome = k.mesh(domeG, lens, group); dome.position.y = lift + 1;
  // 테두리: 캐소드 쪽(+x)이 깎인 원
  const s = new three.Shape(); const rr = 2.9, cut = 2.45, ang = Math.acos(cut / rr);
  s.absarc(0, 0, rr, ang, Math.PI * 2 - ang, false); s.lineTo(cut, rr * Math.sin(ang)); s.closePath();
  const fl = new three.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 24 }); fl.rotateX(-Math.PI / 2);
  const flange = k.mesh(fl, lens, group); flange.position.y = lift;
  // 안쪽 받침(애노드 포스트·캐소드 앤빌)
  k.box(0.5, 3.2, 0.5, k.std("#9aa1a8", { metal: 0.8, rough: 0.4 }), -PITCH / 2 + 0.2, lift + 2.4, 0, group);
  k.box(1.4, 2.4, 0.5, k.std("#9aa1a8", { metal: 0.8, rough: 0.4 }), PITCH / 2 - 0.5, lift + 2.0, 0, group);
  const lr = 0.25;
  for (const x of [-PITCH / 2, PITCH / 2]) k.tube([new three.Vector3(x, lift + 1.2, 0), new three.Vector3(x, 0, 0), new three.Vector3(x, -boardT, 0)], lr, k.tin, group, 4, 8);
  const tails = [addTail(k, group, -PITCH / 2, 0, 11, lr, boardT), addTail(k, group, PITCH / 2, 0, 9, lr, boardT)];
  const glow = new three.PointLight(color, 0, 60, 1.6); glow.position.y = lift + 5; group.add(glow);
  const haloTex = k.canvasTex(`halo-${color}`, 128, 128, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.18, color); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  const halo = new three.Sprite(new three.SpriteMaterial({ map: haloTex, blending: three.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  halo.scale.set(26, 26, 1); halo.position.y = lift + 5.5; group.add(halo);
  glow.userData.halo = halo;
  return { group, tails, boardT, lens, glow };
}

// ───────────────────────── 헤더·모듈 ─────────────────────────

/** 수 헤더. 원점 = 핀 줄 가운데, 플라스틱 아랫면. 긴 쪽(6mm)이 아래, 짧은 쪽(3mm)이 위. */
export function headerMale(k: Kit3D, n: number) {
  const three = k.three, group = new three.Group();
  const W = n * PITCH;
  k.rbox(W, 2.5, 2.5, 0.25, k.std("#1d1e20", { rough: 0.55 }), group);
  for (let i = 0; i < n; i++) {
    const x = -((n - 1) * PITCH) / 2 + i * PITCH;
    const pin = k.mesh(new three.BoxGeometry(0.64, 11.5, 0.64), k.gold, group);
    pin.position.set(x, 2.5 + 3 - 11.5 / 2, 0);
    const tipG = new three.ConeGeometry(0.45, 0.6, 4); tipG.rotateY(Math.PI / 4);
    const tip = k.mesh(tipG, k.gold, group); tip.position.set(x, 2.5 + 3 + 0.3, 0);
  }
  const pinX = (i: number) => -((n - 1) * PITCH) / 2 + i * PITCH;
  return { group, pinX, plasticTop: 2.5 };
}

/** 센서 모듈(GY-521 형). 원점 = 핀 구멍 줄 가운데, 기판 아랫면. 기판은 -z 쪽으로 펼쳐진다. */
export function sensorModule(k: Kit3D, pinNames: string[], silk: string) {
  const three = k.three, group = new three.Group(), T = 1.6;
  const n = pinNames.length, W = Math.max(21.2, n * PITCH + 1.4), D = 15.6, edge = 1.6;
  const pxmm = 30;
  const hx = (i: number) => -((n - 1) * PITCH) / 2 + i * PITCH;
  const zc = -D / 2 + edge; // 기판 가운데의 z (핀 줄 기준)
  const tex = k.canvasTex(`mod-${silk}-${n}`, Math.round(W * pxmm), Math.round(D * pxmm), (x, w, h) => {
    const X = (v: number) => (v + W / 2) * pxmm, Z = (v: number) => (v - zc + D / 2) * pxmm;
    x.fillStyle = "#1d4fae"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "rgba(255,255,255,.08)"; x.lineWidth = 6; for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(X(-W / 2 + 2 + i * 2), Z(-3)); x.lineTo(X(-W / 2 + 4 + i * 2.2), Z(-12)); x.stroke(); }
    for (let i = 0; i < n; i++) {
      x.fillStyle = "#e2b75a"; x.beginPath(); x.arc(X(hx(i)), Z(0), 0.95 * pxmm, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#0e1424"; x.beginPath(); x.arc(X(hx(i)), Z(0), 0.5 * pxmm, 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = "#e2b75a"; x.fillRect(X(hx(0)) - 0.95 * pxmm, Z(0) - 0.95 * pxmm, 1.9 * pxmm, 1.9 * pxmm);
    x.fillStyle = "#0e1424"; x.beginPath(); x.arc(X(hx(0)), Z(0), 0.5 * pxmm, 0, Math.PI * 2); x.fill();
    for (const sx of [-1, 1]) { const mx = X(sx * (W / 2 - 1.9)), mz = Z(-D + edge + 1.9); x.fillStyle = "#e2b75a"; x.beginPath(); x.arc(mx, mz, 1.6 * pxmm, 0, Math.PI * 2); x.fill(); x.fillStyle = "#0e1424"; x.beginPath(); x.arc(mx, mz, 1.1 * pxmm, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = "#f4f6fb"; x.textAlign = "center"; x.textBaseline = "middle";
    x.font = `700 ${0.95 * pxmm}px "IBM Plex Sans KR", sans-serif`;
    for (let i = 0; i < n; i++) { x.save(); x.translate(X(hx(i)), Z(-2.7)); x.rotate(-Math.PI / 2); x.fillText(pinNames[i], 0, 0); x.restore(); }
    x.font = `700 ${1.5 * pxmm}px "IBM Plex Sans KR", sans-serif`; x.fillText(silk, X(W / 2 - 5.5), Z(-D + edge + 4.2));
    x.strokeStyle = "#f4f6fb"; x.lineWidth = 0.18 * pxmm; x.strokeRect(X(-1.8), Z(-9.3), 3.6 * pxmm, 3.6 * pxmm);
    x.font = `600 ${0.9 * pxmm}px "IBM Plex Sans KR", sans-serif`; x.fillText("X↑ Y→", X(-W / 2 + 4), Z(-D + edge + 3.8));
  });
  const side = k.std("#173f8c", { rough: 0.6 });
  const pcb = k.mesh(new three.BoxGeometry(W, T, D), [side, side, k.std("#fff", { map: tex, rough: 0.55 }), side, side, side], group);
  pcb.position.set(0, T / 2, zc);
  pcb.userData.board = true;
  // 칩과 작은 부품들
  const chip = k.box(4, 0.9, 4, k.std("#141414", { rough: 0.5 }), 0, T + 0.45, -7.5, group);
  const chipTex = k.canvasTex("mpu-mark", 256, 256, (x, w, h) => { x.fillStyle = "#141414"; x.fillRect(0, 0, w, h); x.fillStyle = "#8b9196"; x.font = "700 46px sans-serif"; x.textAlign = "center"; x.fillText("MPU", w / 2, h * 0.45); x.font = "600 34px sans-serif"; x.fillText("6050", w / 2, h * 0.68); x.beginPath(); x.arc(40, 40, 12, 0, Math.PI * 2); x.fill(); });
  chip.material = [k.std("#141414"), k.std("#141414"), k.std("#fff", { map: chipTex, rough: 0.5 }), k.std("#141414"), k.std("#141414"), k.std("#141414")];
  const smd = (w: number, d: number, c: string, x: number, z: number, h = 0.5) => k.box(w, h, d, k.std(c, { rough: 0.5 }), x, T + h / 2, z, group);
  smd(2.9, 1.6, "#1a1a1a", -6.5, -10.2, 1.1);
  for (const [x, z] of [[4.5, -5.2], [5.6, -9.4], [-4.3, -5.4], [3.3, -11.6], [-2.6, -11.8]]) { smd(1.0, 0.5, "#b8946a", x, z); k.box(0.25, 0.52, 0.52, k.tin, x - 0.5, T + 0.26, z, group); k.box(0.25, 0.52, 0.52, k.tin, x + 0.5, T + 0.26, z, group); }
  for (const [x, z] of [[7.6, -6.4], [-7.6, -7.2]]) smd(1.0, 0.5, "#1a1a1a", x, z);
  const led = smd(1.0, 0.5, "#4cd964", 8.2, -11.0); (led.material as T.MeshStandardMaterial) = k.std("#4cd964", { emissive: "#1f6f2f", rough: 0.3 });
  return { group, hx, topY: T, n };
}

// ───────────────────────── 전원 ─────────────────────────

/** AA 전지 2개용 홀더. 원점 = 바닥 가운데, 길이 방향 x. 전선은 +x 끝에서 나온다. */
export function batteryHolder2AA(k: Kit3D) {
  const three = k.three, group = new three.Group();
  const L = 58, Wd = 31.5, H = 15, t = 1.4;
  const black = k.std("#191a1c", { rough: 0.55 });
  k.box(L, t, Wd, black, 0, t / 2, 0, group);
  k.box(L, H, t, black, 0, H / 2, -Wd / 2 + t / 2, group);
  k.box(L, H, t, black, 0, H / 2, Wd / 2 - t / 2, group);
  k.box(t, H, Wd, black, -L / 2 + t / 2, H / 2, 0, group);
  k.box(t, H, Wd, black, L / 2 - t / 2, H / 2, 0, group);
  k.box(L - 2, 3, 1.2, black, 0, 1.5 + t, 0, group);
  const mark = k.canvasTex("bh-mark", 512, 256, (x, w, h) => { x.fillStyle = "#191a1c"; x.fillRect(0, 0, w, h); x.fillStyle = "#6d6f73"; x.font = "700 70px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("+   −", w * 0.3, h * 0.27); x.fillText("−   +", w * 0.3, h * 0.74); x.font = "600 40px sans-serif"; x.fillText("2×AA 3V", w * 0.76, h * 0.5); });
  const floor = k.mesh(new three.PlaneGeometry(L - 3, Wd - 3), k.std("#fff", { map: mark, rough: 0.6 }), group, false);
  floor.rotation.x = -Math.PI / 2; floor.position.y = t + 0.02;
  // 스프링과 접점
  for (const [x, z] of [[L / 2 - 3.2, -7.6], [-L / 2 + 3.2, 7.6]]) {
    const pts: T.Vector3[] = []; for (let i = 0; i <= 60; i++) { const a = i * 0.55; pts.push(new three.Vector3(x + (x < 0 ? 1 : -1) * i * 0.07, 7.5 + Math.sin(a) * 3.2, z + Math.cos(a) * 3.2)); }
    k.tube(pts, 0.3, k.steel, group, 120, 6);
  }
  for (const [x, z] of [[-L / 2 + 2.4, -7.6], [L / 2 - 2.4, 7.6]]) k.box(0.5, 7, 7, k.steel, x, 7.5, z, group);
  const wireExit = { red: new three.Vector3(L / 2, 3.2, -3.2), black: new three.Vector3(L / 2, 3.2, 3.2) };
  return { group, wireExit, slots: [new three.Vector3(0, 8.6, -7.6), new three.Vector3(0, 8.6, 7.6)], flip: [false, true] };
}

/** AA 전지. 원점 = 가운데, 길이 방향 x, + 극이 +x. */
export function aaBattery(k: Kit3D) {
  const three = k.three, group = new three.Group();
  const tex = k.canvasTex("aa", 512, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#2a2b2f"); g.addColorStop(0.5, "#45474d"); g.addColorStop(1, "#202124");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = "#e7a83a"; x.fillRect(w * 0.72, 0, w * 0.28, h);
    x.fillStyle = "#fff"; x.font = "800 64px sans-serif"; x.textBaseline = "middle"; x.fillText("AA 1.5V", 40, h * 0.5);
    x.fillStyle = "#1b1b1b"; x.font = "800 64px sans-serif"; x.fillText("+", w * 0.82, h * 0.5);
  });
  const body = k.mesh(new three.CylinderGeometry(7.1, 7.1, 49, 32, 1, true), k.std("#fff", { map: tex, rough: 0.35, metal: 0.2 }), group);
  body.rotation.z = -Math.PI / 2;
  for (const s of [-1, 1]) { const cap = k.mesh(new three.CylinderGeometry(7.0, 7.0, 0.8, 32), k.steel, group); cap.rotation.z = Math.PI / 2; cap.position.x = s * 24.8; }
  const nub = k.mesh(new three.CylinderGeometry(2.6, 2.6, 1.2, 20), k.steel, group); nub.rotation.z = Math.PI / 2; nub.position.x = 25.6;
  return group;
}

// ───────────────────────── 땜납 ─────────────────────────

/** 정상 납땜: 다리를 감싸는 오목한 원뿔. 원점 = 패드 면, +y 방향으로 솟는다. */
export function filletGeometry(three: Three, padR = 0.95, pinR = 0.33, h = 1.25) {
  const pts: T.Vector2[] = [new three.Vector2(0.001, 0)];
  for (let i = 0; i <= 12; i++) { const u = i / 12; const r = padR - (padR - pinR) * (1 - Math.pow(1 - u, 2.2)); pts.push(new three.Vector2(r, u * h)); }
  pts.push(new three.Vector2(0.001, h));
  return new three.LatheGeometry(pts, 24);
}
/** 냉납: 둥글게 얹힌 울퉁불퉁한 덩어리 */
export function coldGeometry(three: Three) {
  const g = new three.IcosahedronGeometry(1.05, 2);
  const p = g.attributes.position as T.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const n = 1 + 0.12 * Math.sin(p.getX(i) * 9 + p.getZ(i) * 7) + 0.08 * Math.cos(p.getY(i) * 11); p.setXYZ(i, p.getX(i) * n, Math.max(-0.2, p.getY(i) * n * 0.8) + 0.55, p.getZ(i) * n); }
  g.computeVertexNormals();
  return g;
}

// ───────────────────────── 공구·소품 ─────────────────────────

/** 인두. 원점 = 팁 끝, 손잡이는 +y 방향. */
export function solderingIron(k: Kit3D) {
  const three = k.three, group = new three.Group();
  const tip = k.mesh(new three.ConeGeometry(0.9, 9, 16), k.std("#9da3aa", { metal: 1, rough: 0.3 }), group); tip.position.y = 4.5;
  const sleeve = k.mesh(new three.CylinderGeometry(2.2, 1.4, 30, 20), k.steel, group); sleeve.position.y = 9 + 15;
  const nut = k.mesh(new three.CylinderGeometry(4.2, 4.2, 5, 6), k.std("#8b9096", { metal: 1, rough: 0.35 }), group); nut.position.y = 41;
  const grip = k.mesh(new three.CylinderGeometry(6.4, 5.2, 34, 24), k.std("#2f3e52", { rough: 0.85 }), group); grip.position.y = 60;
  for (let i = 0; i < 6; i++) { const r = k.mesh(new three.TorusGeometry(5.6 + i * 0.13, 0.55, 8, 24), k.std("#22303f", { rough: 0.9 }), group); r.rotation.x = Math.PI / 2; r.position.y = 46 + i * 4.2; }
  const back = k.mesh(new three.CylinderGeometry(4.6, 6.4, 28, 24), k.std("#e8e6e1", { rough: 0.55 }), group); back.position.y = 91;
  const tail = k.mesh(new three.CylinderGeometry(2.2, 3.6, 12, 16), k.std("#1d1e20", { rough: 0.7 }), group); tail.position.y = 110;
  const glowTip = k.mesh(new three.SphereGeometry(0.9, 12, 8), new three.MeshBasicMaterial({ color: "#ff8a3c", transparent: true, opacity: 0 }), group, false);
  glowTip.position.y = 0.3;
  group.userData.glow = glowTip;
  return group;
}

/** 니퍼. 원점 = 날 끝. */
/** 실납 한 토막. 원점 = 녹는 끝, 몸은 +y 쪽 (인두와 같은 규칙). 끝에 몇 바퀴 감긴 실납 */
export function solderWire(k: Kit3D) {
  const three = k.three, group = new three.Group();
  const pts: T.Vector3[] = [new three.Vector3(0, 0, 0), new three.Vector3(0.6, 6, 0), new three.Vector3(0.8, 22, 0), new three.Vector3(0.4, 40, 0)];
  for (let i = 0; i <= 40; i++) { const a = i * 0.5; pts.push(new three.Vector3(Math.cos(a) * 4, 42 + i * 0.35, Math.sin(a) * 4)); }
  k.tube(pts, 0.42, k.tin, group, 160, 6);
  return group;
}
/** 공구를 쥔 손 (단순한 장갑 모양). 원점 = 손바닥 가운데, 공구 몸(+y)을 감싼다 */
export function hand(k: Kit3D, side: "left" | "right") {
  const three = k.three, group = new three.Group();
  const skin = k.std("#f0c3a0", { rough: 0.75 });
  const s = side === "left" ? -1 : 1;
  const palm = k.mesh(new three.CapsuleGeometry(7.5, 14, 6, 14), skin, group); palm.scale.set(1, 1, 0.62); palm.position.set(s * 8.5, 0, 0);
  const thumb = k.mesh(new three.CapsuleGeometry(2.6, 9, 4, 10), skin, group); thumb.position.set(s * 2.5, -9, 4.5); thumb.rotation.set(0.5, 0, s * 0.5);
  for (let i = 0; i < 3; i++) { const f = k.mesh(new three.CapsuleGeometry(2.3, 7, 4, 10), skin, group); f.position.set(s * 1.5, 4 - i * 5.2, -4.2); f.rotation.set(Math.PI / 2, 0, 0); }
  return group;
}
/** 와이어 스트리퍼. 원점 = 홈(전선 들어가는 곳), 손잡이는 +z */
export function wireStripper(k: Kit3D) {
  const three = k.three, group = new three.Group();
  const jaw = k.std("#8f959c", { metal: 1, rough: 0.35 });
  k.box(4.5, 3, 16, jaw, -2.4, 0, 6, group); k.box(4.5, 3, 16, jaw, 2.4, 0, 6, group);
  for (let i = 0; i < 4; i++) k.box(10.5, 3.2, 0.7, k.std("#2b2d31", { rough: 0.6 }), 0, 0.1, 2 + i * 3, group);
  k.mesh(new three.CylinderGeometry(3.6, 3.6, 4.4, 16), jaw, group).position.set(0, 0, 16);
  for (const s of [-1, 1]) { const h = k.rbox(8, 6.5, 58, 3, k.std("#e8b62e", { rough: 0.7 }), group); h.position.set(s * 7, -3.2, 47); h.rotation.y = s * -0.1; }
  return group;
}
export function flushCutter(k: Kit3D) {
  const three = k.three, group = new three.Group();
  const jaw = k.std("#8f959c", { metal: 1, rough: 0.35 });
  const j1 = k.box(3, 3, 14, jaw, -1.6, 0, 7, group); j1.rotation.y = 0.08;
  const j2 = k.box(3, 3, 14, jaw, 1.6, 0, 7, group); j2.rotation.y = -0.08;
  k.mesh(new three.CylinderGeometry(3.2, 3.2, 4, 16), jaw, group).position.set(0, 0, 15);
  for (const s of [-1, 1]) { const h = k.rbox(7, 6, 52, 3, k.std("#d8452f", { rough: 0.7 }), group); h.position.set(s * 6.5, -3, 42); h.rotation.y = s * -0.12; }
  return group;
}

/** 멀티미터 프로브. 원점 = 바늘 끝, 손잡이는 +y. */
export function probe(k: Kit3D, color: string) {
  const three = k.three, group = new three.Group();
  const needle = k.mesh(new three.CylinderGeometry(0.25, 0.6, 14, 10), k.steel, group); needle.position.y = 7;
  const guard = k.mesh(new three.CylinderGeometry(4.2, 4.2, 2, 20), k.std(color, { rough: 0.6 }), group); guard.position.y = 15;
  const handle = k.mesh(new three.CylinderGeometry(3.2, 3.6, 70, 20), k.std(color, { rough: 0.55 }), group); handle.position.y = 51;
  return group;
}

// ───────────────────────── 프로젝트 부품 (부품 카드 기반) ─────────────────────────

export type ModuleSpec = {
  catalogId?: string; partType?: string; model: string; color?: string;
  foot: { x: number; y: number; w: number; h: number; rotation: number };
  pinXY: Array<{ name: string; x: number; y: number }>;
};
export type ModuleModel = { group: T.Group; pinLocal: Map<string, T.Vector3>; lift: number; led?: { lens: T.MeshStandardMaterial; glow: T.PointLight }; tails: T.Mesh[] };

const PCB_COLOR: Record<string, string> = {
  "arduino-uno-r3": "#14808a", "arduino-nano": "#1f5fae", "esp32-devkit-v1": "#1c1d20", "xiao-esp32s3-sense": "#24262a",
  "raspberry-pi-pico": "#2d7a3c", "nucode-nu40-dk": "#1e4f8f", "seeed-round-display-xiao": "#1c1d20", "ssd1306-oled-128x64": "#1d4fae",
  "tp4056-protected": "#2a4fb0", "mt3608-boost": "#2a4fb0", "ams1117-3v3": "#2a4fb0", "hc-sr04": "#1f5fae", "aht20-module": "#1c1d20",
  "mpu6050-gy521": "#1d4fae", "inmp441-i2s-mic": "#2a4fb0", "drv8833-driver": "#b8232b"
};
const TYPE_COLOR: Record<string, string> = { power: "#2a4fb0", board: "#2a6f5f", display: "#1d4fae", sensor: "#1d4fae", actuator: "#2a6fd0", input: "#2f3238", indicator: "#2f3238", passive: "#2f3238", audio: "#1f2023" };

/**
 * 부품 카드로 만드는 3D 부품. 원점 = 자리(foot) 가운데, 기판 윗면. x = 가이드 x, z = 가이드 y.
 * onBreadboard면 모듈 기판을 핀 길이만큼 띄우고 핀이 아래로 꽂힌다.
 * pinLocal: 전선·납땜이 닿는 핀 윗점 (원점 기준).
 */
export function moduleModel(k: Kit3D, spec: ModuleSpec, onBreadboard: boolean): ModuleModel {
  const three = k.three, group = new three.Group();
  const { foot } = spec;
  const cx = foot.x + foot.w / 2, cy = foot.y + foot.h / 2;
  // 몸체는 회전 전 좌표로 만들고 돌린다. 핀은 이미 회전된 좌표라 그대로 둔다.
  const body = new three.Group(); body.rotation.y = (-foot.rotation * Math.PI) / 180; group.add(body);
  const pins = spec.pinXY.map((p) => ({ name: p.name, x: p.x - cx, z: p.y - cy }));
  const pinLocal = new Map<string, T.Vector3>();
  const id = spec.catalogId ?? "";
  const tails: T.Mesh[] = [];
  const W = foot.w, D = foot.h;
  const along = () => { // 두 핀 사이 축 (저항·LED)
    if (pins.length < 2) return { mid: new three.Vector3(), len: Math.max(W, D) * 0.6, ang: 0 };
    const a = pins[0], b = pins[1];
    return { mid: new three.Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2), len: Math.hypot(b.x - a.x, b.z - a.z), ang: Math.atan2(-(b.z - a.z), b.x - a.x) };
  };

  if (id === "led-5mm" || id === "resistor") {
    const ax = along();
    const sub = new three.Group(); sub.position.copy(ax.mid); sub.rotation.y = ax.ang; group.add(sub);
    let led: ModuleModel["led"];
    if (id === "resistor") { const r = resistor(k, Math.max(7.62, ax.len), 220, onBreadboard ? 6 : 1.6); sub.add(r.group); r.tails.forEach((t) => (t.visible = false)); }
    else { const l = led5(k, spec.color ?? "#ff3b2f", onBreadboard ? 6 : 1.6); sub.add(l.group); l.tails.forEach((t) => (t.visible = false)); led = { lens: l.lens, glow: l.glow as T.PointLight }; }
    for (const p of pins) pinLocal.set(p.name, new three.Vector3(p.x, 0.6, p.z));
    return { group, pinLocal, lift: 0, led, tails };
  }

  const lift = onBreadboard && !["sg90-servo"].includes(id) ? 10.5 : 0;
  const T2 = 1.6;
  const pcbCol = PCB_COLOR[id] ?? spec.color ?? TYPE_COLOR[spec.partType ?? ""] ?? "#2a6f5f";
  const pcbLike = !["sg90-servo", "active-buzzer", "tact-switch-12mm", "potentiometer-10k", "fsr-402", "ws2812b-ring-12", "holder-18650", "lipo-1s-jstph", "slide-switch-spdt"].includes(id);

  if (pcbLike) {
    const pxmm = 14;
    const tex = k.canvasTex(`mod-${id || spec.model}-${W.toFixed(1)}x${D.toFixed(1)}-${pins.length}`, Math.max(64, Math.round(W * pxmm)), Math.max(64, Math.round(D * pxmm)), (x, w, h) => {
      x.fillStyle = pcbCol; x.fillRect(0, 0, w, h);
      x.strokeStyle = "rgba(255,255,255,.07)"; x.lineWidth = 5; for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo((i * 0.13 * w) % w, h * 0.2); x.lineTo(((i * 0.13 + 0.08) * w) % w, h * 0.8); x.stroke(); }
      x.fillStyle = "rgba(255,255,255,.88)"; x.textAlign = "center"; x.textBaseline = "middle";
      const fs = Math.max(10, Math.min(2.6 * pxmm, (w / Math.max(6, spec.model.length)) * 1.3));
      x.font = `700 ${fs}px "IBM Plex Sans KR", sans-serif`; x.fillText(spec.model.replace(/\(.*?\)/g, "").trim().slice(0, 28), w / 2, h * 0.5);
    });
    const side = k.std(pcbCol, { rough: 0.6 });
    const pcb = k.mesh(new three.BoxGeometry(W, T2, D), [side, side, k.std("#fff", { map: tex, rough: 0.55 }), side, side, side], body);
    pcb.position.y = lift + T2 / 2;
    // 보드: 마이크로컨트롤러 칩 + USB
    if (spec.partType === "board" || id.startsWith("arduino") || id.startsWith("esp32") || id.startsWith("xiao") || id.startsWith("raspberry")) {
      const chipW = Math.min(W, D) * 0.32;
      k.box(chipW, 1.1, chipW, k.std("#141414", { rough: 0.45 }), W * 0.08, lift + T2 + 0.55, 0, body);
      const usbW = Math.min(9, Math.min(W, D) * 0.45);
      const usb = k.box(usbW, 3.2, 6.5, k.steel, -W / 2 + 3.2, lift + T2 + 1.6, 0, body); usb.rotation.y = Math.PI / 2;
      if (id === "arduino-uno-r3") { k.box(12, 11, 16, k.steel, -W / 2 + 6, lift + T2 + 5.5, -D / 2 + 13, body); k.box(14, 11, 9, k.std("#151515"), -W / 2 + 7, lift + T2 + 5.5, D / 2 - 9, body); }
      if (id === "esp32-devkit-v1") { k.box(W * 0.62, 0.9, D * 0.3, k.steel, 0, lift + T2 + 0.45, -D / 2 + D * 0.2, body); }
    }
    if (id === "ssd1306-oled-128x64") {
      const scr = k.box(W * 0.84, 0.9, D * 0.56, new three.MeshStandardMaterial({ color: "#07090c", roughness: 0.15, metalness: 0.2, emissive: "#1b6fd8", emissiveIntensity: 0 }), 0, lift + T2 + 0.45, D * 0.1, body);
      scr.userData.screen = true;
    }
    if (id === "hc-sr04") for (const sx of [-1, 1]) { const can = k.mesh(new three.CylinderGeometry(8, 8, 12, 32), k.steel, body); can.position.set(sx * W * 0.26, lift + T2 + 6, 0); const mesh = k.mesh(new three.CylinderGeometry(6.5, 6.5, 0.4, 24), k.std("#2a2b2e", { rough: 0.9 }), body); mesh.position.set(sx * W * 0.26, lift + T2 + 12.2, 0); }
    if (id === "tp4056-protected") { k.box(7.5, 2.6, 5.6, k.steel, -W / 2 + 3, lift + T2 + 1.3, 0, body); k.box(3.2, 1, 4, k.std("#151515"), W * 0.08, lift + T2 + 0.5, -D * 0.15, body); }
    if (id === "mt3608-boost") { k.box(6.5, 4.5, 3.5, k.std("#2563c9"), W * 0.2, lift + T2 + 2.25, -D * 0.2, body); const coil = k.mesh(new three.CylinderGeometry(2.8, 2.8, 3, 20), k.std("#3a3a3a"), body); coil.position.set(-W * 0.12, lift + T2 + 1.5, 0); }
    if (id === "drv8833-driver" || id === "ams1117-3v3" || id === "inmp441-i2s-mic") k.box(Math.min(W, D) * 0.3, 1, Math.min(W, D) * 0.3, k.std("#151515"), 0, lift + T2 + 0.5, 0, body);
    if (spec.partType === "sensor" && id !== "fsr-402" && id !== "hc-sr04") k.box(Math.min(W, D) * 0.25, 1, Math.min(W, D) * 0.25, k.std("#151515"), 0, lift + T2 + 0.5, -D * 0.15, body);
  } else if (id === "sg90-servo") {
    // 실제 몸체(22.2×11.8×22.7mm)는 자리 오른쪽에, 3핀 커넥터는 카드 핀 위치에. 둘을 케이블로 잇는다.
    const blue = k.std("#2563c9", { rough: 0.5 });
    const bw = 22.2, bd = 11.8, bx = W / 2 - bw / 2 - 2;
    k.box(bw, 22.7, bd, blue, bx, 11.35, 0, body);
    k.box(bw + 10, 2.5, bd, blue, bx, 16, 0, body);
    const top = k.mesh(new three.CylinderGeometry(5.6, 5.6, 4, 24), blue, body); top.position.set(bx - 5, 24.6, 0);
    const horn = k.rbox(6, 1.6, 26, 2.5, k.std("#f4f4f2", { rough: 0.5 }), body); horn.position.set(bx - 5, 26.8, 0); horn.rotation.y = Math.PI / 2;
    if (pins.length) {
      const pc = pins.reduce((a, p) => ({ x: a.x + p.x / pins.length, z: a.z + p.z / pins.length }), { x: 0, z: 0 });
      const conn = k.box(3, 4, 8, k.std("#18191b", { rough: 0.5 }), pc.x, 2, pc.z, group);
      conn.rotation.y = Math.abs(pins[0].x - pins[pins.length - 1].x) > Math.abs(pins[0].z - pins[pins.length - 1].z) ? Math.PI / 2 : 0;
      const start = new three.Vector3(bx - bw / 2, 6, 0).applyAxisAngle(new three.Vector3(0, 1, 0), body.rotation.y);
      ["#6b4a2b", "#d8322a", "#e8892e"].forEach((c, i) => k.tube([start.clone().add(new three.Vector3(0, 0, (i - 1) * 1.1)), new three.Vector3((start.x + pc.x) / 2, 1.2, (start.z + pc.z) / 2 + (i - 1) * 1.1), new three.Vector3(pc.x + 2, 2.5, pc.z + (i - 1) * 1.1)], 0.5, k.std(c, { rough: 0.5 }), group, 20, 6));
    }
  } else if (id === "ws2812b-ring-12") {
    const R = Math.max(W, D) / 2 || 18.5;
    const ring = k.mesh(new three.RingGeometry(R * 0.63, R, 48), k.std("#18191b", { rough: 0.55 }), body); ring.rotation.x = -Math.PI / 2; ring.position.y = 1.7;
    const rim = k.mesh(new three.CylinderGeometry(R, R, 1.6, 48, 1, true), k.std("#18191b"), body); rim.position.y = 0.8;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; k.box(5, 1.6, 5, k.std("#f2f2ef", { rough: 0.3 }), Math.cos(a) * R * 0.82, 2.5, Math.sin(a) * R * 0.82, body); }
  } else if (id === "holder-18650") {
    k.rbox(Math.max(W, 77), 5, Math.max(Math.min(D, 22), 21), 2, k.std("#18191b"), body);
    const cell = k.mesh(new three.CylinderGeometry(9, 9, 65, 32), k.std("#3a7bd5", { rough: 0.35, metal: 0.2 }), body); cell.rotation.z = Math.PI / 2; cell.position.y = 11;
  } else if (id === "lipo-1s-jstph") {
    k.rbox(Math.max(W, 36), 4.8, Math.max(D, 29), 2, k.std("#c9ccd1", { metal: 0.6, rough: 0.35 }), body);
  } else if (id === "slide-switch-spdt") {
    k.box(8.5, 3.5, 3.7, k.std("#1b1b1d"), 0, 1.75, 0, body); k.box(1.6, 4, 1.6, k.std("#2d2d30"), 1.5, 5.5, 0, body);
  } else if (id === "active-buzzer") {
    const b = k.mesh(new three.CylinderGeometry(6, 6, 9, 32), k.std("#1b1b1d", { rough: 0.45 }), body); b.position.y = (onBreadboard ? 3 : 0) + 4.5;
    const hole = k.mesh(new three.CylinderGeometry(1, 1, 0.2, 16), k.std("#000"), body); hole.position.y = (onBreadboard ? 3 : 0) + 9.05;
  } else if (id === "tact-switch-12mm") {
    k.box(12, 3.6, 12, k.std("#202125", { rough: 0.5 }), 0, 1.8, 0, body);
    k.box(12.3, 0.4, 12.3, k.steel, 0, 3.8, 0, body);
    const cap = k.mesh(new three.CylinderGeometry(3.4, 3.4, 3.2, 24), k.std("#d9442f", { rough: 0.5 }), body); cap.position.y = 5.6;
  } else if (id === "potentiometer-10k") {
    k.box(Math.min(W, 10), 6, Math.min(D, 10), k.std("#2b5fd0", { rough: 0.5 }), 0, 3, 0, body);
    const knob = k.mesh(new three.CylinderGeometry(2.2, 2.2, 7, 18), k.std("#e9e9e4", { rough: 0.5 }), body); knob.position.y = 9.5;
  } else {
    k.rbox(Math.max(4, W), 2.4, Math.max(4, D), 1.2, k.std(spec.color ?? "#3b3e44", { rough: 0.5 }), body);
  }

  // 핀: 브레드보드면 아래로 꽂히는 금색 핀, 아니면 패드 위로 짧게 나온 핀
  for (const p of pins) {
    const topY = pcbLike ? lift + T2 : 2.5;
    if (pcbLike) {
      const pad = k.mesh(new three.CylinderGeometry(0.95, 0.95, 0.12, 16), k.gold, group); pad.position.set(p.x, topY + 0.06, p.z);
      if (lift > 0) { const leg = k.mesh(new three.BoxGeometry(0.64, lift + T2 + 2, 0.64), k.gold, group); leg.position.set(p.x, (lift + T2 + 2) / 2 - 0.2, p.z); }
      const stub = k.mesh(new three.BoxGeometry(0.64, 2.2, 0.64), k.gold, group); stub.position.set(p.x, topY + 1.1, p.z);
      pinLocal.set(p.name, new three.Vector3(p.x, topY, p.z));
    } else {
      const leg = k.mesh(new three.BoxGeometry(0.6, 6, 0.6), k.tin, group); leg.position.set(p.x, onBreadboard ? -1 : 1, p.z);
      pinLocal.set(p.name, new three.Vector3(p.x, 1.0, p.z));
    }
  }
  if (lift > 0 && pins.length) {
    // 헤더 플라스틱 (핀 줄마다)
    const rows = new Map<string, typeof pins>();
    for (const p of pins) { const key = Math.abs(Math.round(p.z / 2.54)) < 1e9 ? `${Math.round(p.z * 2)}` : "x"; rows.set(key, [...(rows.get(key) ?? []), p]); }
    for (const r of rows.values()) if (r.length >= 2) {
      const xs = r.map((p) => p.x), minX = Math.min(...xs), maxX = Math.max(...xs);
      k.box(maxX - minX + 2.54, 2.5, 2.5, k.std("#1d1e20", { rough: 0.55 }), (minX + maxX) / 2, 1.25, r[0].z, group);
    }
  }
  return { group, pinLocal, lift, tails };
}

/** 받침판(나무 작업판). 원점 = 바닥 가운데, 윗면 y = 3. */
export function plate(k: Kit3D, w: number, d: number) {
  const three = k.three, group = new three.Group();
  const tex = k.canvasTex(`plate-${w}x${d}`, 512, Math.round((512 * d) / w), (x, cw, ch) => {
    x.fillStyle = "#e3cfa6"; x.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 60; i++) { x.strokeStyle = `rgba(150,110,60,${0.04 + (i % 3) * 0.02})`; x.lineWidth = 2; x.beginPath(); const y0 = (i * 37) % ch; x.moveTo(0, y0); x.bezierCurveTo(cw * 0.3, y0 + 6, cw * 0.6, y0 - 6, cw, y0 + 3); x.stroke(); }
  });
  const edge = k.std("#cbb17f", { rough: 0.8 });
  const me = k.mesh(new three.BoxGeometry(w, 3, d), [edge, edge, k.std("#fff", { map: tex, rough: 0.8 }), edge, edge, edge], group);
  me.position.y = 1.5; me.userData.board = true;
  group.userData.size = [w, 3, d];
  return { group, topY: 3 };
}
