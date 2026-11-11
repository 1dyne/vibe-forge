import type * as T from "three";
import type { BenchKit, BenchOp, BenchPart, BenchView } from "../../lib/bench/types";
import {
  Kit3D, PITCH, aaBattery, batteryHolder2AA, breadboard, coldGeometry, filletGeometry, flushCutter, headerMale,
  led5, moduleModel, perfboard, plate, probe, resistor, roundedRect, sensorModule, solderingIron, type GridBoard
} from "./bench-models";

// 3D 조립 책상 엔진 (명세서 2차 v0.1 §1). 단위 mm, 매트 윗면 y = 0.
// 상태는 "단계별 진행도(0~1)"의 함수다: 같은 진행도면 언제 그려도 같은 장면이 나온다.
// 그래서 앞으로·뒤로 가기, 자동 진행, 실수 예시가 모두 같은 apply 경로를 쓴다.

export type MistakeKind = "cold" | "bridge" | "starved";
export type BenchCallbacks = {
  onTarget: (ok: boolean, message?: string) => void;
  onPart: (ref: string) => void;
  onFps?: (fps: number) => void;
};
export type BenchApi = {
  goto: (step: number) => void;
  play: () => Promise<void>;
  setView: (v: BenchView) => void;
  setChallenge: (on: boolean) => void;
  hint: () => void;
  mistake: (kind: MistakeKind | null) => void;
  setLight: (on: boolean) => void;
  /** 화면 위·아래를 가리는 카드 높이(px). 장면 가운데를 보이는 띠 가운데로 옮긴다. */
  setInsets: (top: number, bottom: number, left?: number, right?: number) => void;
  dispose: () => void;
};

type Pose = { p: T.Vector3; q: T.Quaternion };
type PartRec = {
  def: BenchPart;
  obj: T.Group;
  home: Pose;
  final: Pose | null;
  board?: GridBoard;
  tails?: T.Mesh[];
  pieces?: T.Mesh[];
  led?: { lens: T.MeshStandardMaterial; glow: T.PointLight };
  holder?: ReturnType<typeof batteryHolder2AA>;
  header?: ReturnType<typeof headerMale>;
  module?: ReturnType<typeof sensorModule>;
  atHome: boolean;
  /** 프로젝트 부품: 핀 윗점(부품 원점 기준) */
  pinLocal?: Map<string, T.Vector3>;
  /** 기판(받침): 가이드 좌표 → 기판 원점 기준 위치 */
  baseMap?: (x: number, y: number) => T.Vector3;
  baseKind?: string;
};
type JumperRec = { op: Extract<BenchOp, { op: "jumper" }>; curve: T.CatmullRomCurve3 | null; mesh: T.Mesh | null; ends: T.Object3D[]; t: number; built: number; mat: T.Material };
type WireRec = { id: string; color: string; holderRef: string; exitLocal: T.Vector3; looseLocal: T.Vector3; strip: number; tin: number; insert: number; hole: T.Vector3 | null; mesh: T.Mesh | null; bare: T.Mesh | null; bareMat: T.MeshStandardMaterial; key: string };
type Joint = { anchor: string; pos: T.Vector3; side: "top" | "bottom"; mesh: T.Mesh };
type Target = { pos: T.Vector3; label?: string; radius: number; part?: string };

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const OP_SECONDS: Record<BenchOp["op"], number> = { place: 0.9, insert: 1.2, mount_on: 1.2, prep_wire: 1.6, insert_wire: 0.9, solder: 1.0, bridge: 0.7, trim: 0.6, batteries: 1.1, check: 0.7, seat: 1.0, jumper: 0.9 };
function opSeconds(op: BenchOp) {
  if (op.op === "solder") return 0.25 + op.joints.length * 0.95;
  if (op.op === "bridge") return 0.3 + op.pairs.length * 0.75;
  if (op.op === "trim") return 0.3 + op.refs.length * 0.7;
  if (op.op === "check" && op.how === "continuity") return 1.8;
  if (op.op === "check" && op.how === "power_on") return 1.2;
  return OP_SECONDS[op.op];
}

const BOARD_LIFT = 30; // 만능기판은 받침 위에 올려 아래(납땜 면)를 볼 수 있게 한다

export async function createBench(el: HTMLElement, kit: BenchKit, opts: { hue: number; light: boolean; cb: BenchCallbacks }): Promise<BenchApi> {
  const three = await import("three");
  const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
  const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
  if ("fonts" in document) await document.fonts.load('700 40px "IBM Plex Sans KR"').catch(() => {});

  let light = opts.light;
  const renderer = new three.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(light ? 1 : Math.min(2, window.devicePixelRatio));
  renderer.setSize(el.clientWidth, el.clientHeight);
  renderer.outputColorSpace = three.SRGBColorSpace;
  renderer.toneMapping = three.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = three.PCFSoftShadowMap;
  renderer.domElement.style.touchAction = "none";
  el.appendChild(renderer.domElement);

  const k = new Kit3D(three, renderer.capabilities.getMaxAnisotropy());
  const scene = new three.Scene();
  scene.background = new three.Color("#e9e5dd");
  scene.fog = new three.Fog("#e9e5dd", 700, 1500);
  const pmrem = new three.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new three.PerspectiveCamera(34, el.clientWidth / el.clientHeight, 2, 4000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.09;
  controls.minDistance = 45; controls.maxDistance = 700; controls.maxPolarAngle = Math.PI;
  controls.rotateSpeed = 0.7; controls.zoomSpeed = 0.9;

  scene.add(new three.HemisphereLight("#fffdf8", "#8d9099", 1.15));
  const sun = new three.DirectionalLight("#fff4e4", 2.3);
  sun.position.set(170, 330, 150); sun.castShadow = true;
  const sc = sun.shadow.camera; sc.left = -260; sc.right = 260; sc.top = 220; sc.bottom = -220; sc.near = 80; sc.far = 900;
  sun.shadow.mapSize.set(light ? 1024 : 2048, light ? 1024 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.5; sun.shadow.radius = 4;
  scene.add(sun);
  const fill = new three.DirectionalLight("#dfe8ff", 0.45); fill.position.set(-220, 140, -60); scene.add(fill);
  const under = new three.DirectionalLight("#fff8ee", 0); under.position.set(20, -200, 60); scene.add(under); // 아래 시점용 보조광

  // ── 책상·매트·트레이 ──
  const ground: T.Object3D[] = [];
  const props: T.Object3D[] = [];
  const deskTex = k.canvasTex("desk", 1024, 1024, (x, w, h) => {
    x.fillStyle = "#d9b98c"; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) { x.strokeStyle = `rgba(${130 + (i % 5) * 8},${90 + (i % 7) * 5},50,${0.025 + (i % 4) * 0.012})`; x.lineWidth = 2 + (i % 3) * 2; x.beginPath(); const y0 = (i * 7.3) % h; x.moveTo(0, y0); for (let xx = 0; xx <= w; xx += 64) x.lineTo(xx, y0 + Math.sin(xx / 120 + i) * 6); x.stroke(); }
  });
  deskTex.wrapS = deskTex.wrapT = three.RepeatWrapping; deskTex.repeat.set(2, 1.5);
  const desk = k.mesh(new three.PlaneGeometry(1800, 1300), k.std("#fff", { map: deskTex, rough: 0.7 }), scene, false);
  desk.rotation.x = -Math.PI / 2; desk.position.y = -2.2; ground.push(desk);
  const MW = 440, MD = 300;
  const matTex = k.canvasTex("mat", 2200, 1500, (x, w, h) => {
    const s = w / MW;
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#5f6f80"); g.addColorStop(1, "#526172");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let mm = 0; mm <= MW; mm += 5) { x.strokeStyle = mm % 50 === 0 ? "rgba(255,255,255,.30)" : mm % 10 === 0 ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.06)"; x.lineWidth = mm % 50 === 0 ? 2.2 : 1.1; x.beginPath(); x.moveTo(mm * s, 0); x.lineTo(mm * s, h); x.stroke(); }
    for (let mm = 0; mm <= MD; mm += 5) { x.strokeStyle = mm % 50 === 0 ? "rgba(255,255,255,.30)" : mm % 10 === 0 ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.06)"; x.lineWidth = mm % 50 === 0 ? 2.2 : 1.1; x.beginPath(); x.moveTo(0, mm * s); x.lineTo(w, mm * s); x.stroke(); }
    x.strokeStyle = "rgba(255,255,255,.16)"; x.lineWidth = 1.4; for (const a of [30, 45, 60]) { x.beginPath(); x.moveTo(w - 10 * s, h - 10 * s); x.lineTo(w - 10 * s - Math.cos((a * Math.PI) / 180) * 90 * s, h - 10 * s - Math.sin((a * Math.PI) / 180) * 90 * s); x.stroke(); }
    x.fillStyle = "rgba(255,255,255,.45)"; x.font = `600 ${3 * s}px "IBM Plex Sans KR", sans-serif`; x.textAlign = "center";
    for (let mm = 10; mm < MW; mm += 10) x.fillText(String(mm / 10), mm * s, 5 * s);
    x.textAlign = "left"; x.font = `700 ${4.2 * s}px "IBM Plex Sans KR", sans-serif`; x.fillStyle = "rgba(255,255,255,.35)"; x.fillText("달그락 대장간 · SELF-HEALING MAT", 12 * s, h - 9 * s);
  });
  const mat = k.box(MW, 2, MD, [k.std("#46525f"), k.std("#46525f"), k.std("#fff", { map: matTex, rough: 0.85 }), k.std("#46525f"), k.std("#46525f"), k.std("#46525f")], 0, -1, 0, scene);
  mat.castShadow = false; ground.push(mat);

  const TRAY = { x: 0, z: 116, w: 206, d: 112 };
  const trayG = new three.Group(); scene.add(trayG); ground.push(trayG);
  const trayM = k.std("#efe6d6", { rough: 0.62 });
  const buildTray = () => {
    trayG.clear(); trayG.position.set(TRAY.x, 0, TRAY.z);
    const floorG = new three.ExtrudeGeometry(roundedRect(three, TRAY.w, TRAY.d, 9), { depth: 2.5, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.6, bevelSegments: 2 }); floorG.rotateX(-Math.PI / 2);
    k.mesh(floorG, trayM, trayG);
    const rimS = roundedRect(three, TRAY.w, TRAY.d, 9); rimS.holes.push(roundedRect(three, TRAY.w - 6, TRAY.d - 6, 7) as unknown as T.Path);
    const rimG = new three.ExtrudeGeometry(rimS, { depth: 7, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.8, bevelSegments: 3 }); rimG.rotateX(-Math.PI / 2);
    k.mesh(rimG, trayM, trayG);
  };
  const TRAY_FLOOR = 3.1;

  const qY = (a: number) => new three.Quaternion().setFromAxisAngle(new three.Vector3(0, 1, 0), a);
  // ── 공구·소품 ──
  const iron = solderingIron(k); scene.add(iron);
  const standG = new three.Group(); standG.position.set(168, 0, -64); scene.add(standG); props.push(standG);
  k.rbox(56, 7, 86, 6, k.std("#2a2c30", { rough: 0.6 }), standG);
  k.box(34, 8, 26, k.std("#e8c64a", { rough: 0.95 }), 0, 9, 24, standG);
  { const pts: T.Vector3[] = []; for (let i = 0; i <= 90; i++) { const a = i * 0.42, r = 7 + i * 0.07; pts.push(new three.Vector3(Math.cos(a) * r, 18 + i * 0.32, -18 + Math.sin(a) * r - i * 0.18)); } k.tube(pts, 0.8, k.steel, standG, 260, 6); }
  const IRON_REST: Pose = { p: new three.Vector3(168, 22, -96), q: new three.Quaternion().setFromUnitVectors(new three.Vector3(0, 1, 0), new three.Vector3(0, 0.55, 0.84).normalize()) };
  const cutter = flushCutter(k); scene.add(cutter);
  const CUTTER_REST: Pose = { p: new three.Vector3(-128, 6.2, 40), q: qY(-2.3) };
  const probeR = probe(k, "#c9302c"), probeB = probe(k, "#1d1e21"); scene.add(probeR, probeB);
  const PROBE_REST: Pose[] = [
    { p: new three.Vector3(118, 4.2, 150), q: new three.Quaternion().setFromEuler(new three.Euler(0, 0, -Math.PI / 2 + 0.02)).premultiply(new three.Quaternion().setFromAxisAngle(new three.Vector3(0, 1, 0), 0.35)) },
    { p: new three.Vector3(124, 4.2, 162), q: new three.Quaternion().setFromEuler(new three.Euler(0, 0, -Math.PI / 2 + 0.02)).premultiply(new three.Quaternion().setFromAxisAngle(new three.Vector3(0, 1, 0), 0.28)) }
  ];
  if (!light) {
    const spool = new three.Group(); spool.position.set(-168, 0, -74); scene.add(spool); props.push(spool);
    const spoolTex = k.canvasTex("spool", 512, 512, (x, w, h) => { x.fillStyle = "#f5f2ea"; x.beginPath(); x.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); x.fill(); x.strokeStyle = "#d34b33"; x.lineWidth = 26; x.beginPath(); x.arc(w / 2, h / 2, w * 0.36, -2.4, 0.4); x.stroke(); x.strokeStyle = "#2e5a96"; x.beginPath(); x.arc(w / 2, h / 2, w * 0.36, 0.6, 1.6); x.stroke(); x.fillStyle = "#1f1f1f"; x.beginPath(); x.arc(w / 2, h / 2, w * 0.13, 0, Math.PI * 2); x.fill(); x.fillStyle = "#2a2a2a"; x.font = "800 54px sans-serif"; x.textAlign = "center"; x.fillText("Sn63", w / 2, h * 0.3); x.font = "600 30px sans-serif"; x.fillText("ROSIN CORE ø0.8", w / 2, h * 0.78); });
    k.mesh(new three.CylinderGeometry(30, 30, 3, 40), [k.std("#f5f2ea"), k.std("#fff", { map: spoolTex, rough: 0.6 }), k.std("#f5f2ea")], spool).position.y = 21.5;
    k.mesh(new three.CylinderGeometry(30, 30, 3, 40), k.std("#f5f2ea"), spool).position.y = 1.5;
    k.mesh(new three.CylinderGeometry(25, 25, 17, 40), k.std("#c9ccd1", { metal: 1, rough: 0.4 }), spool).position.y = 11.5;
    k.tube([new three.Vector3(-143, 10, -60), new three.Vector3(-128, 3, -40), new three.Vector3(-118, 0.6, -18), new three.Vector3(-112, 0.6, 4)], 0.45, k.tin, scene, 40, 6);
    for (const [pr, col, dz] of [[probeR, "#c9302c", 0], [probeB, "#1d1e21", 12]] as const) {
      void pr; k.tube([new three.Vector3(118 + 70 * 0.94, 4.2, 150 + dz + 70 * 0.34), new three.Vector3(215, 2, 200 + dz), new three.Vector3(240, 1.2, 150 + dz), new three.Vector3(230, 1.2, 90 + dz)], 1.4, k.std(col, { rough: 0.6 }), scene, 40, 8).userData.prop = true;
    }
  }

  // ── 부품 만들기 ──
  const parts = new Map<string, PartRec>();
  const allOps = kit.steps.flatMap((s) => s.ops);
  const boardOf = (ref: string) => parts.get(ref)?.board ?? null;
  const poseMatrix = (pose: Pose) => new three.Matrix4().compose(pose.p, pose.q, new three.Vector3(1, 1, 1));

  // 기판 먼저 (다른 부품의 최종 위치가 기판 구멍에서 나온다)
  for (const def of kit.parts) {
    let obj: T.Group, rec: Partial<PartRec> = {};
    const gw = def.spec?.widthMm, gh = def.spec?.heightMm;
    if (def.kind === "perfboard") { const b = perfboard(k, def.spec?.cols, def.spec?.rows); obj = b.group; rec.board = b; }
    else if (def.kind === "breadboard") { const b = breadboard(k, gw ? Math.max(10, Math.round((gw - 82) / PITCH) + 30) : def.spec?.rows); obj = b.group; rec.board = b; }
    else if (def.kind === "plate") { const b = plate(k, gw ?? 120, gh ?? 80); obj = b.group; rec.baseMap = (x, y) => new three.Vector3(x - (gw ?? 120) / 2, b.topY, y - (gh ?? 80) / 2); }
    else continue;
    rec.baseKind = def.kind;
    if (!rec.baseMap && rec.board && gw && gh) { const top = rec.board.topY; rec.baseMap = (x, y) => new three.Vector3(x - gw / 2, top, y - gh / 2); }
    const place = allOps.find((o) => o.op === "place" && o.ref === def.ref) as Extract<BenchOp, { op: "place" }> | undefined;
    const y = def.kind === "perfboard" ? BOARD_LIFT : 0;
    const final = place ? { p: new three.Vector3(place.at[0], y, place.at[1]), q: qY(((place.rotation ?? 0) * Math.PI) / 180) } : null;
    scene.add(obj);
    parts.set(def.ref, { def, obj, home: { p: new three.Vector3(), q: new three.Quaternion() }, final, atHome: true, ...rec });
    if (def.kind === "perfboard" && final) {
      const [W, , D] = obj.userData.size as number[];
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const st = k.mesh(new three.CylinderGeometry(2.3, 2.3, BOARD_LIFT, 6), k.std("#c9a254", { metal: 1, rough: 0.35 }), scene);
        st.position.set(final.p.x + sx * (W / 2 - 2.6), BOARD_LIFT / 2, final.p.z + sz * (D / 2 - 2.6)); ground.push(st);
      }
    }
  }
  const holeWorld = (anchor: string, side: "top" | "bottom" = "top") => {
    const [ref, name] = anchor.split(".");
    const p = parts.get(ref);
    if (!p?.board || !p.final) return null;
    const l = p.board.hole(name); if (!l) return null;
    if (side === "bottom") l.y = p.board.bottomY;
    return l.applyMatrix4(poseMatrix(p.final));
  };

  for (const def of kit.parts) {
    if (parts.has(def.ref)) continue;
    let obj: T.Group, rec: Partial<PartRec> = {}, final: Pose | null = null;
    const ins = allOps.find((o) => (o.op === "insert" || o.op === "mount_on") && o.ref === def.ref) as Extract<BenchOp, { op: "insert" | "mount_on" }> | undefined;
    const holes = ins?.op === "insert" ? ins.holes.map((h) => holeWorld(h)) : [];
    const along = (a: T.Vector3, b: T.Vector3) => qY(Math.atan2(-(b.z - a.z), b.x - a.x));
    if (def.kind === "resistor" || def.kind === "led") {
      const [a, b] = holes;
      const pitch = a && b ? a.distanceTo(b) : 4 * PITCH;
      if (def.kind === "resistor") { const r = resistor(k, pitch, def.spec?.ohms ?? 220); obj = r.group; rec.tails = r.tails; }
      else { const l = led5(k, def.spec?.color ?? "#ff3b2f"); obj = l.group; rec.tails = l.tails; rec.led = { lens: l.lens, glow: l.glow as T.PointLight }; }
      if (a && b) final = { p: a.clone().add(b).multiplyScalar(0.5), q: along(a, b) };
    } else if (def.kind === "header_male") {
      const h = headerMale(k, def.spec?.pins ?? 8); obj = h.group; rec.header = h;
      const a = holes[0], b = holes[holes.length - 1];
      if (a && b) final = { p: a.clone().add(b).multiplyScalar(0.5), q: along(a, b) };
    } else if (def.kind === "sensor_module") {
      const m = sensorModule(k, def.spec?.pinNames ?? ["VCC", "GND", "SCL", "SDA"], def.spec?.silk ?? "MODULE"); obj = m.group; rec.module = m;
      if (ins?.op === "mount_on") { const h = parts.get(ins.onto); if (h?.final && h.header) final = { p: new three.Vector3(0, h.header.plasticTop, 0).applyMatrix4(poseMatrix(h.final)), q: h.final.q.clone() }; }
    } else if (def.kind === "battery_holder_2aa") {
      const h = batteryHolder2AA(k); obj = h.group; rec.holder = h;
      const place = allOps.find((o) => o.op === "place" && o.ref === def.ref) as Extract<BenchOp, { op: "place" }> | undefined;
      if (place) final = { p: new three.Vector3(place.at[0], 0, place.at[1]), q: qY(((place.rotation ?? 0) * Math.PI) / 180) };
    } else if (def.kind === "aa_battery") {
      obj = new three.Group();
      const b1 = aaBattery(k), b2 = aaBattery(k); b1.position.z = -7.6; b1.rotation.y = Math.PI; b2.position.z = 7.6; obj.add(b1, b2);
      const bat = allOps.find((o) => o.op === "batteries") as Extract<BenchOp, { op: "batteries" }> | undefined;
      const holder = bat ? parts.get(bat.ref) : null;
      if (holder?.final) final = { p: holder.final.p.clone().add(new three.Vector3(0, 8.6, 0).applyQuaternion(holder.final.q)), q: holder.final.q.clone() };
    } else if (def.kind === "module" && def.spec?.foot) {
      const seat = allOps.find((o) => o.op === "seat" && o.ref === def.ref) as Extract<BenchOp, { op: "seat" }> | undefined;
      const base = seat ? parts.get(seat.onto) : undefined;
      const m = moduleModel(k, { catalogId: def.spec.catalogId, partType: def.spec.partType, model: def.spec.model ?? def.label, color: def.spec.color, foot: def.spec.foot, pinXY: def.spec.pinXY ?? [] }, base?.baseKind === "breadboard");
      obj = m.group; rec.pinLocal = m.pinLocal; if (m.led) rec.led = m.led;
      if (base?.final && base.baseMap) { const f = def.spec.foot; const local = base.baseMap(f.x + f.w / 2, f.y + f.h / 2); final = { p: local.applyMatrix4(poseMatrix(base.final)), q: base.final.q.clone() }; }
    } else { obj = new three.Group(); }
    scene.add(obj);
    parts.set(def.ref, { def, obj, home: { p: new three.Vector3(), q: new three.Quaternion() }, final, atHome: true, ...rec });
  }
  // 다리 자를 때 떨어지는 조각
  for (const p of parts.values()) if (p.tails) p.pieces = p.tails.map((t) => { const m = t.clone(); m.visible = false; scene.add(m); return m; });

  // 트레이 배치: 부품 순서대로 왼쪽부터, 눕혀서. 폭이 넘치면 다음 줄.
  {
    const items = [...parts.values()].map((p) => {
      const k2 = p.def.kind;
      const q = k2 === "resistor" || k2 === "led" || k2 === "header_male" ? new three.Quaternion().setFromEuler(new three.Euler(-Math.PI / 2, 0, 0)) : new three.Quaternion();
      p.obj.position.set(0, 0, 0); p.obj.quaternion.copy(q); p.obj.updateMatrixWorld(true);
      const box = new three.Box3().setFromObject(p.obj);
      return { p, q, box, w: box.max.x - box.min.x, d: box.max.z - box.min.z };
    });
    const rows: Array<typeof items> = [[]];
    let used = 0;
    const widest = Math.max(...items.map((i) => i.w));
    TRAY.w = Math.max(206, Math.min(320, widest + 30));
    const maxW = TRAY.w - 22;
    for (const it of items) { if (used + it.w > maxW && rows[rows.length - 1].length) { rows.push([]); used = 0; } rows[rows.length - 1].push(it); used += it.w + 9; }
    const rowD = rows.map((r) => Math.max(...r.map((i) => i.d)));
    const totalD = rowD.reduce((a, b) => a + b, 0) + (rows.length - 1) * 8;
    let front = 0;
    for (const p of parts.values()) if (p.final && (p.board || p.baseMap)) { const sz = p.obj.userData.size as number[] | undefined; if (sz) front = Math.max(front, p.final.p.z + sz[2] / 2); }
    TRAY.d = Math.max(112, totalD + 22);
    TRAY.z = Math.max(116, front + 22 + TRAY.d / 2);
    buildTray();
    let z = TRAY.z - totalD / 2;
    rows.forEach((r, ri) => {
      const rw = r.reduce((a, i) => a + i.w, 0) + (r.length - 1) * 9;
      let x = TRAY.x - rw / 2;
      for (const it of r) {
        const cx = (it.box.max.x + it.box.min.x) / 2, cz = (it.box.max.z + it.box.min.z) / 2;
        it.p.home = { p: new three.Vector3(x + it.w / 2 - cx, TRAY_FLOOR - it.box.min.y, z + rowD[ri] / 2 - cz), q: it.q };
        x += it.w + 9;
      }
      z += rowD[ri] + 8;
    });
  }

  // ── 전선 (전지 홀더) ──
  const wires: WireRec[] = [];
  for (const p of parts.values()) if (p.holder) {
    for (const [id, color, exit, side] of [["RED", "#d8322a", p.holder.wireExit.red, -1], ["BLK", "#1c1c1e", p.holder.wireExit.black, 1]] as const) {
      const bareMat = new three.MeshStandardMaterial({ color: "#c87a45", metalness: 1, roughness: 0.35 });
      wires.push({ id: `${p.def.ref}.${id}`, color, holderRef: p.def.ref, exitLocal: exit.clone(), looseLocal: new three.Vector3(58, 1.0, side * 12), strip: 0, tin: 0, insert: 0, hole: null, mesh: null, bare: null, bareMat, key: "" });
    }
  }
  for (const o of allOps) if (o.op === "insert_wire") { const w = wires.find((x) => x.id === o.wire); if (w) w.hole = holeWorld(o.hole); }
  const insulMats = new Map<string, T.Material>();
  const wirePoints = (w: WireRec) => {
    const h = parts.get(w.holderRef)!;
    const m = new three.Matrix4().compose(h.obj.position, h.obj.quaternion, new three.Vector3(1, 1, 1));
    const exit = w.exitLocal.clone().applyMatrix4(m);
    const out = w.exitLocal.clone().add(new three.Vector3(10, 0, 0)).applyMatrix4(m);
    const loose = w.looseLocal.clone().applyMatrix4(m);
    const looseMid1 = out.clone().lerp(loose, 0.4).setY(Math.max(1.2, out.y * 0.6));
    const looseMid2 = out.clone().lerp(loose, 0.8).setY(1.2);
    const lp = [exit, out, looseMid1, looseMid2, loose.clone().setY(Math.max(1.0, loose.y)), loose.clone().add(new three.Vector3(4, 0, 0)).setY(Math.max(1.0, loose.y))];
    if (!w.hole || w.insert <= 0) return lp;
    const hb = w.hole.clone(), b = w.insert;
    const ip = [exit, out, out.clone().lerp(hb, 0.45).setY(hb.y + 18), hb.clone().add(new three.Vector3(-3, 7, 0)), hb.clone().setY(hb.y + 1.2), hb.clone().setY(hb.y - 1.6 - 1.5)];
    const arc = Math.sin(Math.PI * b) * 14;
    return lp.map((pt, i) => pt.clone().lerp(ip[i], smooth(b)).add(new three.Vector3(0, i >= 2 ? arc : 0, 0)));
  };
  const rebuildWire = (w: WireRec) => {
    const pts = wirePoints(w);
    const key = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`).join("|") + `|${w.strip.toFixed(3)}`;
    w.bareMat.color.set("#c87a45").lerp(new three.Color("#d4d8de"), w.tin);
    w.bareMat.roughness = 0.35 - 0.15 * w.tin;
    if (key === w.key) return;
    w.key = key;
    const curve = new three.CatmullRomCurve3(pts, false, "centripetal");
    const L = curve.getLength(), bareLen = 5 * w.strip, cut = clamp(1 - bareLen / L, 0.5, 1);
    const ins = new three.CatmullRomCurve3(Array.from({ length: 24 }, (_, i) => curve.getPointAt((i / 23) * cut)));
    w.mesh?.geometry.dispose(); w.bare?.geometry.dispose();
    let im = insulMats.get(w.color); if (!im) { im = k.std(w.color, { rough: 0.45 }); insulMats.set(w.color, im); }
    if (!w.mesh) { w.mesh = k.mesh(new three.BufferGeometry(), im, scene); }
    w.mesh.geometry = new three.TubeGeometry(ins, 60, 0.8, 10, false);
    if (!w.bare) { w.bare = k.mesh(new three.BufferGeometry(), w.bareMat, scene); }
    w.bare.visible = bareLen > 0.05;
    if (w.bare.visible) { const bc = new three.CatmullRomCurve3(Array.from({ length: 6 }, (_, i) => curve.getPointAt(cut + (i / 5) * (1 - cut)))); w.bare.geometry = new three.TubeGeometry(bc, 8, 0.45, 8, false); }
  };
  const wireEnd = (id: string) => { const w = wires.find((x) => x.id === id); if (!w) return null; const pts = wirePoints(w); return pts[pts.length - 1]; };

  // ── 앵커 (구멍·핀·전선 끝·부품) ──
  const anchorWorld = (anchor: string, side: "top" | "bottom" = "top"): T.Vector3 | null => {
    if (!anchor.includes(".")) { const p = parts.get(anchor); if (!p) return null; const b = new three.Box3().setFromObject(p.obj); return b.getCenter(new three.Vector3()).setY(b.max.y); }
    const [ref, name] = anchor.split(".");
    const p = parts.get(ref);
    if (p?.board) return holeWorld(anchor, side);
    if (p?.module && p.final) { const i = (p.def.spec?.pinNames ?? []).indexOf(name); if (i < 0) return null; return new three.Vector3(p.module.hx(i), p.module.topY, 0).applyMatrix4(poseMatrix(p.final)); }
    if (p?.holder) return wireEnd(anchor);
    if (p?.pinLocal && p.final) { const l = p.pinLocal.get(anchor.slice(ref.length + 1)) ?? p.pinLocal.get(name); if (l) return l.clone().applyMatrix4(poseMatrix(p.final)); const c = p.final.p.clone(); c.y += 4; return c; }
    return null;
  };

  // ── 땜납 ──
  const filletG = filletGeometry(three), coldG = coldGeometry(three);
  const tinM = k.tin, coldM = k.std("#9c9c97", { metal: 0.6, rough: 0.85 });
  const jointsByOp = new Map<BenchOp, Joint[]>();
  for (const o of allOps) if (o.op === "solder") {
    jointsByOp.set(o, o.joints.map((a) => {
      const pos = anchorWorld(a, o.side) ?? new three.Vector3();
      const mesh = k.mesh(filletG, tinM, scene);
      mesh.position.copy(pos); if (o.side === "bottom") mesh.rotation.x = Math.PI;
      mesh.scale.setScalar(0.001); mesh.visible = false;
      return { anchor: a, pos, side: o.side, mesh };
    }));
  }
  const bridgeMeshes = new Map<BenchOp, T.Mesh[]>();
  const capsule = (a: T.Vector3, b: T.Vector3, r: number, m: T.Material) => {
    const len = a.distanceTo(b);
    const g = new three.CapsuleGeometry(r, len, 6, 14); const me = k.mesh(g, m, scene);
    me.position.copy(a).add(b).multiplyScalar(0.5);
    me.quaternion.setFromUnitVectors(new three.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    me.scale.set(1, 1, 0.55);
    return me;
  };
  for (const o of allOps) if (o.op === "bridge") {
    bridgeMeshes.set(o, o.pairs.map(([a, b]) => { const pa = anchorWorld(a, "bottom")!, pb = anchorWorld(b, "bottom")!; const me = capsule(pa.clone().add(new three.Vector3(0, -0.55, 0)), pb.clone().add(new three.Vector3(0, -0.55, 0)), 0.75, tinM); me.visible = false; return me; }));
  }
  const mistakeBlob = capsule(new three.Vector3(), new three.Vector3(PITCH, 0, 0), 0.7, tinM); mistakeBlob.visible = false;

  // ── 점퍼선 (프로젝트 조립: 핀 ↔ 핀) ──
  const jumpers = new Map<BenchOp, JumperRec>();
  const jumperMats = new Map<string, T.Material>();
  const onBreadboard = [...parts.values()].some((p) => p.baseKind === "breadboard");
  for (const o of allOps) if (o.op === "jumper") {
    const a = anchorWorld(o.from), b = anchorWorld(o.to);
    let mat = jumperMats.get(o.color); if (!mat) { mat = k.std(o.color, { rough: 0.45 }); jumperMats.set(o.color, mat); }
    const rec: JumperRec = { op: o, curve: null, mesh: null, ends: [], t: 0, built: -1, mat };
    if (a && b) {
      const lift = onBreadboard ? 13 : 1.5;
      const a2 = a.clone().add(new three.Vector3(0, lift, 0)), b2 = b.clone().add(new three.Vector3(0, lift, 0));
      const h = 8 + a.distanceTo(b) * 0.16;
      const mid = a2.clone().lerp(b2, 0.5).add(new three.Vector3(0, h, 0));
      rec.curve = new three.CatmullRomCurve3([a2, a2.clone().add(new three.Vector3(0, h * 0.45, 0)), mid, b2.clone().add(new three.Vector3(0, h * 0.45, 0)), b2], false, "centripetal");
      if (onBreadboard) for (const e of [a, b]) { const box = k.box(2.5, 13, 2.5, k.std("#18191b", { rough: 0.5 }), e.x, e.y + 6.5, e.z, scene); box.visible = false; rec.ends.push(box); }
    }
    jumpers.set(o, rec);
  }
  const syncJumpers = () => {
    for (const j of jumpers.values()) {
      if (!j.curve) continue;
      const t = j.t;
      if (j.ends[0]) j.ends[0].visible = t > 0.02 && !below;
      if (j.ends[1]) j.ends[1].visible = t > 0.97 && !below;
      if (t <= 0.01) { if (j.mesh) j.mesh.visible = false; continue; }
      if (Math.abs(t - j.built) > 0.004) {
        const pts = Array.from({ length: 28 }, (_, i) => j.curve!.getPoint((i / 27) * t));
        const g = new three.TubeGeometry(new three.CatmullRomCurve3(pts), 48, 0.75, 8, false);
        if (!j.mesh) j.mesh = k.mesh(g, j.mat, scene); else { j.mesh.geometry.dispose(); j.mesh.geometry = g; }
        j.built = t;
      }
      j.mesh!.visible = true;
    }
  };

  // ── 마커·고스트·라벨 ──
  const markerG = new three.Group(); scene.add(markerG);
  const ringGeo = new three.TorusGeometry(1.7, 0.28, 8, 32);
  const ringMat = new three.MeshBasicMaterial({ color: "#2fe0c2", transparent: true, opacity: 0.95, depthTest: false });
  const ghostMat = new three.MeshStandardMaterial({ color: "#3fd6bf", transparent: true, opacity: 0.28, depthWrite: false, emissive: "#1aa58f", emissiveIntensity: 0.4 });
  let ghost: T.Object3D | null = null;
  let targets: Target[] = [];
  let challenge = false, showMarkers = true, hintUntil = 0;

  // ── 상태 적용 ──
  const progress = kit.steps.map(() => 0);
  let current = 0;
  let mistakeKind: MistakeKind | null = null;
  let reading: T.Sprite | null = null;
  const setPose = (o: T.Object3D, pose: Pose) => { o.position.copy(pose.p); o.quaternion.copy(pose.q); };
  const fly = (p: PartRec, t: number, settle = 16) => {
    if (!p.final) return;
    if (t <= 0) { setPose(p.obj, p.home); p.atHome = true; return; }
    p.atHome = false;
    if (t >= 1) { setPose(p.obj, p.final); return; }
    const above = p.final.p.clone().add(new three.Vector3(0, settle, 0));
    const a = smooth(seg(t, 0, 0.72)), d = smooth(seg(t, 0.72, 1));
    const pos = p.home.p.clone().lerp(above, a); pos.y += Math.sin(Math.PI * a) * 55;
    pos.lerp(p.final.p, d);
    p.obj.position.copy(pos);
    p.obj.quaternion.copy(p.home.q).slerp(p.final.q, smooth(seg(t, 0.05, 0.6)));
  };
  const ironPoseFor = (pos: T.Vector3, side: "top" | "bottom") => {
    const dir = side === "bottom" ? new three.Vector3(0.42, -0.62, 0.66) : new three.Vector3(0.45, 0.66, 0.6);
    return { p: pos.clone().add(dir.clone().multiplyScalar(0.9)), q: new three.Quaternion().setFromUnitVectors(new three.Vector3(0, 1, 0), dir.normalize()) };
  };
  const toolTo = (o: T.Object3D, rest: Pose, work: Pose, t: number) => {
    // t: 0 = 쉬는 자리, 1 = 작업 자리
    const e = smooth(t);
    o.position.copy(rest.p).lerp(work.p, e);
    o.position.y += Math.sin(Math.PI * e) * 30 * (1 - e * 0.6);
    o.quaternion.copy(rest.q).slerp(work.q, e);
  };

  const applyOp = (op: BenchOp, t: number, active: boolean) => {
    switch (op.op) {
      case "seat": { const p = parts.get(op.ref); if (p) fly(p, t, 12); break; }
      case "jumper": { const j = jumpers.get(op); if (j) j.t = t; break; }
      case "place": case "insert": case "mount_on": case "batteries": {
        const ref = op.ref;
        const p = op.op === "batteries" ? [...parts.values()].find((x) => x.def.kind === "aa_battery") : parts.get(ref);
        if (p) fly(p, t, op.op === "insert" ? 14 : op.op === "mount_on" ? 10 : 6);
        break;
      }
      case "prep_wire": {
        op.wires.forEach((id) => { const w = wires.find((x) => x.id === id); if (!w) return; w.strip = smooth(seg(t, 0.05, 0.55)); w.tin = op.tin ? smooth(seg(t, 0.55, 0.95)) : 0; });
        if (active) { const end = wireEnd(op.wires[0]); if (end) { const u = seg(t, 0.5, 1); toolTo(iron, IRON_REST, ironPoseFor(end, "top"), u < 0.15 ? u / 0.15 : u > 0.85 ? (1 - u) / 0.15 : 1); } }
        break;
      }
      case "insert_wire": { const w = wires.find((x) => x.id === op.wire); if (w) w.insert = t; break; }
      case "solder": {
        const js = jointsByOp.get(op) ?? [];
        const n = js.length;
        js.forEach((j, i) => {
          const u = clamp(t * n - i);
          const g = smooth(seg(u, 0.3, 0.8));
          j.mesh.visible = g > 0.001; j.mesh.scale.set(0.6 + 0.4 * g, g, 0.6 + 0.4 * g);
          j.mesh.geometry = filletG; j.mesh.material = tinM;
        });
        if (active && n) {
          const i = Math.min(n - 1, Math.floor(t * n)), u = clamp(t * n - i);
          const work = ironPoseFor(js[i].pos, js[i].side);
          const prev = i > 0 ? ironPoseFor(js[i - 1].pos, js[i - 1].side) : IRON_REST;
          const lift = (q: Pose) => ({ p: q.p.clone().add(new three.Vector3(0, js[i].side === "bottom" ? -6 : 6, 0)), q: q.q });
          if (i === 0 && u < 0.3) toolTo(iron, IRON_REST, work, u / 0.3);
          else if (u < 0.3) { const e = smooth(u / 0.3); const a = lift(prev); iron.position.copy(a.p).lerp(work.p, e); iron.quaternion.copy(work.q); }
          else if (i === n - 1 && u > 0.85) toolTo(iron, IRON_REST, work, 1 - (u - 0.85) / 0.15);
          else if (u > 0.85) { const e = smooth((u - 0.85) / 0.15); iron.position.copy(work.p).lerp(lift(work).p, e); iron.quaternion.copy(work.q); }
          else setPose(iron, work);
          (iron.userData.glow as T.Mesh).material = Object.assign((iron.userData.glow as T.Mesh).material as T.MeshBasicMaterial, { opacity: u > 0.3 && u < 0.85 ? 0.85 : 0 });
        }
        break;
      }
      case "bridge": {
        const ms = bridgeMeshes.get(op) ?? [];
        ms.forEach((m, i) => { const g = smooth(seg(clamp(t * ms.length - i), 0.25, 0.85)); m.visible = g > 0.001; m.scale.set(g, 1, 0.55 * g); });
        if (active && ms.length) { const i = Math.min(ms.length - 1, Math.floor(t * ms.length)); const u = clamp(t * ms.length - i); const work = ironPoseFor(ms[i].position.clone().add(new three.Vector3(0, -0.5, 0)), "bottom"); toolTo(iron, IRON_REST, work, i === 0 && u < 0.25 ? u / 0.25 : i === ms.length - 1 && u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1); }
        break;
      }
      case "trim": {
        const tails = op.refs.flatMap((r) => (parts.get(r)?.tails ?? []).map((m, i) => ({ m, piece: parts.get(r)!.pieces![i], owner: parts.get(r)! })));
        const n = tails.length;
        tails.forEach(({ m, piece }, i) => {
          const u = clamp(t * n - i), len = m.userData.len as number, keep = 1.3 / len;
          const cutDone = u >= 0.5;
          m.scale.y = cutDone ? keep : 1;
          if (active && u > 0.5 && u < 1) {
            m.updateMatrixWorld(); piece.visible = true; piece.matrixAutoUpdate = true;
            const wp = new three.Vector3(); m.getWorldPosition(wp); const fall = Math.pow((u - 0.5) * 2, 2) * 26;
            piece.position.copy(wp).add(new three.Vector3((u - 0.5) * 18, -1.3 - fall, (u - 0.5) * 10)); piece.quaternion.setFromEuler(new three.Euler(u * 2, 0, u * 3)); piece.scale.set(1, 1 - keep, 1);
          } else piece.visible = false;
        });
        if (active && n) {
          const i = Math.min(n - 1, Math.floor(t * n)); const wp = new three.Vector3(); tails[i].m.getWorldPosition(wp);
          const work: Pose = { p: wp.add(new three.Vector3(0, -2.2, 0)), q: new three.Quaternion().setFromEuler(new three.Euler(Math.PI / 2, 0, 0)) };
          const u = clamp(t * n - i); toolTo(cutter, CUTTER_REST, work, i === 0 && u < 0.3 ? u / 0.3 : i === n - 1 && u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1);
        }
        break;
      }
      case "check": {
        if (op.how === "power_on") {
          for (const tg of op.targets) { const p = parts.get(tg); if (p?.led) { p.led.lens.emissiveIntensity = 2.6 * smooth(t); p.led.glow.intensity = 900 * smooth(t); ((p.led.glow.userData.halo as T.Sprite).material as T.SpriteMaterial).opacity = 0.9 * smooth(t); } }
        }
        if (op.how === "continuity" && active) {
          const a = anchorWorld(op.targets[0], "bottom"), b = anchorWorld(op.targets[1] ?? op.targets[0], "bottom");
          if (a && b) {
            const u = t;
            const w1: Pose = { p: a.clone().add(new three.Vector3(0, -0.6, 0)), q: new three.Quaternion().setFromUnitVectors(new three.Vector3(0, 1, 0), new three.Vector3(-0.35, -0.85, 0.4).normalize()) };
            const w2: Pose = { p: b.clone().add(new three.Vector3(0, -0.6, 0)), q: new three.Quaternion().setFromUnitVectors(new three.Vector3(0, 1, 0), new three.Vector3(0.35, -0.85, 0.4).normalize()) };
            const e = u < 0.35 ? u / 0.35 : u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
            toolTo(probeR, PROBE_REST[0], w1, e); toolTo(probeB, PROBE_REST[1], w2, e);
            if (u > 0.4 && u < 0.9) showReading(op.expected.includes("없음") || op.expected.includes("OL") ? "OL · 소리 없음" : "삐 ─ 연결됨", a.clone().lerp(b, 0.5).add(new three.Vector3(0, -9, 0)));
          }
        }
        break;
      }
    }
  };
  const showReading = (text: string, at: T.Vector3) => {
    if (!reading || reading.userData.text !== text) { if (reading) scene.remove(reading); reading = k.label(text, { px: 40, h: 5, bg: "rgba(20,24,28,.9)", fg: "#9ff3e4" }); reading.userData.text = text; scene.add(reading); }
    reading.position.copy(at); reading.visible = true;
  };

  const applyAll = () => {
    setPose(iron, IRON_REST); setPose(cutter, CUTTER_REST); setPose(probeR, PROBE_REST[0]); setPose(probeB, PROBE_REST[1]);
    ((iron.userData.glow as T.Mesh).material as T.MeshBasicMaterial).opacity = 0;
    if (reading) reading.visible = false;
    for (const p of parts.values()) if (p.led) { p.led.lens.emissiveIntensity = 0; p.led.glow.intensity = 0; ((p.led.glow.userData.halo as T.Sprite).material as T.SpriteMaterial).opacity = 0; }
    kit.steps.forEach((s, si) => {
      const pr = si === current && mistakeKind ? 1 : progress[si];
      const total = s.ops.reduce((a, o) => a + opSeconds(o), 0);
      let acc = 0;
      for (const op of s.ops) {
        const d = opSeconds(op) / total, a = acc / total * 1; acc += opSeconds(op);
        const t = clamp((pr - a) / d);
        applyOp(op, t, si === current && t > 0 && t < 1 && !mistakeKind);
      }
    });
    for (const w of wires) rebuildWire(w);
    syncJumpers();
    applyMistake();
    syncGroundVisibility();
  };
  const applyMistake = () => {
    mistakeBlob.visible = false;
    if (!mistakeKind) return;
    const step = kit.steps[current]; if (!step) return;
    const solder = step.ops.find((o) => o.op === "solder") as Extract<BenchOp, { op: "solder" }> | undefined;
    const js = solder ? jointsByOp.get(solder) ?? [] : [];
    if (mistakeKind === "cold") js.forEach((j) => { j.mesh.visible = true; j.mesh.geometry = coldG; j.mesh.material = coldM; j.mesh.scale.setScalar(1); });
    if (mistakeKind === "starved") js.forEach((j) => { j.mesh.visible = true; j.mesh.geometry = filletG; j.mesh.material = tinM; j.mesh.scale.set(0.7, 0.35, 0.7); });
    if (mistakeKind === "bridge") {
      const j = js[0];
      let a: T.Vector3 | null = null, b: T.Vector3 | null = null;
      if (j) {
        a = j.pos;
        const [ref, name] = j.anchor.split(".");
        const p = parts.get(ref);
        if (p?.pinLocal && p.final) { const me = p.pinLocal.get(name); let best: T.Vector3 | null = null, bd = Infinity; for (const [n, v] of p.pinLocal) if (n !== name && me) { const d = v.distanceTo(me); if (d < bd) { bd = d; best = v; } } if (best) b = best.clone().applyMatrix4(poseMatrix(p.final)); }
        else if (p?.module) { const names = p.def.spec?.pinNames ?? []; const i = names.indexOf(name); b = anchorWorld(`${ref}.${names[i + 1] ?? names[i - 1]}`, "top"); }
        else { const m = /^([A-Z])(\d+)$/.exec(name); if (m) b = anchorWorld(`${ref}.${String.fromCharCode(m[1].charCodeAt(0) + 1)}${m[2]}`, j.side); }
      } else {
        const br = step.ops.find((o) => o.op === "bridge") as Extract<BenchOp, { op: "bridge" }> | undefined;
        if (br) { a = anchorWorld("PB.H5", "bottom"); b = anchorWorld("PB.I5", "bottom"); }
      }
      if (a && b) {
        const side = j?.side ?? "bottom", off = new three.Vector3(0, side === "bottom" ? -0.6 : 0.6, 0);
        const pa = a.clone().add(off), pb = b.clone().add(off);
        mistakeBlob.position.copy(pa).add(pb).multiplyScalar(0.5);
        mistakeBlob.quaternion.setFromUnitVectors(new three.Vector3(0, 1, 0), pb.clone().sub(pa).normalize());
        mistakeBlob.scale.set(1, pa.distanceTo(pb) / PITCH, 0.6); mistakeBlob.visible = true;
        js.forEach((jj) => { jj.mesh.visible = true; jj.mesh.geometry = filletG; jj.mesh.material = tinM; jj.mesh.scale.setScalar(1); });
      }
    }
  };
  let below = false;
  const syncGroundVisibility = () => {
    for (const g of ground) g.visible = !below;
    for (const g of props) g.visible = !below && !light;
    for (const p of parts.values()) p.obj.visible = !(below && p.atHome);
    for (const w of wires) { const h = parts.get(w.holderRef); const hide = below && !!h?.atHome; if (w.mesh) w.mesh.visible = !hide; if (w.bare) w.bare.visible = !hide && w.strip > 0.01; }
    scene.traverse((o) => { if (o.userData.prop) o.visible = !below && !light; });
    under.intensity = below ? 1.6 : 0;
  };

  // ── 목표(마커) ──
  const stepTargets = (si: number): Target[] => {
    const s = kit.steps[si]; if (!s) return [];
    const out: Target[] = [];
    for (const op of s.ops) {
      if (op.op === "place" || op.op === "mount_on" || op.op === "batteries") {
        const p = op.op === "batteries" ? parts.get(op.ref) : parts.get(op.ref);
        const fin = op.op === "batteries" ? p?.final : p?.final;
        if (op.op === "mount_on") { for (const h of op.holes) { const a = anchorWorld(h); if (a) out.push({ pos: a, label: h.split(".")[1], radius: 2.2 }); } }
        else if (fin) out.push({ pos: fin.p.clone().add(new three.Vector3(0, op.op === "batteries" ? 8 : 1, 0)), radius: 18, part: op.ref });
      } else if (op.op === "seat") {
        const p = parts.get(op.ref); if (p?.final) { const b = new three.Box3().setFromObject(p.obj); const h = Math.max(2, b.max.y - b.min.y); const r = Math.min(14, Math.max(5, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.45)); out.push({ pos: p.final.p.clone().add(new three.Vector3(0, h * 0.5, 0)), radius: r, part: op.ref }); }
      } else if (op.op === "jumper") {
        for (const end of [op.from, op.to]) { const a = anchorWorld(end); if (a) out.push({ pos: a, label: end, radius: 2.6 }); }
      } else if (op.op === "insert") {
        op.holes.forEach((h, i) => { const a = anchorWorld(h); if (a) out.push({ pos: a, label: i === 0 || i === op.holes.length - 1 ? h.split(".")[1] : undefined, radius: 2.0 }); });
      } else if (op.op === "prep_wire") {
        for (const w of op.wires) { const a = anchorWorld(w); if (a) out.push({ pos: a, label: w.endsWith("RED") ? "빨간 선" : "검은 선", radius: 7 }); }
      } else if (op.op === "insert_wire") {
        const a = anchorWorld(op.hole); if (a) out.push({ pos: a, label: op.hole.split(".")[1], radius: 2.0 });
      } else if (op.op === "solder") {
        for (const j of op.joints) { const a = anchorWorld(j, op.side); if (a) out.push({ pos: a, label: j.split(".")[1], radius: 2.0 }); }
      } else if (op.op === "bridge") {
        for (const [x, y] of op.pairs) { const a = anchorWorld(x, "bottom"), b = anchorWorld(y, "bottom"); if (a && b) out.push({ pos: a.clone().lerp(b, 0.5), label: `${x.split(".")[1]}–${y.split(".")[1]}`, radius: 2.2 }); }
      } else if (op.op === "trim") {
        for (const r of op.refs) for (const t of parts.get(r)?.tails ?? []) { t.updateMatrixWorld(); const wp = new three.Vector3(); t.getWorldPosition(wp); out.push({ pos: wp.add(new three.Vector3(0, -(t.userData.len as number) * 0.6, 0)), radius: 4 }); }
      } else if (op.op === "check") {
        if (op.how === "continuity" && op.targets.length >= 2) { const a = anchorWorld(op.targets[0], "bottom"), b = anchorWorld(op.targets[1], "bottom"); if (a && b) out.push({ pos: a.clone().lerp(b, 0.5), label: `${op.targets[0].split(".")[1]}–${op.targets[1].split(".")[1]}`, radius: 2.4 }); }
        else if (op.how === "look" && op.targets.every((t) => !t.includes("."))) { for (const t of op.targets) { const a = anchorWorld(t); if (a) out.push({ pos: a, radius: 14, part: t }); } }
        else for (const t of op.targets) { const side = kit.steps[si].view === "bottom" ? "bottom" : "top"; const a = anchorWorld(t, side); if (a) out.push({ pos: a, label: t.includes(".") ? t.split(".")[1] : undefined, radius: t.includes(".") ? 2.2 : 12, part: t.includes(".") ? undefined : t }); }
      }
    }
    return out;
  };
  const buildMarkers = () => {
    markerG.clear();
    if (ghost) { scene.remove(ghost); ghost = null; }
    const s = kit.steps[current];
    if (!s || progress[current] > 0) return;
    targets = stepTargets(current);
    const view = s.view;
    const ghostOp = s.ops.find((o) => o.op === "place" || o.op === "insert" || o.op === "mount_on" || o.op === "batteries" || o.op === "seat") as Extract<BenchOp, { ref: string }> | undefined;
    if (ghostOp) {
      const p = ghostOp.op === "batteries" ? [...parts.values()].find((x) => x.def.kind === "aa_battery") : parts.get(ghostOp.ref);
      if (p?.final) {
        ghost = p.obj.clone(true);
        ghost.traverse((o) => { const m = o as T.Mesh; if (m.isMesh) { m.material = ghostMat; m.castShadow = false; } if ((o as T.PointLight).isLight) o.visible = false; });
        setPose(ghost, p.final); ghost.visible = true; scene.add(ghost);
      }
    }
    for (const t of targets) {
      if (t.radius <= 4) {
        const ring = new three.Mesh(ringGeo, ringMat); ring.renderOrder = 15;
        ring.position.copy(t.pos).add(new three.Vector3(0, view === "bottom" ? -0.15 : 0.15, 0)); ring.rotation.x = Math.PI / 2;
        markerG.add(ring);
      } else {
        const ring = new three.Mesh(new three.TorusGeometry(t.radius * 0.55, 0.5, 8, 48), ringMat); ring.renderOrder = 15;
        ring.position.copy(t.pos).add(new three.Vector3(0, 0.6, 0)); ring.rotation.x = Math.PI / 2; markerG.add(ring);
      }
      if (t.label) { const l = k.label(t.label, { px: 40, h: t.radius <= 4 ? 3.2 : 4.4, bg: "rgba(18,110,96,.92)" }); l.position.copy(t.pos).add(new three.Vector3(0, view === "bottom" ? -5 : 5, 0)); markerG.add(l); }
    }
  };

  // ── 카메라 ──
  const DIR: Record<BenchView, T.Vector3> = {
    "34": new three.Vector3(0.42, 0.78, 0.86).normalize(),
    top: new three.Vector3(0.0, 1, 0.16).normalize(),
    bottom: new three.Vector3(0.05, -1, 0.3).normalize(),
    front: new three.Vector3(0.0, 0.34, 1).normalize()
  };
  let camFrom: { p: T.Vector3; t: T.Vector3 } | null = null, camTo: { p: T.Vector3; t: T.Vector3 } | null = null, camT = 1, camStart = 0;
  let insetTop = 0, insetBottom = 0, insetLeft = 0, insetRight = 0;
  // 이번 단계에서 봐야 할 점들: 목표 + 트레이에서 날아올 부품
  const stepPoints = () => {
    const pts = stepTargets(current).map((t) => t.pos.clone());
    const s = kit.steps[current];
    for (const op of s?.ops ?? []) {
      const ref = "ref" in op ? op.ref : null;
      const p = op.op === "batteries" ? [...parts.values()].find((x) => x.def.kind === "aa_battery") : ref ? parts.get(ref) : null;
      if (p?.atHome && (op.op === "place" || op.op === "insert" || op.op === "mount_on" || op.op === "batteries" || op.op === "seat")) pts.push(p.home.p.clone());
    }
    return pts;
  };
  const focusFor = (v: BenchView) => {
    const board = [...parts.values()].find((p) => p.board && p.final);
    const bc = board?.final ? board.final.p.clone().add(new three.Vector3(0, v === "bottom" ? 0 : board.board!.topY, 0)) : new three.Vector3(0, 0, 0);
    const pts = stepPoints();
    if (!pts.length) return bc;
    const c = pts.reduce((a, p) => a.add(p), new three.Vector3()).multiplyScalar(1 / pts.length);
    return v === "34" ? c.lerp(bc, 0.25) : c.lerp(bc, 0.35);
  };
  const distFor = (v: BenchView) => {
    // 보이는 띠(카드에 가리지 않는 부분)에 반지름 R이 들어오도록 거리를 잡는다
    const W = el.clientWidth, H = Math.max(1, el.clientHeight);
    const band = Math.max(120, H - insetTop - insetBottom);
    const pts = v === "34" || v === "front" ? stepPoints() : stepTargets(current).filter((t) => t.radius <= 7).map((t) => t.pos);
    const c = focusFor(v);
    const spread = pts.length ? Math.max(...pts.map((p) => p.distanceTo(c))) : 0;
    const R = v === "34" ? Math.max(70, spread + 44) : v === "front" ? Math.max(55, spread + 25) : Math.max(19, spread + 13);
    const vh = Math.tan((camera.fov * Math.PI) / 360) * (band / H);
    const hh = Math.tan((camera.fov * Math.PI) / 360) * (Math.max(120, W - insetLeft - insetRight) / H);
    return R / Math.min(vh, hh);
  };
  const applyInsets = () => {
    const W = el.clientWidth, H = el.clientHeight; if (!W || !H) return;
    camera.setViewOffset(W, H, (insetRight - insetLeft) / 2, (insetBottom - insetTop) / 2, W, H);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  };
  let view: BenchView = "34";
  const setView = (v: BenchView, instant = false) => {
    view = v;
    const tgt = focusFor(v), pos = tgt.clone().add(DIR[v].clone().multiplyScalar(distFor(v)));
    if (instant) { camera.position.copy(pos); controls.target.copy(tgt); controls.update(); camT = 1; return; }
    camFrom = { p: camera.position.clone(), t: controls.target.clone() }; camTo = { p: pos, t: tgt }; camT = 0; camStart = performance.now();
  };

  // ── 입력 ──
  const ray = new three.Raycaster();
  const ndc = new three.Vector2();
  let downAt: { x: number; y: number; t: number } | null = null;
  const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const onUp = (e: PointerEvent) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y), dur = performance.now() - downAt.t; downAt = null;
    if (moved > 8 || dur > 500) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (busy) return;
    const hits = ray.intersectObjects(scene.children, true).filter((h) => h.object.visible && !(h.object as T.Sprite).isSprite && h.object !== desk);
    const hit = hits[0];
    const s = kit.steps[current];
    if (!s || progress[current] > 0) { if (hit) { const ref = refOf(hit.object); if (ref) opts.cb.onPart(ref); } return; }
    // 목표 근처를 눌렀는가
    let best: Target | null = null, bd = Infinity;
    for (const t of targets) {
      const d = hit ? hit.point.distanceTo(t.pos) : ray.ray.distanceToPoint(t.pos);
      const rd = ray.ray.distanceToPoint(t.pos);
      const dd = Math.min(d, rd);
      if (dd < t.radius * (challenge ? 1.0 : 1.6) && dd < bd) { bd = dd; best = t; }
      if (t.part && hit && refOf(hit.object) === t.part) { best = t; bd = 0; }
    }
    if (best) { opts.cb.onTarget(true); return; }
    if (!hit) return;
    const ref = refOf(hit.object);
    const p = ref ? parts.get(ref) : null;
    if (p?.board && p.final) {
      const local = hit.point.clone().applyMatrix4(poseMatrix(p.final).invert());
      const name = p.board.nearest(local);
      opts.cb.onTarget(false, name ? `거긴 ${name}야. ${s.tapHint}` : s.tapHint);
      return;
    }
    if (ref && p?.atHome) { opts.cb.onPart(ref); if (challenge) opts.cb.onTarget(false, `${p.def.label}는 트레이에 있어. ${s.tapHint}`); return; }
    if (challenge) opts.cb.onTarget(false, s.tapHint);
  };
  const refOf = (o: T.Object3D | null): string | null => {
    while (o) { for (const p of parts.values()) if (p.obj === o) return p.def.ref; o = o.parent; }
    return null;
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);

  // ── 진행 ──
  let busy = false;
  let anim: { from: number; to: number; dur: number; start: number; done: () => void } | null = null;
  const goto = (i: number) => {
    anim = null; busy = false;
    current = clamp(i, 0, kit.steps.length);
    for (let j = 0; j < progress.length; j++) progress[j] = j < current ? 1 : 0;
    mistakeKind = null;
    applyAll(); buildMarkers();
    const s = kit.steps[current];
    setView(s ? s.view : "34");
  };
  const play = () => new Promise<void>((resolve) => {
    const s = kit.steps[current]; if (!s || busy) { resolve(); return; }
    busy = true; mistakeKind = null; markerG.clear(); if (ghost) { scene.remove(ghost); ghost = null; }
    const dur = s.ops.reduce((a, o) => a + opSeconds(o), 0) * 1000;
    anim = { from: progress[current], to: 1, dur, start: performance.now(), done: () => { busy = false; resolve(); } };
  });

  // ── 렌더 루프 ──
  let raf = 0, last = performance.now(), fpsAcc = 0, fpsN = 0, disposed = false;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (document.hidden) return;
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    fpsAcc += dt; fpsN++; if (fpsAcc > 2) { opts.cb.onFps?.(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    if (anim) {
      const u = clamp((now - anim.start) / anim.dur);
      progress[current] = anim.from + (anim.to - anim.from) * u;
      applyAll();
      if (u >= 1) { const d = anim.done; anim = null; d(); }
    }
    if (camT < 1 && camFrom && camTo) {
      camT = Math.min(1, (now - camStart) / 750); const e = smooth(camT);
      camera.position.copy(camFrom.p).lerp(camTo.p, e); controls.target.copy(camFrom.t).lerp(camTo.t, e);
    }
    controls.update();
    const nb = camera.position.y < controls.target.y - 2 && camera.position.y < 10;
    if (nb !== below) { below = nb; syncGroundVisibility(); }
    // 마커 맥박
    const pulse = 1 + 0.18 * Math.sin(now / 180);
    const showM = showMarkers && (!challenge || now < hintUntil);
    markerG.visible = showM; if (ghost) ghost.visible = showM;
    for (const c of markerG.children) if ((c as T.Mesh).isMesh) c.scale.setScalar(pulse);
    ringMat.opacity = 0.65 + 0.3 * Math.sin(now / 180);
    renderer.render(scene, camera);
  };

  const ro = new ResizeObserver(() => {
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h); applyInsets();
  });
  ro.observe(el);

  goto(0);
  setView(kit.steps[0]?.view ?? "34", true);
  tick();

  return {
    goto, play,
    setView: (v) => setView(v),
    setChallenge: (on) => { challenge = on; },
    hint: () => { hintUntil = performance.now() + 2600; setView(kit.steps[current]?.view ?? view); },
    mistake: (kind) => { mistakeKind = kind; applyAll(); if (kind) { markerG.visible = false; } else buildMarkers(); },
    setInsets: (top, bottom, left = 0, right = 0) => { const changed = Math.abs(top - insetTop) + Math.abs(bottom - insetBottom) + Math.abs(left - insetLeft) + Math.abs(right - insetRight) > 4; insetTop = top; insetBottom = bottom; insetLeft = left; insetRight = right; applyInsets(); if (changed) setView(view); },
    setLight: (on) => { light = on; renderer.setPixelRatio(on ? 1 : Math.min(2, window.devicePixelRatio)); syncGroundVisibility(); },
    dispose: () => {
      if (disposed) return; disposed = true;
      cancelAnimationFrame(raf); ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown); renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      scene.traverse((o) => { const m = o as T.Mesh; if (m.isMesh) { m.geometry.dispose(); } });
      pmrem.dispose(); renderer.dispose(); renderer.domElement.remove();
    }
  };
}
