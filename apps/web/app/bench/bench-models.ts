import type * as T from "three";

// 3D 조립 책상의 절차적 부품 모델 (명세서 2차 v0.1 §2).
// 외부 3D 파일 없이 코드로 만든다. 단위는 mm.
// 각 모델의 원점과 핀 위치 규칙은 함수 주석에 적는다. 장면 엔진(bench-scene.ts)이 이 규칙으로 조립한다.

type Three = typeof T;
export const PITCH = 2.54;

export class Kit3D {
  private mats = new Map<string, T.Material>();
  private texCache = new Map<string, T.Texture>();
  private geos = new Map<string, T.BufferGeometry>();
  /** 저사양 모드: 가장 작은 장식(다리·SMD 부품)을 뺀다 */
  light = false;
  /** 미리 그려 둔 Wokwi 부품 그림 (태그 → 캔버스). wokwi-art.ts가 채운다 */
  readonly art = new Map<string, HTMLCanvasElement>();
  constructor(readonly three: Three, readonly maxAniso: number) {}

  /** 같은 모양은 한 번만 만든다 */
  geo(key: string, make: () => T.BufferGeometry) {
    let g = this.geos.get(key);
    if (!g) { g = make(); this.geos.set(key, g); }
    return g;
  }
  /** 작은 부품 여러 개를 InstancedMesh 하나로. at = [x, y, z, 회전Y?] */
  inst(g: T.BufferGeometry, m: T.Material, at: Array<[number, number, number, number?]>, parent?: T.Object3D, shadow = false) {
    const im = new this.three.InstancedMesh(g, m, Math.max(1, at.length));
    const o = new this.three.Object3D();
    at.forEach(([x, y, z, r], i) => { o.position.set(x, y, z); o.rotation.set(0, r ?? 0, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.count = at.length;
    im.castShadow = shadow; im.receiveShadow = true;
    im.computeBoundingSphere();
    parent?.add(im);
    return im;
  }
  /** Wokwi 그림을 텍스처로 (미리 불러온 것만, 없으면 null) */
  artTex(tag: string) {
    const cv = this.art.get(tag);
    if (!cv) return null;
    const key = `art:${tag}`;
    let t = this.texCache.get(key);
    if (!t) {
      t = new this.three.CanvasTexture(cv);
      t.colorSpace = this.three.SRGBColorSpace; t.anisotropy = this.maxAniso;
      this.texCache.set(key, t);
    }
    return t;
  }

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
  const three = k.three, H = 8.5, W = 82, D = 54.6, CH = 1.3; // CH = 가운데 홈 반폭
  const pxmm = Math.min(20, 2048 / W);
  const rx = (r: number) => -((rowsN - 1) * PITCH) / 2 + (r - 1) * PITCH;
  const cz = (c: number) => (c < 5 ? -(3.81 + (4 - c) * PITCH) : 3.81 + (c - 5) * PITCH);
  const railZ = [-(13.97 + 5.3), -(13.97 + 7.84), 13.97 + 5.3, 13.97 + 7.84];
  const tex = k.canvasTex(`bb2-${rowsN}`, Math.round(W * pxmm), Math.round(D * pxmm), (x, w, h) => {
    const X = (v: number) => (v + W / 2) * pxmm, Z = (v: number) => (v + D / 2) * pxmm, P = pxmm;
    x.fillStyle = "#f5f3ee"; x.fillRect(0, 0, w, h);
    // 아주 옅은 플라스틱 결
    x.globalAlpha = 0.05; for (let i = 0; i < 1400; i++) { x.fillStyle = i % 2 ? "#000" : "#fff"; x.fillRect((i * 997) % w, (i * 613) % h, 2, 2); } x.globalAlpha = 1;
    // 전원 레일과 본판 사이의 얕은 홈
    x.fillStyle = "rgba(0,0,0,.07)"; for (const zz of [-(13.97 + 3.1), 13.97 + 3.1]) x.fillRect(0, Z(zz) - 0.25 * P, w, 0.5 * P);
    // 가운데 홈 (실제 홈은 모델 모양으로 판다. 여기선 가장자리 그늘)
    const g = x.createLinearGradient(0, Z(-CH - 0.6), 0, Z(CH + 0.6)); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.3, "rgba(0,0,0,.14)"); g.addColorStop(0.7, "rgba(0,0,0,.14)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, Z(-CH - 0.6), w, (2 * CH + 1.2) * P);
    // 구멍: 네모 입구 + 안쪽 그늘 + 아래쪽 밝은 턱
    const hole = (px: number, py: number) => {
      x.fillStyle = "#dedad1"; x.fillRect(px - 0.78 * P, py - 0.78 * P, 1.56 * P, 1.56 * P);
      x.fillStyle = "#1f1d1a"; x.fillRect(px - 0.5 * P, py - 0.5 * P, 1.0 * P, 1.0 * P);
      x.fillStyle = "#4a4640"; x.fillRect(px - 0.5 * P, py + 0.22 * P, 1.0 * P, 0.28 * P);
      x.fillStyle = "rgba(255,255,255,.7)"; x.fillRect(px - 0.78 * P, py + 0.66 * P, 1.56 * P, 0.12 * P);
    };
    for (let r = 1; r <= rowsN; r++) for (let c = 0; c < 10; c++) hole(X(rx(r)), Z(cz(c)));
    for (const z of railZ) for (let r = 1; r <= rowsN; r++) if ((r - 1) % 6 !== 5) hole(X(rx(r)), Z(z));
    // 레일 선과 +/− 표시
    x.lineWidth = 0.32 * P; x.lineCap = "round";
    const rails: Array<[number, string, string]> = [[railZ[1] - 2, "#d43b32", "+"], [railZ[0] + 2, "#2d63c8", "−"], [railZ[2] - 2, "#d43b32", "+"], [railZ[3] + 2, "#2d63c8", "−"]];
    x.font = `700 ${2.0 * P}px "IBM Plex Sans KR", sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
    for (const [z, col, sign] of rails) {
      x.strokeStyle = col; x.beginPath(); x.moveTo(X(-W / 2 + 5), Z(z)); x.lineTo(X(W / 2 - 5), Z(z)); x.stroke();
      x.fillStyle = col; x.fillText(sign, X(-W / 2 + 2.4), Z(z)); x.fillText(sign, X(W / 2 - 2.4), Z(z));
    }
    // 열 글자, 행 번호
    x.fillStyle = "#77736b"; x.font = `600 ${1.45 * P}px "IBM Plex Sans KR", sans-serif`;
    for (let c = 0; c < 10; c++) { x.fillText(COLS[c].toLowerCase(), X(rx(1) - 2.6), Z(cz(c))); x.fillText(COLS[c].toLowerCase(), X(rx(rowsN) + 2.6), Z(cz(c))); }
    x.font = `600 ${1.2 * P}px "IBM Plex Sans KR", sans-serif`;
    for (let r = 1; r <= rowsN; r++) if (r === 1 || r % 5 === 0) { x.fillText(String(r), X(rx(r)), Z(cz(0) - 2.1)); x.fillText(String(r), X(rx(r)), Z(cz(9) + 2.1)); }
  });
  const side = k.std("#ebe8e0", { rough: 0.7 });
  const topM = k.std("#ffffff", { map: tex, rough: 0.7, key: `bb2-top-${rowsN}` });
  const group = new three.Group();
  // 몸통 = 앞·뒤 두 판 + 가운데 홈 바닥 (홈 깊이 1.6mm)
  const half = (D / 2 - CH);
  for (const s of [-1, 1]) {
    const cz0 = s * (CH + half / 2);
    const g = new three.BoxGeometry(W, H, half); mapTopUV(g, 0, cz0, W, D);
    const me = k.mesh(g, [side, side, topM, side, side, side], group);
    me.position.set(0, H / 2, cz0); me.userData.board = true;
  }
  const floor = k.mesh(new three.BoxGeometry(W, H - 1.6, CH * 2), k.std("#d9d5cc", { rough: 0.75 }), group);
  floor.position.y = (H - 1.6) / 2; floor.userData.board = true;
  // 옆면 끼움 홈(다른 브레드보드와 잇는 돌기 자리)
  if (!k.light) for (const s of [-1, 1]) for (const zz of [-16, 16]) k.box(0.6, H - 2, 3.2, k.std("#dcd8cf", { rough: 0.7 }), s * (W / 2 + 0.3), H / 2, zz, group);
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

// ───────────────────────── 실물 부품 디테일 ─────────────────────────

/** 박스 윗면(+y) UV를 큰 판(W×D, 가운데 원점) 안의 자리로 맞춘다. cx, cz = 이 박스의 가운데 */
function mapTopUV(g: T.BufferGeometry, cx: number, cz: number, W: number, D: number) {
  const pos = g.attributes.position as T.BufferAttribute, uv = g.attributes.uv as T.BufferAttribute;
  for (let i = 8; i < 12; i++) uv.setXY(i, (pos.getX(i) + cx + W / 2) / W, 1 - (pos.getZ(i) + cz + D / 2) / D);
  uv.needsUpdate = true;
}

/** 암 헤더 윗면 한 칸 (네모 구멍). u를 칸 수만큼 늘려 반복한다 */
function femaleCellTex(k: Kit3D) {
  const t = k.canvasTex("hdr-f-cell", 64, 64, (x, w, h) => {
    x.fillStyle = "#1c1c1e"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#2a2a2d"; x.fillRect(w * 0.16, h * 0.16, w * 0.68, h * 0.68);
    x.fillStyle = "#050505"; x.fillRect(w * 0.27, h * 0.27, w * 0.46, h * 0.46);
    x.fillStyle = "rgba(226,183,90,.55)"; x.fillRect(w * 0.42, h * 0.36, w * 0.16, h * 0.28);
  });
  t.wrapS = k.three.RepeatWrapping;
  return t;
}
/** 암 헤더 n칸. 원점 = 바닥 가운데, 길이 방향 x */
export function headerFemale(k: Kit3D, n: number, parent: T.Object3D, x: number, y: number, z: number, rotY = 0, h = 8.5) {
  const g = k.geo(`hdrF-${n}-${h}`, () => {
    const b = new k.three.BoxGeometry(n * PITCH, h, PITCH);
    const uv = b.attributes.uv as T.BufferAttribute;
    for (let i = 8; i < 12; i++) uv.setX(i, uv.getX(i) * n);
    b.translate(0, h / 2, 0);
    return b;
  });
  const black = k.std("#1c1c1e", { rough: 0.6 });
  const top = k.std("#ffffff", { map: femaleCellTex(k), rough: 0.6, key: "hdrF-top" });
  const me = k.mesh(g, [black, black, top, black, black, black], parent);
  me.position.set(x, y, z); me.rotation.y = rotY;
  return me;
}

/** 금색 수 핀 여러 개 (검은 받침 위). at = 핀 자리 [x, z], 받침은 따로 */
function malePins(k: Kit3D, parent: T.Object3D, y0: number, at: Array<[number, number]>, above = 6, base = 2.5) {
  const g = k.geo(`mpin-${above}-${base}`, () => { const b = new k.three.BoxGeometry(0.64, above + base, 0.64); b.translate(0, (above + base) / 2, 0); return b; });
  k.inst(g, k.gold, at.map(([x, z]) => [x, y0, z]), parent, true);
}

/** 앞면에 그림이 있는 상자 (USB 소켓·DC 잭 등). face: BoxGeometry 면 번호 */
function facedBox(k: Kit3D, w: number, h: number, d: number, base: T.Material, faceMat: T.Material, face: number, topMat?: T.Material) {
  const mats = [base, base, topMat ?? base, base, base, base]; mats[face] = faceMat;
  return k.mesh(new k.three.BoxGeometry(w, h, d), mats);
}

function usbBFaceTex(k: Kit3D) {
  return k.canvasTex("usbB-face", 128, 128, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#dfe3e8"); g.addColorStop(1, "#a9aeb5");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // USB-B 입구: 위 두 모서리가 깎인 네모
    const L = w * 0.2, R = w * 0.8, Tp = h * 0.18, B = h * 0.86, c = w * 0.12;
    x.fillStyle = "#121315"; x.beginPath(); x.moveTo(L + c, Tp); x.lineTo(R - c, Tp); x.lineTo(R, Tp + c); x.lineTo(R, B); x.lineTo(L, B); x.lineTo(L, Tp + c); x.closePath(); x.fill();
    x.fillStyle = "#ecebe6"; x.fillRect(w * 0.34, h * 0.36, w * 0.32, h * 0.34);
    x.fillStyle = "#c9a54e"; for (const u of [0.38, 0.6]) for (const v of [0.4, 0.6]) x.fillRect(w * u, h * v, w * 0.04, h * 0.06);
    x.strokeStyle = "rgba(0,0,0,.25)"; x.lineWidth = 3; x.strokeRect(2, 2, w - 4, h - 4);
  });
}
function usbBTopTex(k: Kit3D) {
  return k.canvasTex("usbB-top", 128, 128, (x, w, h) => {
    x.fillStyle = "#c3c8ce"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "rgba(60,64,70,.35)"; x.lineWidth = 2;
    x.strokeRect(w * 0.08, h * 0.1, w * 0.84, h * 0.8);
    x.beginPath(); x.moveTo(w * 0.25, h * 0.1); x.lineTo(w * 0.25, h * 0.9); x.stroke();
    x.fillStyle = "rgba(60,64,70,.3)"; for (const v of [0.3, 0.7]) x.fillRect(w * 0.5, h * v - 4, w * 0.3, 8);
  });
}
function jackFaceTex(k: Kit3D) {
  return k.canvasTex("jack-face", 128, 128, (x, w, h) => {
    x.fillStyle = "#1d1d20"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#08080a"; x.beginPath(); x.arc(w / 2, h * 0.5, w * 0.3, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#b9bec6"; x.beginPath(); x.arc(w / 2, h * 0.5, w * 0.08, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "rgba(255,255,255,.08)"; x.lineWidth = 3; x.strokeRect(3, 3, w - 6, h - 6);
  });
}
function dipTopTex(k: Kit3D, mark: string, sub: string) {
  return k.canvasTex(`dip-${mark}`, 1024, 192, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#2c2e31"); g.addColorStop(1, "#232527");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = "#141516"; x.beginPath(); x.arc(w, h / 2, h * 0.13, 0, Math.PI * 2); x.fill(); // 홈(1번 핀 쪽)
    x.fillStyle = "#1a1b1d"; for (const u of [0.11, 0.86]) { x.beginPath(); x.arc(w * u, h / 2, h * 0.14, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = "#9a9ea3"; x.textAlign = "center"; x.textBaseline = "middle";
    x.font = `600 ${h * 0.24}px "IBM Plex Sans KR", monospace`; x.fillText(mark, w * 0.48, h * 0.4);
    x.font = `500 ${h * 0.17}px "IBM Plex Sans KR", monospace`; x.fillText(sub, w * 0.48, h * 0.7);
  });
}
function chipTopTex(k: Kit3D, mark: string) {
  return k.canvasTex(`chip-${mark}`, 128, 128, (x, w, h) => {
    x.fillStyle = "#1e1f21"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#3a3c40"; x.beginPath(); x.arc(w * 0.18, h * 0.18, w * 0.07, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#8d9196"; x.textAlign = "center"; x.textBaseline = "middle";
    x.font = `600 ${h * 0.2}px monospace`; x.fillText(mark, w / 2, h * 0.55);
  });
}
/** SMD 전해 캐패시터 윗면: 알루미늄, 십자 벤트, 극성 표시(검은 반달) */
function capTopTex(k: Kit3D) {
  return k.canvasTex("ecap-top", 128, 128, (x, w, h) => {
    const g = x.createRadialGradient(w * 0.4, h * 0.4, 4, w / 2, h / 2, w / 2); g.addColorStop(0, "#f1f3f5"); g.addColorStop(1, "#aeb4bb");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = "#24262a"; x.beginPath(); x.arc(w / 2, h / 2, w / 2, Math.PI * 0.62, Math.PI * 1.38); x.closePath(); x.fill();
    x.strokeStyle = "rgba(70,74,80,.75)"; x.lineWidth = 4;
    x.beginPath(); x.moveTo(w * 0.5, h * 0.24); x.lineTo(w * 0.5, h * 0.76); x.moveTo(w * 0.28, h * 0.5); x.lineTo(w * 0.72, h * 0.5); x.stroke();
  });
}
function crystalTopTex(k: Kit3D) {
  return k.canvasTex("xtal-top", 256, 100, (x, w, h) => {
    x.fillStyle = "#d3d7dc"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#5b6067"; x.font = `700 ${h * 0.42}px monospace`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("16.000", w / 2, h / 2 + 2);
  });
}

/** 스테디움(양 끝이 반원) 모양 기둥: 크리스털 캔 */
function stadium(k: Kit3D, len: number, wid: number, h: number) {
  return k.geo(`stadium-${len}-${wid}-${h}`, () => {
    const three = k.three, r = wid / 2, a = len / 2 - r, s = new three.Shape();
    s.moveTo(-a, -r); s.lineTo(a, -r); s.absarc(a, 0, r, -Math.PI / 2, Math.PI / 2, false); s.lineTo(-a, r); s.absarc(-a, 0, r, Math.PI / 2, Math.PI * 1.5, false);
    const g = new three.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 8 });
    g.rotateX(-Math.PI / 2);
    return g;
  });
}

/**
 * Arduino UNO R3. 좌표는 Wokwi 그림(2D 기판과 같은 그림)의 SVG 좌표(mm)로 적는다.
 * 자리(foot) 72.58×53.34 중 왼쪽 4mm는 USB·DC 잭이 기판 밖으로 나온 자리다.
 */
function unoBoard(k: Kit3D, body: T.Group, lift: number, W: number, D: number, art: T.Texture | null) {
  const three = k.three, T2 = 1.6, y0 = lift + T2;
  const X = (sx: number) => sx + 4 - W / 2, Z = (sy: number) => sy - D / 2;
  // 기판 외곽 (오른쪽 위 모서리가 깎이고, 오른쪽 끝이 계단 모양)
  const outline: Array<[number, number]> = [[0.999, 0], [64.514, 0], [66.038, 1.525], [66.038, 12.955], [68.577, 15.494], [68.577, 48.26], [66.038, 50.799], [66.038, 52.339], [65.039, 53.338], [0.999, 53.338], [0, 52.339], [0, 0.999]];
  const holes: Array<[number, number]> = [[15.24, 2.54], [13.97, 50.8], [66.04, 17.78], [66.04, 45.72]];
  const g = k.geo(`uno-pcb-${W}-${D}`, () => {
    const s = new three.Shape();
    outline.forEach(([sx, sy], i) => (i ? s.lineTo(X(sx), -Z(sy)) : s.moveTo(X(sx), -Z(sy))));
    for (const [hx, hy] of holes) { const p = new three.Path(); p.absarc(X(hx), -Z(hy), 1.6, 0, Math.PI * 2, true); s.holes.push(p); }
    const e = new three.ExtrudeGeometry(s, { depth: T2, bevelEnabled: false, curveSegments: 10 });
    e.rotateX(-Math.PI / 2);
    const pos = e.attributes.position as T.BufferAttribute, uv = e.attributes.uv as T.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + W / 2) / W, 1 - (pos.getZ(i) + D / 2) / D);
    return e;
  });
  const tex = art ?? k.canvasTex("uno-fallback", 1024, 752, (x, w, h) => {
    x.fillStyle = "#2b6b99"; x.fillRect(0, 0, w, h);
    x.fillStyle = "rgba(255,255,255,.9)"; x.textAlign = "center"; x.font = `800 ${h * 0.12}px "IBM Plex Sans KR", sans-serif`; x.fillText("UNO R3", w * 0.55, h * 0.36);
  });
  const pcb = k.mesh(g, [k.std("#ffffff", { map: tex, rough: 0.55, key: `uno-top-${art ? "art" : "fb"}` }), k.std("#1f5578", { rough: 0.6 })], body);
  pcb.position.y = lift;
  pcb.userData.board = true;

  // USB-B 소켓 (기판 밖으로 4mm 나온다), DC 잭
  const usb = facedBox(k, 14.46, 10.9, 11.85, k.std("#c3c8ce", { metal: 0.9, rough: 0.32 }), k.std("#ffffff", { map: usbBFaceTex(k), metal: 0.6, rough: 0.35, key: "usbB-face" }), 1, k.std("#ffffff", { map: usbBTopTex(k), metal: 0.85, rough: 0.32, key: "usbB-top" }));
  usb.position.set(X(3.23), y0 + 5.45, Z(15.295)); body.add(usb);
  const jack = facedBox(k, 13.9, 11, 8.9, k.std("#1b1b1e", { rough: 0.5 }), k.std("#ffffff", { map: jackFaceTex(k), rough: 0.5, key: "jack-face" }), 1);
  jack.position.set(X(4.375), y0 + 5.5, Z(45.61)); body.add(jack);

  // 암 헤더 4줄 (Wokwi 그림의 헤더 자리와 같다)
  for (const [sx, sy, n] of [[17.497, 1.27, 10], [44.421, 1.27, 8], [26.641, 49.53, 8], [49.501, 49.53, 6]] as const) headerFemale(k, n, body, X(sx + 0.19 + (n * PITCH) / 2), y0, Z(sy + 1.27));

  // ATmega328P (DIP-28)
  const dip = k.mesh(k.geo("dip28", () => new three.BoxGeometry(37.35, 3.1, 7.05)), [k.std("#26282a", { rough: 0.5 }), k.std("#26282a", { rough: 0.5 }), k.std("#ffffff", { map: dipTopTex(k, "ATMEGA328P-PU", "1839  AU"), rough: 0.5, key: "dip-top" }), k.std("#26282a"), k.std("#26282a"), k.std("#26282a")], body);
  dip.position.set(X(46.575), y0 + 0.9 + 1.55, Z(36.975));
  if (!k.light) {
    const sh = k.geo("dip-shoulder", () => new three.BoxGeometry(0.5, 0.25, 0.7));
    const lg = k.geo("dip-leg", () => { const b = new three.BoxGeometry(0.45, 1.9, 0.25); b.translate(0, -0.95, 0); return b; });
    const sAt: Array<[number, number, number]> = [], lAt: Array<[number, number, number]> = [];
    for (let i = 0; i < 14; i++) {
      const lx = X(29.965 + i * PITCH);
      for (const [ez, out] of [[33.45, -1], [40.5, 1]] as const) { sAt.push([lx, y0 + 1.7, Z(ez + out * 0.3)]); lAt.push([lx, y0 + 1.75, Z(ez + out * 0.6)]); }
    }
    k.inst(sh, k.tin, sAt, body); k.inst(lg, k.tin, lAt, body);
  }

  // ICSP 헤더 2개 (2×3 수 핀)
  const blackP = k.std("#1d1e20", { rough: 0.55 });
  const icsp: Array<[number, number]> = [];
  k.box(7.62, 2.5, 5.08, blackP, X(17.64), y0 + 1.25, Z(6.8), body);
  for (let i = 0; i < 3; i++) for (const v of [5.53, 8.07]) icsp.push([X(15.1 + i * PITCH), Z(v)]);
  k.box(5.08, 2.5, 7.62, blackP, X(65.4), y0 + 1.25, Z(23.66), body);
  for (let i = 0; i < 3; i++) for (const u of [64.13, 66.67]) icsp.push([X(u), Z(26.2 - i * PITCH)]);
  malePins(k, body, y0, icsp);

  // 리셋 택트 스위치
  k.box(6, 2.2, 6, k.std("#2a2b2e", { rough: 0.5 }), X(6.96), y0 + 1.1, Z(4.53), body);
  k.box(6.2, 0.3, 6.2, k.steel, X(6.96), y0 + 2.35, Z(4.53), body);
  const cap = k.mesh(k.geo("tact-cap", () => new three.CylinderGeometry(1.75, 1.75, 1.2, 16)), k.std("#8f1d1d", { rough: 0.45 }), body); cap.position.set(X(6.96), y0 + 3.1, Z(4.53));

  // USB 변환 칩(ATmega16U2), 16MHz 크리스털, 전해 캐패시터 2개, 레귤레이터
  const qfn = k.mesh(k.geo("qfn5", () => new three.BoxGeometry(5, 0.9, 5)), [k.std("#1e1f21"), k.std("#1e1f21"), k.std("#ffffff", { map: chipTopTex(k, "16U2"), key: "chip-16u2" }), k.std("#1e1f21"), k.std("#1e1f21"), k.std("#1e1f21")], body);
  qfn.position.set(X(19.6), y0 + 0.45, Z(15.4)); qfn.rotation.y = Math.PI / 4;
  const xt = k.mesh(stadium(k, 11, 4.6, 3.5), k.std("#c9cdd2", { metal: 0.9, rough: 0.3 }), body); xt.position.set(X(19), y0, Z(24.2));
  const xl = k.mesh(k.geo("xtal-label", () => new three.PlaneGeometry(8, 3)), k.std("#ffffff", { map: crystalTopTex(k), metal: 0.6, rough: 0.35, key: "xtal-top" }), body, false); xl.rotation.x = -Math.PI / 2; xl.position.set(X(19), y0 + 3.52, Z(24.2));
  const can = k.geo("ecap-can", () => new three.CylinderGeometry(3.15, 3.15, 5.4, 20));
  const canM = [k.std("#b9bfc6", { metal: 0.85, rough: 0.35 }), k.std("#ffffff", { map: capTopTex(k), metal: 0.6, rough: 0.35, key: "ecap-top" }), k.std("#888")];
  for (const sx of [15.6, 22.4]) {
    k.box(6.6, 0.9, 6.6, k.std("#1d1e20", { rough: 0.6 }), X(sx), y0 + 0.45, Z(44.8), body);
    const c = k.mesh(can, canM, body); c.position.set(X(sx), y0 + 0.9 + 2.7, Z(44.8)); c.rotation.y = Math.PI / 2;
  }
  k.box(6.5, 1.7, 3.5, k.std("#1e1f21", { rough: 0.5 }), X(15.2), y0 + 0.85, Z(36.6), body);
  k.box(3.2, 0.3, 1.6, k.tin, X(15.2), y0 + 0.15, Z(38.9), body);
  if (!k.light) {
    // 작은 SMD 저항·캐패시터 (0805)
    const smdB = k.geo("smd0805", () => new three.BoxGeometry(1.4, 0.55, 1.25));
    const smdE = k.geo("smd0805e", () => new three.BoxGeometry(0.35, 0.6, 1.27));
    const tan: Array<[number, number, number, number?]> = [], blk: Array<[number, number, number, number?]> = [], ends: Array<[number, number, number, number?]> = [];
    const spots: Array<[number, number, number, number]> = [[24.2, 13.6, 0, 1], [24.2, 16.4, 0, 0], [24.2, 19.2, 0, 1], [15.4, 19.8, 1, 0], [13.6, 12.2, 1, 1], [22.6, 8.4, 0, 0], [13.2, 29.4, 0, 1], [17.2, 29.4, 0, 0], [21.2, 29.4, 0, 1], [11.6, 33.6, 1, 0], [19.6, 36.4, 1, 1], [21.4, 40.2, 0, 0], [56.4, 22.6, 0, 1], [60.4, 22.6, 0, 0], [52.6, 28.6, 1, 1]];
    for (const [sx, sy, rot, kind] of spots) {
      const r = rot ? Math.PI / 2 : 0, x0 = X(sx), z0 = Z(sy);
      (kind ? blk : tan).push([x0, y0 + 0.28, z0, r]);
      for (const s of [-1, 1]) ends.push(rot ? [x0, y0 + 0.3, z0 + s * 0.85, r] : [x0 + s * 0.85, y0 + 0.3, z0, r]);
    }
    k.inst(smdB, k.std("#c9a77a", { rough: 0.5 }), tan, body); k.inst(smdB, k.std("#1b1b1c", { rough: 0.5 }), blk, body); k.inst(smdE, k.tin, ends, body);
  }
}

/** FSR 402: 둥근 감지 패드(Ø18.3, 감지 영역 Ø12.7) + 가는 꼬리 + 두 다리. 핀 자리는 카드/가이드 그대로 */
function fsrModel(k: Kit3D, body: T.Group, bodyPins: Array<{ x: number; z: number }>, W: number, D: number) {
  const three = k.three;
  const pc = bodyPins.length ? bodyPins.reduce((a, p) => ({ x: a.x + p.x / bodyPins.length, z: a.z + p.z / bodyPins.length }), { x: 0, z: 0 }) : { x: 0, z: D / 2 - 2 };
  const R = Math.min(9.15, Math.max(5, Math.min(W, D) / 2));
  // 패드는 핀 반대쪽 끝에
  let dx = -pc.x, dz = -pc.z; const dl = Math.hypot(dx, dz);
  if (dl < 1) { dx = 0; dz = -1; } else { dx /= dl; dz /= dl; }
  const reach = Math.max(0, Math.max(W, D) / 2 - R);
  const padC = { x: dx * reach, z: dz * reach };
  const y = 1.0, th = 0.4;
  const padTex = k.canvasTex("fsr-pad", 256, 256, (x, w, h) => {
    x.fillStyle = "#2b2c2e"; x.beginPath(); x.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); x.fill();
    const g = x.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.35); g.addColorStop(0, "#c9b98a"); g.addColorStop(1, "#a8996d");
    x.fillStyle = g; x.beginPath(); x.arc(w / 2, h / 2, w * 0.35, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "rgba(90,78,50,.45)"; x.lineWidth = 3;
    for (let i = -6; i <= 6; i++) { const yy = h / 2 + i * w * 0.05; const half = Math.sqrt(Math.max(0, (w * 0.33) ** 2 - (yy - h / 2) ** 2)); x.beginPath(); x.moveTo(w / 2 - half, yy); x.lineTo(w / 2 + half, yy); x.stroke(); }
  });
  const pad = k.mesh(k.geo(`fsr-pad-${R}`, () => new three.CylinderGeometry(R, R, th, 32)), [k.std("#2b2c2e", { rough: 0.6 }), k.std("#ffffff", { map: padTex, rough: 0.45, key: "fsr-pad" }), k.std("#2b2c2e")], body);
  pad.position.set(padC.x, y, padC.z);
  // 꼬리: 패드 → 핀 사이
  const len = Math.max(2, Math.hypot(pc.x - padC.x, pc.z - padC.z) + 1.5);
  const spread = bodyPins.length > 1 ? Math.max(...bodyPins.map((p) => Math.abs((p.x - pc.x) * dz - (p.z - pc.z) * dx))) * 2 : 2.54;
  const tw = Math.max(7, spread + 3);
  const tailTex = k.canvasTex("fsr-tail", 64, 256, (x, w, h) => {
    x.fillStyle = "#2b2c2e"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#b8bcc2"; x.fillRect(w * 0.22, 0, w * 0.14, h); x.fillRect(w * 0.64, 0, w * 0.14, h);
  });
  const tail = k.mesh(new three.BoxGeometry(tw, th * 0.8, len), [k.std("#2b2c2e"), k.std("#2b2c2e"), k.std("#ffffff", { map: tailTex, rough: 0.5, key: "fsr-tail" }), k.std("#2b2c2e"), k.std("#2b2c2e"), k.std("#2b2c2e")], body);
  // 패드 가운데에서 핀 너머 1.5mm까지
  tail.position.set((padC.x + pc.x) / 2 - dx * 0.75, y - 0.02, (padC.z + pc.z) / 2 - dz * 0.75); tail.rotation.y = Math.atan2(dx, dz);
  // 다리 끝 금속 집게(크림프)
  for (const p of bodyPins) { const c = k.box(1.8, 0.7, 3, k.steel, p.x, y, p.z, body); c.rotation.y = Math.atan2(dx, dz); }
}

// ───────────────────────── 프로젝트 부품 (부품 카드 기반) ─────────────────────────

export type ModuleSpec = {
  catalogId?: string; partType?: string; model: string; color?: string;
  /** 가이드의 부품 이름 (저항 값 등을 읽는다: "10k", "220Ω") */
  label?: string;
  /** 부품 카드의 Wokwi 태그 (있으면 2D와 같은 그림을 윗면에 쓴다) */
  wokwiTag?: string;
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
    if (id === "resistor") { const r = resistor(k, Math.max(7.62, ax.len), parseOhms(spec.label) ?? parseOhms(spec.model) ?? 220, onBreadboard ? 6 : 1.6); sub.add(r.group); r.tails.forEach((t) => (t.visible = false)); }
    else { const l = led5(k, spec.color ?? "#ff3b2f", onBreadboard ? 6 : 1.6); sub.add(l.group); l.tails.forEach((t) => (t.visible = false)); led = { lens: l.lens, glow: l.glow as T.PointLight }; }
    for (const p of pins) pinLocal.set(p.name, new three.Vector3(p.x, 0.6, p.z));
    return { group, pinLocal, lift: 0, led, tails };
  }

  const lift = onBreadboard && !["sg90-servo"].includes(id) ? 10.5 : 0;
  const T2 = 1.6;
  const pcbCol = PCB_COLOR[id] ?? spec.color ?? TYPE_COLOR[spec.partType ?? ""] ?? "#2a6f5f";
  const pcbLike = !["sg90-servo", "active-buzzer", "tact-switch-12mm", "potentiometer-10k", "fsr-402", "ws2812b-ring-12", "holder-18650", "lipo-1s-jstph", "slide-switch-spdt"].includes(id);

  const art = spec.wokwiTag ? k.artTex(spec.wokwiTag) : null;
  // 몸체 좌표(회전 전)의 핀 자리
  const bodyPins = pins.map((p) => { const v = new three.Vector3(p.x, 0, p.z).applyAxisAngle(new three.Vector3(0, 1, 0), -body.rotation.y); return { name: p.name, x: v.x, z: v.z }; });
  const uno = id === "arduino-uno-r3";

  if (uno) {
    unoBoard(k, body, lift, W, D, art);
  } else if (pcbLike) {
    const pxmm = 14;
    const tex = art ?? k.canvasTex(`mod-${id || spec.model}-${W.toFixed(1)}x${D.toFixed(1)}-${pins.length}`, Math.max(64, Math.round(W * pxmm)), Math.max(64, Math.round(D * pxmm)), (x, w, h) => {
      x.fillStyle = pcbCol; x.fillRect(0, 0, w, h);
      x.strokeStyle = "rgba(255,255,255,.07)"; x.lineWidth = 5; for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo((i * 0.13 * w) % w, h * 0.2); x.lineTo(((i * 0.13 + 0.08) * w) % w, h * 0.8); x.stroke(); }
      x.fillStyle = "rgba(255,255,255,.88)"; x.textAlign = "center"; x.textBaseline = "middle";
      const fs = Math.max(10, Math.min(2.6 * pxmm, (w / Math.max(6, spec.model.length)) * 1.3));
      x.font = `700 ${fs}px "IBM Plex Sans KR", sans-serif`; x.fillText(spec.model.replace(/\(.*?\)/g, "").trim().slice(0, 28), w / 2, h * 0.5);
    });
    const side = k.std(pcbCol, { rough: 0.6 });
    const pcb = k.mesh(new three.BoxGeometry(W, T2, D), [side, side, k.std("#fff", { map: tex, rough: 0.55 }), side, side, side], body);
    pcb.position.y = lift + T2 / 2;
    // 보드: 마이크로컨트롤러 칩 + USB (Wokwi 그림이 있으면 그림이 보여 준다)
    if (!art && (spec.partType === "board" || id.startsWith("arduino") || id.startsWith("esp32") || id.startsWith("xiao") || id.startsWith("raspberry"))) {
      const chipW = Math.min(W, D) * 0.32;
      k.box(chipW, 1.1, chipW, k.std("#141414", { rough: 0.45 }), W * 0.08, lift + T2 + 0.55, 0, body);
      const usbW = Math.min(9, Math.min(W, D) * 0.45);
      const usb = k.box(usbW, 3.2, 6.5, k.steel, -W / 2 + 3.2, lift + T2 + 1.6, 0, body); usb.rotation.y = Math.PI / 2;
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
  } else if (id === "fsr-402") {
    fsrModel(k, body, bodyPins, W, D);
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

  // 핀: 브레드보드면 아래로 꽂히는 금색 핀, 아니면 패드 위로 짧게 나온 핀. 같은 모양은 InstancedMesh 하나로.
  // UNO는 암 헤더 안에 핀 자리가 있어 패드·짧은 핀을 그리지 않는다 (pinLocal은 그대로).
  const padAt: Array<[number, number, number]> = [], legAt: Array<[number, number, number]> = [], stubAt: Array<[number, number, number]> = [], tinAt: Array<[number, number, number]> = [];
  for (const p of pins) {
    const topY = pcbLike ? lift + T2 : 2.5;
    if (pcbLike) {
      if (!uno) { padAt.push([p.x, topY + 0.06, p.z]); stubAt.push([p.x, topY + 1.1, p.z]); }
      if (lift > 0) legAt.push([p.x, (lift + T2 + 2) / 2 - 0.2, p.z]);
      pinLocal.set(p.name, new three.Vector3(p.x, topY, p.z));
    } else {
      tinAt.push([p.x, onBreadboard ? -1 : 1, p.z]);
      pinLocal.set(p.name, new three.Vector3(p.x, 1.0, p.z));
    }
  }
  if (padAt.length) k.inst(k.geo("mod-pad", () => new three.CylinderGeometry(0.95, 0.95, 0.12, 12)), k.gold, padAt, group);
  if (stubAt.length) k.inst(k.geo("mod-stub", () => new three.BoxGeometry(0.64, 2.2, 0.64)), k.gold, stubAt, group, true);
  if (legAt.length) k.inst(k.geo(`mod-leg-${lift}`, () => new three.BoxGeometry(0.64, lift + T2 + 2, 0.64)), k.gold, legAt, group, true);
  if (tinAt.length) k.inst(k.geo("mod-tinleg", () => new three.BoxGeometry(0.6, 6, 0.6)), k.tin, tinAt, group, true);
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

/** "10k", "4.7kΩ", "220", "1M" → 옴. 못 읽으면 null */
export function parseOhms(s?: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*([kKmM])?\s*(?:Ω|ohm|옴)?(?![\d.])/.exec(s ?? "");
  if (!m) return null;
  const v = Number(m[1]) * (m[2] ? (m[2].toLowerCase() === "k" ? 1e3 : 1e6) : 1);
  return v >= 1 && v < 1e10 ? v : null;
}

/** 점퍼선 끝(듀폰 커넥터). 원점 = 핀 끝(구멍 입구), 몸은 +y로 13mm. 검은 하우징 + 금속 집게 + 선 피복 */
export function dupontEnd(k: Kit3D, wire: T.Material) {
  const three = k.three, group = new three.Group();
  const housing = k.mesh(k.geo("dp-house", () => { const g = new three.BoxGeometry(2.5, 9, 2.5); g.translate(0, 4.5, 0); return g; }), k.std("#18191b", { rough: 0.5 }), group);
  void housing;
  if (!k.light) {
    const win = k.mesh(k.geo("dp-win", () => { const g = new three.BoxGeometry(1.1, 2.2, 0.08); g.translate(0, 5.6, 1.27); return g; }), k.std("#2c2d30", { rough: 0.4 }), group, false);
    void win;
  }
  const crimp = k.mesh(k.geo("dp-crimp", () => { const g = new three.CylinderGeometry(0.75, 0.95, 2.2, 8); g.translate(0, 10.1, 0); return g; }), k.tin, group);
  void crimp;
  k.mesh(k.geo("dp-sleeve", () => { const g = new three.CylinderGeometry(0.8, 0.8, 1.8, 8); g.translate(0, 12.1, 0); return g; }), wire, group);
  return group;
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
