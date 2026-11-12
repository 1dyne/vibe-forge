import type * as T from "three";
import type { BenchKit, BenchOp, BenchPart, BenchView } from "../../lib/bench/types";
import { HOLD_MS, TOOL_NAME, gradeHold, holdFill, kitCanFlip, stepNeedsFlip, type HandsStage, type HoldGrade, type ToolId } from "../../lib/bench/hands";
import {
  Kit3D, PITCH, aaBattery, batteryHolder2AA, breadboard, coldGeometry, filletGeometry, flushCutter, hand, headerMale,
  led5, moduleModel, perfboard, plate, probe, resistor, roundedRect, sensorModule, solderWire, solderingIron, wireStripper, type GridBoard
} from "./bench-models";

// 3D 조립 책상 엔진 (명세서 2차 v0.1 §1). 단위 mm, 매트 윗면 y = 0.
// 상태는 "단계별 진행도(0~1)"의 함수다: 같은 진행도면 언제 그려도 같은 장면이 나온다.
// 그래서 앞으로·뒤로 가기, 자동 진행, 실수 예시가 모두 같은 apply 경로를 쓴다.

export type MistakeKind = "cold" | "bridge" | "starved";
export type HoldEvent =
  | { type: "start"; key: string; label: string; x: number; y: number }
  | { type: "end"; key: string; ms: number; grade: HoldGrade };
export type BenchCallbacks = {
  onTarget: (ok: boolean, message?: string) => void;
  onPart: (ref: string) => void;
  onFps?: (fps: number) => void;
  /** 직접 하기: 납땜 자리를 꾹 누르기 시작·뗌 (x, y = 화면 좌표) */
  onHold?: (e: HoldEvent) => void;
  /** 장면이 스스로 시점을 바꿨을 때 (뒤집힌 보드는 '아래' 대신 '위'에서 본다) */
  onView?: (v: BenchView) => void;
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
  /** 직접 하기 상태: 보드가 뒤집혀 있는가, 양손에 연장을 들었는가, 이 키트는 뒤집을 수 있는가 */
  state: () => { flipped: boolean; hands: boolean; canFlip: boolean };
  /** 지금 손으로 할 차례 (null = 단계 전체 목표) */
  setStage: (stage: HandsStage | null, hint?: string) => void;
  flip: () => Promise<void>;
  ready: () => Promise<void>;
  bend: (ref: string) => Promise<void>;
  /** 이 단계의 ops[from, to)만 보여 준다 */
  playOps: (from: number, to: number) => Promise<void>;
  /** 꾹 눌러 납땜을 마친 op: 진행도를 그 op 끝으로 */
  finishOp: (op: number) => void;
  /** 이 단계에서 쓰는 연장·부품을 빛나게 하고 이름표를 단다 */
  setHighlight: (tools: ToolId[], parts: string[]) => void;
  /** 연장 쪽으로 카메라를 잠깐 돌려 보여 준다 */
  peek: (tool: ToolId) => void;
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
  bend?: (b: number) => void;
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
type WireRec = { id: string; color: string; holderRef: string; exitLocal: T.Vector3; looseLocal: T.Vector3; strip: number; tin: number; insert: number; hole: T.Vector3 | null; surface?: boolean; holeRig?: boolean; mesh: T.Mesh | null; bare: T.Mesh | null; bareMat: T.MeshStandardMaterial; key: string };
type Joint = { anchor: string; pos: T.Vector3; side: "top" | "bottom"; mesh: T.Mesh; rig: boolean };
type Target = { pos: T.Vector3; label?: string; radius: number; part?: string };

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const OP_SECONDS: Record<BenchOp["op"], number> = { place: 0.9, insert: 1.2, mount_on: 1.2, prep_wire: 1.6, insert_wire: 0.9, solder: 1.0, bridge: 0.7, trim: 0.6, batteries: 1.1, check: 0.7, seat: 1.0, jumper: 0.9, enclose: 1.4 };
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
  const solderT = solderWire(k); scene.add(solderT);
  const SOLDER_REST: Pose = { p: new three.Vector3(-112, 1.2, 18), q: new three.Quaternion().setFromUnitVectors(new three.Vector3(0, 1, 0), new three.Vector3(-0.2, 0.05, -1).normalize()) };
  const stripper = wireStripper(k); scene.add(stripper);
  const STRIP_REST: Pose = { p: new three.Vector3(-156, 6.8, 78), q: qY(0.5) };
  // 이름표·빛: 연장마다 재질을 따로 둬서 하나만 빛나게 한다 (손은 빛내지 않는다)
  const TOOLS: Record<ToolId, T.Object3D[]> = { iron: [iron], solder: [solderT], cutter: [cutter], stripper: [stripper], meter: [probeR, probeB] };
  const toolMats = new Map<ToolId, T.MeshStandardMaterial[]>();
  for (const [id, objs] of Object.entries(TOOLS) as Array<[ToolId, T.Object3D[]]>) {
    const ms: T.MeshStandardMaterial[] = [];
    for (const o of objs) o.traverse((c) => { const m = c as T.Mesh; if (m.isMesh && (m.material as T.MeshStandardMaterial).isMeshStandardMaterial) { const cl = (m.material as T.MeshStandardMaterial).clone(); m.material = cl; ms.push(cl); } });
    toolMats.set(id, ms);
  }
  const handR = hand(k, "right"), handL = hand(k, "left");
  handR.position.y = 62; iron.add(handR); handL.position.y = 30; solderT.add(handL);
  handR.visible = handL.visible = false;
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
      if (def.kind === "resistor") { const r = resistor(k, pitch, def.spec?.ohms ?? 220); obj = r.group; rec.tails = r.tails; rec.bend = r.bend; r.bend?.(0); }
      else { const l = led5(k, def.spec?.color ?? "#ff3b2f"); obj = l.group; rec.tails = l.tails; rec.led = { lens: l.lens, glow: l.glow as T.PointLight }; }
      if (a && b) final = { p: a.clone().add(b).multiplyScalar(0.5), q: along(a, b) };
    } else if (def.kind === "header_male") {
      const h = headerMale(k, def.spec?.pins ?? 8); obj = h.group; rec.header = h;
      const a = holes[0], b = holes[holes.length - 1];
      if (a && b) final = { p: a.clone().add(b).multiplyScalar(0.5), q: along(a, b) };
    } else if (def.kind === "sensor_module") {
      const m = sensorModule(k, def.spec?.pinNames ?? ["VCC", "GND", "SCL", "SDA"], def.spec?.silk ?? "MODULE"); obj = m.group; rec.module = m;
      if (ins?.op === "mount_on") { const h = parts.get(ins.onto); if (h?.final && h.header) final = { p: new three.Vector3(0, h.header.plasticTop, 0).applyMatrix4(poseMatrix(h.final)), q: h.final.q.clone() }; }
      else { const place = allOps.find((o) => o.op === "place" && o.ref === def.ref) as Extract<BenchOp, { op: "place" }> | undefined; if (place) final = { p: new three.Vector3(place.at[0], 0, place.at[1]), q: qY(((place.rotation ?? 0) * Math.PI) / 180) }; }
    } else if (def.kind === "wire") {
      obj = new three.Group();
      const place = allOps.find((o) => o.op === "place" && o.ref === def.ref) as Extract<BenchOp, { op: "place" }> | undefined;
      if (place) final = { p: new three.Vector3(place.at[0], 0, place.at[1]), q: qY(((place.rotation ?? 0) * Math.PI) / 180) };
      const len = def.spec?.widthMm ?? 60;
      const sizer = new three.Mesh(new three.BoxGeometry(len, 1.6, 2), new three.MeshBasicMaterial({ visible: false })); sizer.position.set(len / 2, 0.8, 0); obj.add(sizer); // 트레이 배치용 크기
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
    } else if (def.kind === "housing_shape" && def.spec?.sizeMm && def.spec.posMm) {
      const [sx, sy, sz] = def.spec.sizeMm, [px, py, pz] = def.spec.posMm;
      const m = new three.MeshStandardMaterial({ color: def.spec.color ?? "#9ed3cb", transparent: true, opacity: 0, depthWrite: false, side: three.DoubleSide, roughness: 0.55 });
      const g = def.spec.primitive === "cylinder" ? new three.CylinderGeometry(Math.min(sx, sy) / 2, Math.min(sx, sy) / 2, sz, 40) : def.spec.primitive === "cone" ? new three.ConeGeometry(Math.min(sx, sy) / 2, sz, 40) : def.spec.primitive === "sphere" ? new three.SphereGeometry(0.5, 32, 20) : new three.BoxGeometry(sx, sz, sy);
      obj = new three.Group();
      const me = new three.Mesh(g, m); if (def.spec.primitive === "sphere") me.scale.set(sx, sz, sy); obj.add(me);
      const edges = new three.LineSegments(new three.EdgesGeometry(g, 30), new three.LineBasicMaterial({ color: "#2f5d55", transparent: true, opacity: 0 })); if (def.spec.primitive === "sphere") edges.scale.set(sx, sz, sy); obj.add(edges);
      obj.userData.fade = [m, edges.material];
      const base = parts.get(def.spec.around ?? "");
      const c = base?.final?.p ?? new three.Vector3(0, 0, -6);
      final = { p: new three.Vector3(c.x + px, pz + sz / 2, c.z + py), q: new three.Quaternion() };
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

  // ── 뒤집기 받침(rig): 만능기판과 거기 꽂힌 부품·땜납을 한 덩어리로 뒤집는다 ──
  // 안의 물체는 '기판 좌표'(뒤집기 전 좌표)를 그대로 쓰고, rig 변환이 화면 좌표로 옮긴다.
  const canFlip = kitCanFlip(kit);
  const boardPart = canFlip ? [...parts.values()].find((p) => p.def.kind === "perfboard" && p.final) ?? null : null;
  const rigRefs = new Set<string>();
  if (boardPart) {
    rigRefs.add(boardPart.def.ref);
    for (let changed = true; changed;) {
      changed = false;
      for (const o of allOps) {
        const base = o.op === "insert" ? o.into : o.op === "mount_on" ? o.onto : o.op === "seat" ? o.onto : null;
        if (base && rigRefs.has(base) && "ref" in o && !rigRefs.has(o.ref)) { rigRefs.add(o.ref); changed = true; }
      }
    }
  }
  const rig = new three.Group(); scene.add(rig);
  for (const ref of rigRefs) { const p = parts.get(ref); if (p) rig.add(p.obj); }
  const rigM = new three.Matrix4(), rigInv = new three.Matrix4(), rigQ = new three.Quaternion();
  const pivot = boardPart?.final && boardPart.board ? boardPart.final.p.clone().add(new three.Vector3(0, (boardPart.board.topY + boardPart.board.bottomY) / 2, 0)) : new three.Vector3();
  const flipAxis = new three.Vector3(1, 0, 0).applyQuaternion(boardPart?.final?.q ?? new three.Quaternion());
  let flipT = 0, flipped = false;
  const setFlip = (u: number) => {
    flipT = clamp(u);
    rigQ.setFromAxisAngle(flipAxis, Math.PI * smooth(flipT));
    rig.quaternion.copy(rigQ);
    rig.position.copy(pivot).sub(pivot.clone().applyQuaternion(rigQ)).add(new three.Vector3(0, Math.sin(Math.PI * flipT) * 42, 0));
    rig.updateMatrixWorld(true);
    rigM.copy(rig.matrixWorld); rigInv.copy(rigM).invert();
  };
  setFlip(0);
  const inRig = (anchor: string) => rigRefs.has(anchor.split(".")[0]);
  /** 기판 좌표 → 화면(세계) 좌표 */
  const W = (v: T.Vector3) => v.clone().applyMatrix4(rigM);
  const toBoard = (v: T.Vector3) => v.clone().applyMatrix4(rigInv);
  const poseW = (pose: Pose): Pose => ({ p: W(pose.p), q: rigQ.clone().multiply(pose.q) });
  /** 이 면(기판 좌표의 top/bottom)이 지금 하늘을 보는가 */
  const faceUp = (side: "top" | "bottom") => (side === "top") !== (flipT > 0.5);

  // 트레이 배치: 부품 순서대로 왼쪽부터, 눕혀서. 폭이 넘치면 다음 줄.
  {
    for (const p of parts.values()) if (p.def.kind === "housing_shape" && p.final) p.home = { p: p.final.p.clone().add(new three.Vector3(0, 110, 0)), q: p.final.q.clone() };
    const items = [...parts.values()].filter((p) => p.def.kind !== "housing_shape").map((p) => {
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
  for (const p of parts.values()) if (p.def.kind === "wire") {
    const len = p.def.spec?.widthMm ?? 60;
    wires.push({ id: `${p.def.ref}.END`, color: p.def.spec?.color ?? "#d8322a", holderRef: p.def.ref, exitLocal: new three.Vector3(0, 0.8, 0), looseLocal: new three.Vector3(len, 0.8, 0), strip: 0, tin: 0, insert: 0, hole: null, mesh: null, bare: null, bareMat: new three.MeshStandardMaterial({ color: "#c87a45", metalness: 1, roughness: 0.35 }), key: "" });
  }
  for (const o of allOps) if (o.op === "insert_wire") { const w = wires.find((x) => x.id === o.wire); if (w) { w.hole = holeWorld(o.hole); w.holeRig = rigRefs.has(o.hole.split(".")[0]); } }
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
    // 구멍 둘레 점은 기판 좌표로 잡고 뒤집기를 거쳐 옮긴다 (보드가 뒤집히면 전선도 따라간다)
    const Wh = (v: T.Vector3) => (w.holeRig ? W(v) : v);
    // surface: 패드 위에 눕혀 붙이기 (모듈 패드에 직접 납땜), 아니면 구멍에 꽂아 아래로
    const toward = exit.clone().sub(hb).setY(0).normalize();
    const a2 = Wh(hb.clone().setY(hb.y + 18)), m2 = out.clone().lerp(a2, 0.45); m2.y = a2.y;
    const ip = w.surface
      ? [exit, out, out.clone().lerp(hb, 0.5).setY(Math.max(hb.y, out.y) + 10), hb.clone().add(toward.clone().multiplyScalar(9)).setY(hb.y + 2.2), hb.clone().add(toward.clone().multiplyScalar(3)).setY(hb.y + 0.9), hb.clone().add(toward.clone().multiplyScalar(-1.5)).setY(hb.y + 0.7)]
      : [exit, out, m2, Wh(hb.clone().add(new three.Vector3(-3, 7, 0))), Wh(hb.clone().setY(hb.y + 1.2)), Wh(hb.clone().setY(hb.y - 1.6 - 1.5))];
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
  /** 앵커의 세계 좌표 (뒤집힌 보드면 뒤집힌 자리) */
  const anchorWorld = (anchor: string, side: "top" | "bottom" = "top"): T.Vector3 | null => {
    if (!anchor.includes(".")) { const p = parts.get(anchor); if (!p) return null; const b = new three.Box3().setFromObject(p.obj); return b.getCenter(new three.Vector3()).setY(b.max.y); }
    const v = anchorLocal(anchor, side);
    return v && inRig(anchor) ? W(v) : v;
  };
  /** 앵커의 기판 좌표 (rig 안의 물체를 놓을 때) */
  const anchorBoard = (anchor: string, side: "top" | "bottom" = "top"): T.Vector3 | null => {
    const v = anchorWorld(anchor, side);
    return v && inRig(anchor) ? toBoard(v) : v;
  };
  const anchorLocal = (anchor: string, side: "top" | "bottom"): T.Vector3 | null => {
    const [ref, name] = anchor.split(".");
    const p = parts.get(ref);
    if (p?.board) return holeWorld(anchor, side);
    if (p?.module && p.final) { const i = (p.def.spec?.pinNames ?? []).indexOf(name); if (i < 0) return null; return new three.Vector3(p.module.hx(i), p.module.topY, 0).applyMatrix4(poseMatrix(p.final)); }
    if (p?.holder) return wireEnd(anchor);
    if (p?.pinLocal && p.final) { const l = p.pinLocal.get(anchor.slice(ref.length + 1)) ?? p.pinLocal.get(name); if (l) return l.clone().applyMatrix4(poseMatrix(p.final)); const c = p.final.p.clone(); c.y += 4; return c; }
    return null;
  };

  // 구멍이 아닌 핀(모듈 패드)에 붙이는 전선
  for (const o of allOps) if (o.op === "insert_wire") { const w = wires.find((x) => x.id === o.wire); if (w && !w.hole) { w.hole = anchorWorld(o.hole); w.surface = true; } }

  // ── 땜납 ──
  const filletG = filletGeometry(three), coldG = coldGeometry(three);
  const tinM = k.tin, coldM = k.std("#9c9c97", { metal: 0.6, rough: 0.85 });
  const jointsByOp = new Map<BenchOp, Joint[]>();
  for (const o of allOps) if (o.op === "solder") {
    jointsByOp.set(o, o.joints.map((a) => {
      const pos = anchorWorld(a, o.side) ?? new three.Vector3();
      const rigged = inRig(a);
      const mesh = k.mesh(filletG, tinM, rigged ? rig : scene);
      mesh.position.copy(pos); if (o.side === "bottom") mesh.rotation.x = Math.PI;
      mesh.scale.setScalar(0.001); mesh.visible = false;
      return { anchor: a, pos, side: o.side, mesh, rig: rigged };
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
    bridgeMeshes.set(o, o.pairs.map(([a, b]) => { const pa = anchorWorld(a, "bottom")!, pb = anchorWorld(b, "bottom")!; const me = capsule(pa.clone().add(new three.Vector3(0, -0.55, 0)), pb.clone().add(new three.Vector3(0, -0.55, 0)), 0.75, tinM); me.visible = false; if (inRig(a)) rig.add(me); return me; }));
  }
  const mistakeBlob = capsule(new three.Vector3(), new three.Vector3(PITCH, 0, 0), 0.7, tinM); mistakeBlob.visible = false;
  if (boardPart) rig.add(mistakeBlob);

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
    // rig 안 부품의 트레이 자리(세계 좌표)는 기판 좌표로 바꿔서 쓴다
    const home = rigRefs.has(p.def.ref) && flipT > 0 ? { p: toBoard(p.home.p), q: rigQ.clone().invert().multiply(p.home.q) } : p.home;
    if (t <= 0) { setPose(p.obj, home); p.atHome = true; return; }
    p.atHome = false;
    if (t >= 1) { setPose(p.obj, p.final); return; }
    const above = p.final.p.clone().add(new three.Vector3(0, settle, 0));
    const a = smooth(seg(t, 0, 0.72)), d = smooth(seg(t, 0.72, 1));
    const pos = home.p.clone().lerp(above, a); pos.y += Math.sin(Math.PI * a) * 55;
    pos.lerp(p.final.p, d);
    p.obj.position.copy(pos);
    p.obj.quaternion.copy(home.q).slerp(p.final.q, smooth(seg(t, 0.05, 0.6)));
  };
  /** 인두 자세 (pos·side는 기판 좌표 기준). rigged = 뒤집기 받침 위의 자리 */
  const ironPoseFor = (pos: T.Vector3, side: "top" | "bottom", rigged = false): Pose => {
    const dir = side === "bottom" ? new three.Vector3(0.42, -0.62, 0.66) : new three.Vector3(0.45, 0.66, 0.6);
    const pose = { p: pos.clone().add(dir.clone().multiplyScalar(0.9)), q: new three.Quaternion().setFromUnitVectors(new three.Vector3(0, 1, 0), dir.normalize()) };
    return rigged ? poseW(pose) : pose;
  };
  /** 실납 끝을 납땜 자리에 대는 자세 (인두 반대쪽에서) */
  const feedPoseFor = (pos: T.Vector3, side: "top" | "bottom", rigged = false): Pose => {
    const dir = side === "bottom" ? new three.Vector3(-0.62, -0.5, 0.6) : new three.Vector3(-0.62, 0.5, 0.6);
    dir.normalize();
    const pose = { p: pos.clone().add(dir.clone().multiplyScalar(0.7)), q: new three.Quaternion().setFromUnitVectors(new three.Vector3(0, 1, 0), dir) };
    return rigged ? poseW(pose) : pose;
  };
  // 양손 준비: 이번 단계 납땜 자리들 가운데 위에 인두(오른손)·실납(왼손)을 들고 있는다
  let handsReady = false, handsT = 0;
  const workCenter = (): T.Vector3 | null => {
    const s = kit.steps[current]; if (!s) return null;
    const pts: T.Vector3[] = [];
    for (const o of s.ops) {
      if (o.op === "solder") for (const j of o.joints) { const a = anchorWorld(j, o.side); if (a) pts.push(a); }
      if (o.op === "bridge") for (const [a, b] of o.pairs) { const pa = anchorWorld(a, "bottom"), pb = anchorWorld(b, "bottom"); if (pa && pb) pts.push(pa.lerp(pb, 0.5)); }
    }
    return pts.length ? pts.reduce((a, b) => a.add(b), new three.Vector3()).multiplyScalar(1 / pts.length) : null;
  };
  const readyPoses = () => {
    const c = workCenter(); if (!c) return null;
    const di = new three.Vector3(0.45, 0.66, 0.6).normalize(), ds = new three.Vector3(-0.55, 0.6, 0.58).normalize();
    return {
      iron: { p: c.clone().add(new three.Vector3(12, 10, 8)), q: new three.Quaternion().setFromUnitVectors(new three.Vector3(0, 1, 0), di) },
      solder: { p: c.clone().add(new three.Vector3(-12, 10, 8)), q: new three.Quaternion().setFromUnitVectors(new three.Vector3(0, 1, 0), ds) }
    };
  };
  let ironHome: Pose = IRON_REST, solderHome: Pose = SOLDER_REST;
  const lerpPose = (a: Pose, b: Pose, e: number): Pose => ({ p: a.p.clone().lerp(b.p, e), q: a.q.clone().slerp(b.q, e) });
  const bendOverride = new Map<string, number>();
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
      case "enclose": {
        op.refs.forEach((ref, i) => {
          const p = parts.get(ref); if (!p?.final) return;
          const u = smooth(clamp(t * op.refs.length - i));
          p.obj.position.copy(p.home.p).lerp(p.final.p, u); p.obj.quaternion.copy(p.final.q);
          p.atHome = u <= 0; p.obj.visible = u > 0;
          const [m, e] = p.obj.userData.fade as [T.MeshStandardMaterial, T.LineBasicMaterial];
          m.opacity = 0.38 * u; e.opacity = 0.8 * u;
        });
        break;
      }
      case "jumper": { const j = jumpers.get(op); if (j) j.t = t; break; }
      case "place": case "insert": case "mount_on": case "batteries": {
        const ref = op.ref;
        const p = op.op === "batteries" ? [...parts.values()].find((x) => x.def.kind === "aa_battery") : parts.get(ref);
        // 저항처럼 다리를 구부려 꽂는 부품: 먼저 ㄱ자로 꺾고(직접 하기에서 이미 꺾었으면 바로) 날아간다
        if (p?.bend && op.op === "insert") { const pre = bendOverride.get(ref) ?? 0; p.bend(Math.max(pre, smooth(seg(t, 0, 0.22)))); fly(p, pre >= 1 ? t : seg(t, 0.22, 1), 14); break; }
        if (p) fly(p, t, op.op === "insert" ? 14 : op.op === "mount_on" ? 10 : 6);
        break;
      }
      case "prep_wire": {
        op.wires.forEach((id) => { const w = wires.find((x) => x.id === id); if (!w) return; w.strip = smooth(seg(t, 0.05, 0.55)); w.tin = op.tin ? smooth(seg(t, 0.55, 0.95)) : 0; });
        if (active) {
          const end = wireEnd(op.wires[0]);
          if (end) {
            // 와이어 스트리퍼로 피복을 물고 당긴 뒤, 인두·실납으로 예비납
            const v = seg(t, 0, 0.55);
            toolTo(stripper, STRIP_REST, { p: end.clone().add(new three.Vector3(-2 - 5 * smooth(seg(v, 0.45, 0.8)), 0.4, 0)), q: qY(Math.PI / 2) }, v < 0.25 ? v / 0.25 : v > 0.85 ? (1 - v) / 0.15 : 1);
            if (op.tin) { const u = seg(t, 0.5, 1); const e = u < 0.15 ? u / 0.15 : u > 0.85 ? (1 - u) / 0.15 : 1; toolTo(iron, ironHome, ironPoseFor(end, "top"), e); toolTo(solderT, solderHome, feedPoseFor(end, "top"), e); }
          }
        }
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
          const work = ironPoseFor(js[i].pos, js[i].side, js[i].rig);
          const prev = i > 0 ? ironPoseFor(js[i - 1].pos, js[i - 1].side, js[i - 1].rig) : ironHome;
          const up = (js[i].rig ? faceUp(js[i].side) : js[i].side === "top") ? 6 : -6;
          const lift = (q: Pose) => ({ p: q.p.clone().add(new three.Vector3(0, up, 0)), q: q.q });
          if (i === 0 && u < 0.3) toolTo(iron, ironHome, work, u / 0.3);
          else if (u < 0.3) { const e = smooth(u / 0.3); const a = lift(prev); iron.position.copy(a.p).lerp(work.p, e); iron.quaternion.copy(work.q); }
          else if (i === n - 1 && u > 0.85) toolTo(iron, ironHome, work, 1 - (u - 0.85) / 0.15);
          else if (u > 0.85) { const e = smooth((u - 0.85) / 0.15); iron.position.copy(work.p).lerp(lift(work).p, e); iron.quaternion.copy(work.q); }
          else setPose(iron, work);
          (iron.userData.glow as T.Mesh).material = Object.assign((iron.userData.glow as T.Mesh).material as T.MeshBasicMaterial, { opacity: u > 0.3 && u < 0.85 ? 0.85 : 0 });
          // 실납은 데운 뒤 반대쪽에서 대고, 녹으면 인두보다 먼저 뗀다
          const f = u < 0.22 ? 0 : u < 0.36 ? (u - 0.22) / 0.14 : u < 0.72 ? 1 : u < 0.84 ? 1 - (u - 0.72) / 0.12 : 0;
          toolTo(solderT, solderHome, feedPoseFor(js[i].pos, js[i].side, js[i].rig), f);
        }
        break;
      }
      case "bridge": {
        const ms = bridgeMeshes.get(op) ?? [];
        ms.forEach((m, i) => { const g = smooth(seg(clamp(t * ms.length - i), 0.25, 0.85)); m.visible = g > 0.001; m.scale.set(g, 1, 0.55 * g); m.material = tinM; });
        if (active && ms.length) {
          const i = Math.min(ms.length - 1, Math.floor(t * ms.length)); const u = clamp(t * ms.length - i);
          const rigged = ms[i].parent === rig, at = ms[i].position.clone().add(new three.Vector3(0, -0.5, 0));
          toolTo(iron, ironHome, ironPoseFor(at, "bottom", rigged), i === 0 && u < 0.25 ? u / 0.25 : i === ms.length - 1 && u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1);
          const f = u < 0.2 ? 0 : u < 0.35 ? (u - 0.2) / 0.15 : u < 0.75 ? 1 : u < 0.88 ? 1 - (u - 0.75) / 0.13 : 0;
          toolTo(solderT, solderHome, feedPoseFor(at, "bottom", rigged), f);
        }
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
          const rigged = rigRefs.has(tails[i].owner.def.ref);
          const wb: Pose = { p: (rigged ? toBoard(wp) : wp).add(new three.Vector3(0, -2.2, 0)), q: new three.Quaternion().setFromEuler(new three.Euler(Math.PI / 2, 0, 0)) };
          const work: Pose = rigged ? poseW(wb) : wb;
          const u = clamp(t * n - i); toolTo(cutter, CUTTER_REST, work, i === 0 && u < 0.3 ? u / 0.3 : i === n - 1 && u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1);
        }
        break;
      }
      case "check": {
        if (op.how === "power_on") {
          for (const tg of op.targets) { const p = parts.get(tg); if (p?.led) { p.led.lens.emissiveIntensity = 2.6 * smooth(t); p.led.glow.intensity = 900 * smooth(t); ((p.led.glow.userData.halo as T.Sprite).material as T.SpriteMaterial).opacity = 0.9 * smooth(t); } }
        }
        if ((op.how === "continuity" || op.how === "voltage") && active) {
          const up = kit.steps[current]?.view !== "bottom";
          const a = anchorBoard(op.targets[0], up ? "top" : "bottom"), b = anchorBoard(op.targets[1] ?? op.targets[0], up ? "top" : "bottom");
          if (a && b) {
            const u = t, sy = up ? 1 : -1, rigged = inRig(op.targets[0]);
            const PW = (q: Pose) => (rigged ? poseW(q) : q);
            const w1: Pose = PW({ p: a.clone().add(new three.Vector3(0, 0.6 * sy, 0)), q: new three.Quaternion().setFromUnitVectors(new three.Vector3(0, 1, 0), new three.Vector3(-0.35, 0.85 * sy, 0.4).normalize()) });
            const w2: Pose = PW({ p: b.clone().add(new three.Vector3(0, 0.6 * sy, 0)), q: new three.Quaternion().setFromUnitVectors(new three.Vector3(0, 1, 0), new three.Vector3(0.35, 0.85 * sy, 0.4).normalize()) });
            const e = u < 0.35 ? u / 0.35 : u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
            toolTo(probeR, PROBE_REST[0], w1, e); toolTo(probeB, PROBE_REST[1], w2, e);
            const at = a.clone().lerp(b, 0.5).add(new three.Vector3(0, 9 * sy, 0));
            if (u > 0.4 && u < 0.9) showReading(op.how === "voltage" ? op.expected : op.expected.includes("없음") || op.expected.includes("OL") ? "OL · 소리 없음" : "삐 ─ 연결됨", rigged ? W(at) : at);
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
    const rp = handsT > 0 ? readyPoses() : null;
    ironHome = rp ? lerpPose(IRON_REST, rp.iron, smooth(handsT)) : IRON_REST;
    solderHome = rp ? lerpPose(SOLDER_REST, rp.solder, smooth(handsT)) : SOLDER_REST;
    if (rp && handsT < 1) { toolTo(iron, IRON_REST, rp.iron, handsT); toolTo(solderT, SOLDER_REST, rp.solder, handsT); } else { setPose(iron, ironHome); setPose(solderT, solderHome); }
    handR.visible = handL.visible = handsT > 0.35;
    setPose(cutter, CUTTER_REST); setPose(probeR, PROBE_REST[0]); setPose(probeB, PROBE_REST[1]); setPose(stripper, STRIP_REST);
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
    applyHoldLooks();
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
        else if (p?.module) { const names = p.def.spec?.pinNames ?? []; const i = names.indexOf(name); b = anchorBoard(`${ref}.${names[i + 1] ?? names[i - 1]}`, "top"); }
        else { const m = /^([A-Z])(\d+)$/.exec(name); if (m) b = anchorBoard(`${ref}.${String.fromCharCode(m[1].charCodeAt(0) + 1)}${m[2]}`, j.side); }
      } else {
        const br = step.ops.find((o) => o.op === "bridge") as Extract<BenchOp, { op: "bridge" }> | undefined;
        if (br) { a = anchorBoard("PB.H5", "bottom"); b = anchorBoard("PB.I5", "bottom"); }
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
    for (const p of parts.values()) p.obj.visible = p.def.kind === "housing_shape" ? !p.atHome : !(below && p.atHome);
    for (const w of wires) { const h = parts.get(w.holderRef); const hide = below && !!h?.atHome; if (w.mesh) w.mesh.visible = !hide; if (w.bare) w.bare.visible = !hide && w.strip > 0.01; }
    scene.traverse((o) => { if (o.userData.prop) o.visible = !below && !light; });
    under.intensity = below ? 1.6 : 0;
  };

  // ── 목표(마커) ──
  /** 단계의 목표. from·to를 주면 그 op들만 (직접 하기에서 한 동작씩) */
  const stepTargets = (si: number, from = 0, to = Infinity): Target[] => {
    const s = kit.steps[si]; if (!s) return [];
    const out: Target[] = [];
    const Wr = (ref: string, v: T.Vector3) => (rigRefs.has(ref) ? W(v) : v);
    s.ops.forEach((op, oi) => {
      if (oi < from || oi >= to) return;
      if (op.op === "place" || op.op === "mount_on" || op.op === "batteries") {
        const p = parts.get(op.ref);
        const fin = p?.final;
        if (op.op === "mount_on") { for (const h of op.holes) { const a = anchorWorld(h); if (a) out.push({ pos: a, label: h.split(".")[1], radius: 2.2 }); } }
        else if (fin) out.push({ pos: Wr(op.ref, fin.p.clone().add(new three.Vector3(0, op.op === "batteries" ? 8 : 1, 0))), radius: 18, part: op.ref });
      } else if (op.op === "seat") {
        const p = parts.get(op.ref); if (p?.final) { const b = new three.Box3().setFromObject(p.obj); const h = Math.max(2, b.max.y - b.min.y); const r = Math.min(14, Math.max(5, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.45)); out.push({ pos: Wr(op.ref, p.final.p.clone().add(new three.Vector3(0, h * 0.5, 0))), radius: r, part: op.ref }); }
      } else if (op.op === "enclose") {
        for (const ref of op.refs.slice(0, 1)) { const p = parts.get(ref); if (p?.final) out.push({ pos: p.final.p.clone(), radius: 18, part: ref }); }
      } else if (op.op === "jumper") {
        for (const end of [op.from, op.to]) { const a = anchorWorld(end); if (a) out.push({ pos: a, label: end, radius: 2.6 }); }
      } else if (op.op === "insert") {
        op.holes.forEach((h, i) => { const a = anchorWorld(h); if (a) out.push({ pos: a, label: i === 0 || i === op.holes.length - 1 ? h.split(".")[1] : undefined, radius: 2.0 }); });
      } else if (op.op === "prep_wire") {
        for (const w of op.wires) { const a = anchorWorld(w); if (a) out.push({ pos: a, label: w.endsWith("RED") ? "빨간 선" : w.endsWith("BLK") ? "검은 선" : "전선 끝", radius: 7 }); }
      } else if (op.op === "insert_wire") {
        const a = anchorWorld(op.hole); if (a) out.push({ pos: a, label: op.hole.split(".")[1], radius: 2.0 });
      } else if (op.op === "solder") {
        for (const j of op.joints) { const a = anchorWorld(j, op.side); if (a) out.push({ pos: a, label: j.split(".")[1], radius: 2.0 }); }
      } else if (op.op === "bridge") {
        for (const [x, y] of op.pairs) { const a = anchorWorld(x, "bottom"), b = anchorWorld(y, "bottom"); if (a && b) out.push({ pos: a.clone().lerp(b, 0.5), label: `${x.split(".")[1]}–${y.split(".")[1]}`, radius: 2.2 }); }
      } else if (op.op === "trim") {
        for (const r of op.refs) for (const t of parts.get(r)?.tails ?? []) {
          t.updateMatrixWorld(); const wp = new three.Vector3(); t.getWorldPosition(wp);
          const rigged = rigRefs.has(r), b = (rigged ? toBoard(wp) : wp).add(new three.Vector3(0, -(t.userData.len as number) * 0.6, 0));
          out.push({ pos: rigged ? W(b) : b, radius: 4 });
        }
      } else if (op.op === "check") {
        if ((op.how === "continuity" || op.how === "voltage") && op.targets.length >= 2) { const sd = kit.steps[si].view === "bottom" ? "bottom" : "top"; const a = anchorWorld(op.targets[0], sd), b = anchorWorld(op.targets[1], sd); if (a && b) out.push({ pos: a.clone().lerp(b, 0.5), label: `${op.targets[0].split(".")[1]}–${op.targets[1].split(".")[1]}`, radius: 2.4 }); }
        else if (op.how === "look" && op.targets.every((t) => !t.includes("."))) { for (const t of op.targets) { const a = anchorWorld(t); if (a) out.push({ pos: a, radius: 14, part: t }); } }
        else for (const t of op.targets) { const side = kit.steps[si].view === "bottom" ? "bottom" : "top"; const a = anchorWorld(t, side); if (a) out.push({ pos: a, label: t.includes(".") ? t.split(".")[1] : undefined, radius: t.includes(".") ? 2.2 : 12, part: t.includes(".") ? undefined : t }); }
      }
    });
    return out;
  };

  // ── 직접 하기: 한 동작씩 (다리 구부리기 · 뒤집기 · 양손 · 꾹 눌러 납땜) ──
  let stage: HandsStage | null = null, stageHint: string | null = null;
  const holdGrades = new Map<string, HoldGrade>();
  let holding: { key: string; start: number; id: number } | null = null;
  const holdOp = () => (stage?.kind === "hold" ? kit.steps[current]?.ops[stage.op] ?? null : null);
  /** 납땜 자리 key → 땜납 메시·기판 자리 */
  const holdItem = (key: string): { mesh: T.Mesh; at: T.Vector3; side: "top" | "bottom"; rig: boolean; bridge: boolean } | null => {
    const op = holdOp(); if (!op) return null;
    if (op.op === "solder") { const i = op.joints.indexOf(key); const j = jointsByOp.get(op)?.[i]; return j ? { mesh: j.mesh, at: j.pos, side: j.side, rig: j.rig, bridge: false } : null; }
    if (op.op === "bridge") { const i = op.pairs.findIndex(([a, b]) => `${a}|${b}` === key); const m = bridgeMeshes.get(op)?.[i]; return m ? { mesh: m, at: m.position.clone().add(new three.Vector3(0, -0.5, 0)), side: "bottom", rig: m.parent === rig, bridge: true } : null; }
    return null;
  };
  const holdWorld = (key: string) => { const it = holdItem(key); return it ? (it.rig ? W(it.at) : it.at.clone()) : null; };
  /** 땜납 모양: fill 0~1 (원뿔이 찬 정도) 또는 판정 */
  const lookJoint = (key: string, fill: number, look: HoldGrade | "live") => {
    const it = holdItem(key); if (!it) return;
    const m = it.mesh; m.visible = true;
    if (it.bridge) {
      if (look === "cold") { m.material = coldM; m.scale.set(1, 1, 0.6); }
      else if (look === "starved") { m.material = tinM; m.scale.set(0.7, 0.42, 0.4); }
      else { const g = look === "good" ? 1 : fill; m.material = tinM; m.scale.set(Math.max(0.001, g), 0.35 + 0.65 * g, 0.55 * Math.max(0.001, g)); m.visible = g > 0.01; }
      return;
    }
    if (look === "cold") { m.geometry = coldG; m.material = coldM; m.scale.setScalar(1); }
    else if (look === "starved") { m.geometry = filletG; m.material = tinM; m.scale.set(0.72, 0.38, 0.72); }
    else { const g = look === "good" ? 1 : fill; m.geometry = filletG; m.material = tinM; m.scale.set(0.6 + 0.4 * g, Math.max(0.001, g), 0.6 + 0.4 * g); m.visible = g > 0.01; }
  };
  const applyHoldLooks = () => { if (!holdOp()) return; for (const [key, g] of holdGrades) lookJoint(key, 1, g); };
  /** 꾹 누르는 동안: 인두가 먼저 데우고, 실납이 반대쪽에서 들어왔다가 원뿔이 차면 빠진다 */
  const holdLive = (now: number) => {
    if (!holding) return;
    const ms = now - holding.start, it = holdItem(holding.key); if (!it) return;
    lookJoint(holding.key, holdFill(ms), ms > HOLD_MS.cold ? "cold" : "live");
    const work = ironPoseFor(it.at, it.side, it.rig), e = smooth(Math.min(1, ms / 260));
    const ip = lerpPose(ironHome, work, e); setPose(iron, ip);
    ((iron.userData.glow as T.Mesh).material as T.MeshBasicMaterial).opacity = ms > 180 ? 0.85 : 0;
    const f = ms < 300 ? 0 : ms < 600 ? (ms - 300) / 300 : ms < HOLD_MS.good ? 1 : Math.max(0, 1 - (ms - HOLD_MS.good) / 350);
    const fp = feedPoseFor(it.at, it.side, it.rig);
    setPose(solderT, lerpPose(solderHome, fp, smooth(f)));
    if (ms > 12000) endHold();
  };
  const endHold = (at = performance.now()) => {
    if (!holding) return;
    const ms = Math.max(0, at - holding.start), key = holding.key, grade = gradeHold(ms);
    holding = null; controls.enabled = true;
    holdGrades.set(key, grade);
    applyAll(); buildMarkers();
    opts.cb.onHold?.({ type: "end", key, ms, grade });
  };
  const holdLabel = (key: string) => key.split("|").map((a) => a.split(".")[1] ?? a).join("–");
  const curTargets = (): Target[] => {
    if (!stage) return stepTargets(current);
    switch (stage.kind) {
      case "tap": return stepTargets(current, stage.from, stage.to);
      case "bend": { const p = parts.get(stage.ref); if (!p) return []; const b = new three.Box3().setFromObject(p.obj); return [{ pos: b.getCenter(new three.Vector3()).setY(b.max.y), radius: 13, part: stage.ref, label: p.def.label }]; }
      case "flip": return boardPart ? [{ pos: anchorWorld(boardPart.def.ref)!, radius: 18, part: boardPart.def.ref, label: "보드" }] : [];
      case "hands": return [];
      case "hold": return stage.keys.filter((k2) => holdGrades.get(k2) !== "good").flatMap((k2): Target[] => { const pos = holdWorld(k2); return pos ? [{ pos, label: holdLabel(k2), radius: 2.0 }] : []; });
    }
  };
  /** 양손 준비·납땜 때는 연장 끝도 화면에 들어오게 */
  const extraFit = (): T.Vector3[] => {
    if (stage?.kind !== "hands") return [];
    const rp = readyPoses(); return rp ? [rp.iron.p.clone(), rp.solder.p.clone()] : [];
  };
  const viewFor = (si: number): BenchView => {
    const s = kit.steps[si]; if (!s) return "34";
    if (stage?.kind === "bend" || stage?.kind === "flip") return "34";
    return flipped && s.view === "bottom" ? "top" : s.view;
  };

  const buildMarkers = () => {
    markerG.clear();
    if (ghost) { scene.remove(ghost); ghost = null; }
    const s = kit.steps[current];
    if (!s || (progress[current] > 0 && !stage) || tweens.length) { targets = []; return; }
    targets = curTargets();
    const camBelow = viewFor(current) === "bottom";
    const ghostOp = (!stage || stage.kind === "tap") ? s.ops.find((o, oi) => (o.op === "place" || o.op === "insert" || o.op === "mount_on" || o.op === "batteries" || o.op === "seat") && (!stage || stage.kind !== "tap" || (oi >= stage.from && oi < stage.to))) as Extract<BenchOp, { ref: string }> | undefined : undefined;
    if (ghostOp) {
      const p = ghostOp.op === "batteries" ? [...parts.values()].find((x) => x.def.kind === "aa_battery") : parts.get(ghostOp.ref);
      if (p?.final) {
        p.bend?.(1);
        ghost = p.obj.clone(true);
        p.bend?.(bendOverride.get(p.def.ref) ?? 0);
        ghost.traverse((o) => { const m = o as T.Mesh; if (m.isMesh) { m.material = ghostMat; m.castShadow = false; } if ((o as T.PointLight).isLight) o.visible = false; });
        setPose(ghost, rigRefs.has(p.def.ref) ? poseW(p.final) : p.final); ghost.visible = true; scene.add(ghost);
      }
    }
    for (const t of targets) {
      if (t.radius <= 4) {
        const ring = new three.Mesh(ringGeo, ringMat); ring.renderOrder = 15;
        ring.position.copy(t.pos).add(new three.Vector3(0, camBelow ? -0.15 : 0.15, 0)); ring.rotation.x = Math.PI / 2;
        markerG.add(ring);
      } else {
        const ring = new three.Mesh(new three.TorusGeometry(t.radius * 0.55, 0.5, 8, 48), ringMat); ring.renderOrder = 15;
        ring.position.copy(t.pos).add(new three.Vector3(0, 0.6, 0)); ring.rotation.x = Math.PI / 2; markerG.add(ring);
      }
      if (t.label) { const l = k.label(t.label, { px: 40, h: t.radius <= 4 ? 3.2 : 4.4, bg: "rgba(18,110,96,.92)" }); l.position.copy(t.pos).add(new three.Vector3(0, camBelow ? -5 : t.radius <= 4 ? 5 : 9, 0)); markerG.add(l); }
    }
  };

  // ── 연장 이름표·빛 ──
  let hlTools: ToolId[] = [], hlParts: string[] = [];
  const toolLabels = new Map<string, T.Sprite>();
  const labelFor = (key: string, text: string) => {
    let l = toolLabels.get(key);
    if (!l) { l = k.label(text, { px: 40, h: 5.4, bg: "rgba(226,88,46,.94)" }); scene.add(l); toolLabels.set(key, l); }
    return l;
  };
  const syncHighlight = (now: number) => {
    const pulse = 0.3 + 0.25 * Math.sin(now / 200);
    for (const [id, ms] of toolMats) {
      const on = hlTools.includes(id);
      for (const m of ms) { m.emissive.set(on ? "#ff7a3d" : "#000000"); m.emissiveIntensity = on ? pulse : 0; }
    }
    const seen = new Set<string>();
    for (const id of hlTools) {
      const o = TOOLS[id][0]; const key = `tool:${id}`; seen.add(key);
      const l = labelFor(key, handsT > 0.5 && (id === "iron" || id === "solder") ? `${TOOL_NAME[id]} (${id === "iron" ? "오른손" : "왼손"})` : TOOL_NAME[id]);
      o.updateMatrixWorld(); const wp = new three.Vector3(); o.getWorldPosition(wp);
      // 인두·실납은 들고 있을 때 몸 쪽(+y)으로 조금 올라간 곳에 이름을 단다
      const up = new three.Vector3(0, 1, 0).applyQuaternion(o.quaternion);
      l.position.copy(wp).addScaledVector(up, id === "cutter" || id === "stripper" ? 0 : 10).add(new three.Vector3(0, id === "cutter" || id === "stripper" ? 12 : 5, 0));
      l.visible = (!below || id === "iron") && !holding;
    }
    for (const ref of hlParts) {
      const p = parts.get(ref); if (!p || !p.atHome) continue;
      const key = `part:${ref}`; seen.add(key);
      const l = labelFor(key, p.def.label);
      const b = new three.Box3().setFromObject(p.obj); l.position.copy(b.getCenter(new three.Vector3()).setY(b.max.y + 7)); l.visible = !below;
    }
    for (const [key, l] of toolLabels) if (!seen.has(key)) l.visible = false;
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
  // 이번 단계에서 봐야 할 점들: 목표 + 트레이에서 날아올 부품 (+ 양손에 든 연장 끝)
  const stepPoints = () => {
    const pts = curTargets().map((t) => t.pos.clone());
    const s = kit.steps[current];
    (s?.ops ?? []).forEach((op, oi) => {
      if (stage?.kind === "tap" && (oi < stage.from || oi >= stage.to)) return;
      if (stage && stage.kind !== "tap") return;
      const ref = "ref" in op ? op.ref : null;
      const p = op.op === "batteries" ? [...parts.values()].find((x) => x.def.kind === "aa_battery") : ref ? parts.get(ref) : null;
      if (p?.atHome && (op.op === "place" || op.op === "insert" || op.op === "mount_on" || op.op === "batteries" || op.op === "seat")) pts.push(p.home.p.clone());
    });
    return [...pts, ...extraFit()];
  };
  const focusFor = (v: BenchView) => {
    const board = [...parts.values()].find((p) => p.board && p.final);
    // 뒤집힌 보드를 위에서 보면 구리 면(기판 아랫면)이 보이는 면이다
    const lowSide = (v === "bottom") !== (flipT > 0.5 && !!board && rigRefs.has(board.def.ref));
    const local = board?.final ? board.final.p.clone().add(new three.Vector3(0, lowSide ? 0 : board.board!.topY, 0)) : new three.Vector3(0, 0, 0);
    const bc = board && rigRefs.has(board.def.ref) ? W(local) : local;
    // 다리 구부리기: 트레이의 그 부품을 가까이서
    if (stage?.kind === "bend") { const t = curTargets()[0]; if (t) return t.pos.clone(); }
    const pts = stepPoints();
    if (!pts.length) return bc;
    const c = pts.reduce((a, p) => a.add(p), new three.Vector3()).multiplyScalar(1 / pts.length);
    return v === "34" ? c.lerp(bc, 0.25) : c.lerp(bc, 0.35);
  };
  const distFor = (v: BenchView) => {
    // 보이는 띠(카드에 가리지 않는 부분)에 반지름 R이 들어오도록 거리를 잡는다
    const W = el.clientWidth, H = Math.max(1, el.clientHeight);
    const band = Math.max(120, H - insetTop - insetBottom);
    // 눌러야 할 자리(전선 끝·구멍)도 띠 안에 들어오게 함께 잰다
    const pts = v === "34" || v === "front" ? [...stepPoints(), ...curTargets().map((t) => t.pos)] : [...curTargets().filter((t) => t.radius <= 7).map((t) => t.pos), ...extraFit()];
    const c = focusFor(v);
    const spread = pts.length ? Math.max(...pts.map((p) => p.distanceTo(c))) : 0;
    const R = stage?.kind === "bend" ? 30 : v === "34" ? Math.max(70, spread + 44) : v === "front" ? Math.max(55, spread + 25) : Math.max([...parts.values()].some((p) => p.def.kind === "perfboard" || p.def.kind === "sensor_module") ? 19 : 38, spread + 13);
    const vh = Math.tan((camera.fov * Math.PI) / 360) * (band / H);
    const hh = Math.tan((camera.fov * Math.PI) / 360) * (Math.max(120, W - insetLeft - insetRight) / H);
    return R / Math.min(vh, hh);
  };
  const applyInsets = () => {
    const W = el.clientWidth, H = el.clientHeight; if (!W || !H) return;
    camera.setViewOffset(W, H, (insetRight - insetLeft) / 2, (insetBottom - insetTop) / 2, W, H);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  };
  // 실제로 화면에 비춰 보고, 눌러야 할 자리가 하나라도 카드·알약 밑이면 조금씩 물러난다 (폰 배치 점검에서 찾은 문제)
  const probeCam = new three.PerspectiveCamera();
  const fitDist = (v: BenchView, tgt: T.Vector3) => {
    let d = distFor(v);
    const W = el.clientWidth, H = el.clientHeight; if (!W || !H) return d;
    const pts = [...curTargets().map((t) => ({ p: t.pos, r: t.radius })), ...extraFit().map((p) => ({ p, r: 0 })), ...(v === "34" || v === "front" ? stepPoints().map((p) => ({ p, r: 0 })) : [])];
    if (!pts.length) return d;
    const right = new three.Vector3(), tmp = new three.Vector3(), edge = new three.Vector3();
    for (let i = 0; i < 8; i++) {
      probeCam.copy(camera); probeCam.position.copy(tgt).addScaledVector(DIR[v], d); probeCam.lookAt(tgt); probeCam.updateMatrixWorld(); probeCam.updateProjectionMatrix();
      right.setFromMatrixColumn(probeCam.matrixWorld, 0);
      const ok = pts.every(({ p, r }) => {
        tmp.copy(p).project(probeCam); edge.copy(p).addScaledVector(right, Math.max(r, 1.5)).project(probeCam);
        const x = (tmp.x + 1) / 2 * W, y = (1 - tmp.y) / 2 * H, rp = Math.min(40, Math.abs(edge.x - tmp.x) / 2 * W) + 6;
        return y - rp >= insetTop && y + rp <= H - insetBottom && x - rp >= insetLeft && x + rp <= W - insetRight;
      });
      if (ok) break;
      d *= 1.12;
    }
    return d;
  };
  let view: BenchView = "34";
  let peekTimer = 0;
  const setView = (v: BenchView, instant = false) => {
    view = v; clearTimeout(peekTimer);
    const tgt = focusFor(v), pos = tgt.clone().add(DIR[v].clone().multiplyScalar(fitDist(v, tgt)));
    opts.cb.onView?.(v);
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
    if (busy || tweens.length) return;
    const hits = ray.intersectObjects(scene.children, true).filter((h) => h.object.visible && !(h.object as T.Sprite).isSprite && h.object !== desk);
    const hit = hits[0];
    const s = kit.steps[current];
    if (!s || (progress[current] > 0 && !stage)) { if (hit) { const ref = refOf(hit.object); if (ref) opts.cb.onPart(ref); } return; }
    const tip = stageHint ?? s.tapHint;
    // 목표 근처를 눌렀는가
    let best: Target | null = null, bd = Infinity;
    for (const t of targets) {
      const d = hit ? hit.point.distanceTo(t.pos) : ray.ray.distanceToPoint(t.pos);
      const rd = ray.ray.distanceToPoint(t.pos);
      const dd = Math.min(d, rd);
      if (dd < t.radius * (challenge ? 1.0 : 1.6) && dd < bd) { bd = dd; best = t; }
      if (t.part && hit && refOf(hit.object) === t.part) { best = t; bd = 0; }
    }
    if (best && stage?.kind !== "hold") { opts.cb.onTarget(true); return; }
    if (!hit) return;
    const ref = refOf(hit.object);
    const p = ref ? parts.get(ref) : null;
    if (p?.board && p.final) {
      const local = (rigRefs.has(p.def.ref) ? toBoard(hit.point) : hit.point.clone()).applyMatrix4(poseMatrix(p.final).invert());
      const name = p.board.nearest(local);
      opts.cb.onTarget(false, name ? `거긴 ${name}예요. ${tip}` : tip);
      return;
    }
    if (ref && p?.atHome) { opts.cb.onPart(ref); if (challenge) opts.cb.onTarget(false, `${p.def.label}는 트레이에 있어요. ${tip}`); return; }
    if (challenge) opts.cb.onTarget(false, tip);
  };
  const refOf = (o: T.Object3D | null): string | null => {
    while (o) { for (const p of parts.values()) if (p.obj === o) return p.def.ref; o = o.parent; }
    return null;
  };
  // 꾹 누르기: 납땜 자리 가까이를 누르면 카메라 돌리기 대신 납땜을 시작한다 (터치·마우스 같이)
  const onHoldDown = (e: PointerEvent) => {
    if (stage?.kind !== "hold" || busy || holding || tweens.length || anim) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const r = renderer.domElement.getBoundingClientRect();
    let best: { key: string; x: number; y: number } | null = null, bd = Infinity;
    for (const key of stage.keys) {
      if (holdGrades.get(key) === "good") continue;
      const w = holdWorld(key); if (!w) continue;
      const sp = w.project(camera); if (sp.z > 1) continue;
      const x = r.left + ((sp.x + 1) / 2) * r.width, y = r.top + ((1 - sp.y) / 2) * r.height;
      const d = Math.hypot(x - e.clientX, y - e.clientY);
      if (d < bd) { bd = d; best = { key, x, y }; }
    }
    if (!best || bd > 38) return;
    e.stopPropagation(); e.preventDefault();
    // 눌린·뗀 시각은 이벤트 시각으로 잰다 (화면이 버벅여 처리가 늦어도 판정이 밀리지 않게)
    holding = { key: best.key, start: e.timeStamp || performance.now(), id: e.pointerId };
    controls.enabled = false;
    opts.cb.onHold?.({ type: "start", key: best.key, label: holdLabel(best.key), x: best.x, y: best.y });
  };
  const onHoldUp = (e: PointerEvent) => { if (holding && e.pointerId === holding.id) endHold(e.timeStamp || performance.now()); };
  const noMenu = (e: Event) => e.preventDefault();
  el.addEventListener("pointerdown", onHoldDown, { capture: true });
  window.addEventListener("pointerup", onHoldUp);
  window.addEventListener("pointercancel", onHoldUp);
  el.addEventListener("contextmenu", noMenu);
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);

  // ── 진행 ──
  let busy = false;
  let anim: { from: number; to: number; dur: number; start: number; done: () => void } | null = null;
  type Tween = { start: number; dur: number; fn: (u: number) => void; done: () => void; p: Promise<void> };
  let tweens: Tween[] = [];
  const tween = (dur: number, fn: (u: number) => void) => {
    let done = () => {};
    const p = new Promise<void>((res) => { done = res; });
    tweens.push({ start: performance.now(), dur: Math.max(1, dur), fn, done, p });
    return p;
  };
  const waitTweens = () => Promise.all(tweens.map((t) => t.p)).then(() => {});
  const settle = () => { applyAll(); buildMarkers(); setView(viewFor(current)); };
  const flipTo = async (on: boolean) => {
    if (!boardPart) return;
    flipped = on; markerG.clear(); targets = [];
    const from = flipT, to = on ? 1 : 0;
    if (from !== to) await tween(1150 * Math.abs(to - from), (u) => { setFlip(from + (to - from) * u); applyAll(); });
    settle();
  };
  const stepTotal = (si: number) => (kit.steps[si]?.ops ?? []).reduce((a, o) => a + opSeconds(o), 0);
  const opFrac = (si: number, i: number) => { const s = kit.steps[si]; if (!s) return 1; let acc = 0; for (let j = 0; j < Math.min(i, s.ops.length); j++) acc += opSeconds(s.ops[j]); return i >= s.ops.length ? 1 : acc / stepTotal(si); };
  const runTo = (to: number) => new Promise<void>((resolve) => {
    const s = kit.steps[current]; if (!s || busy) { resolve(); return; }
    busy = true; mistakeKind = null; markerG.clear(); if (ghost) { scene.remove(ghost); ghost = null; }
    const from = progress[current];
    anim = { from, to, dur: Math.max(200, (to - from) * stepTotal(current) * 1000), start: performance.now(), done: () => { busy = false; resolve(); } };
  });
  const goto = (i: number) => {
    anim = null; busy = false;
    for (const t of tweens) { t.fn(1); t.done(); }
    tweens = [];
    holding = null; controls.enabled = true; holdGrades.clear(); stage = null; stageHint = null; bendOverride.clear();
    current = clamp(i, 0, kit.steps.length);
    for (let j = 0; j < progress.length; j++) progress[j] = j < current ? 1 : 0;
    mistakeKind = null;
    const s = kit.steps[current];
    if (!s || !s.ops.some((o) => o.op === "solder" || o.op === "bridge")) { handsReady = false; handsT = 0; }
    if (flipped && !(s && stepNeedsFlip(s, canFlip))) void flipTo(false);
    applyAll(); buildMarkers();
    setView(viewFor(current));
  };
  const play = async () => {
    const s = kit.steps[current]; if (!s || busy) return;
    stage = null; stageHint = null; holding = null; holdGrades.clear();
    if (boardPart && stepNeedsFlip(s, canFlip) && !flipped) await flipTo(true);
    else await waitTweens();
    await runTo(1);
  };

  // ── 렌더 루프 ──
  let raf = 0, last = performance.now(), fpsAcc = 0, fpsN = 0, disposed = false;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (document.hidden) return;
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    fpsAcc += dt; fpsN++; if (fpsAcc > 2) { opts.cb.onFps?.(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    if (tweens.length) {
      for (const t of [...tweens]) { const u = clamp((now - t.start) / t.dur); t.fn(u); if (u >= 1) { tweens = tweens.filter((x) => x !== t); t.done(); } }
    }
    if (anim) {
      const u = clamp((now - anim.start) / anim.dur);
      progress[current] = anim.from + (anim.to - anim.from) * u;
      applyAll();
      if (u >= 1) { const d = anim.done; anim = null; d(); }
    }
    holdLive(now);
    if (camT < 1 && camFrom && camTo) {
      camT = Math.min(1, (now - camStart) / 750); const e = smooth(camT);
      camera.position.copy(camFrom.p).lerp(camTo.p, e); controls.target.copy(camFrom.t).lerp(camTo.t, e);
    }
    controls.update();
    const nb = camera.position.y < controls.target.y - 2 && camera.position.y < 10;
    if (nb !== below) { below = nb; syncGroundVisibility(); }
    syncHighlight(now);
    // 마커 맥박 (직접 하기의 구부리기·뒤집기·꾹 누르기 자리는 늘 보인다)
    const pulse = 1 + 0.18 * Math.sin(now / 180);
    const showM = showMarkers && (!challenge || now < hintUntil || (!!stage && stage.kind !== "tap"));
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
  // 점검용 (?benchdebug): 지금 눌러야 할 자리의 화면 좌표
  if (/[?&]benchdebug\b/.test(location.search)) {
    (window as unknown as { __bench?: unknown }).__bench = {
      targets: () => { const r = renderer.domElement.getBoundingClientRect(); return curTargets().map((t) => { const sp = t.pos.clone().project(camera); return { x: r.left + ((sp.x + 1) / 2) * r.width, y: r.top + ((1 - sp.y) / 2) * r.height, label: t.label ?? t.part ?? "" }; }); },
      state: () => ({ stage, flipped, flipT, handsT, current, busy, tweens: tweens.length })
    };
  }

  return {
    goto, play,
    setView: (v) => setView(v),
    setChallenge: (on) => { challenge = on; },
    hint: () => { hintUntil = performance.now() + 2600; setView(viewFor(current)); },
    mistake: (kind) => { mistakeKind = kind; applyAll(); if (kind) { markerG.visible = false; } else buildMarkers(); },
    setInsets: (top, bottom, left = 0, right = 0) => { const changed = Math.abs(top - insetTop) + Math.abs(bottom - insetBottom) + Math.abs(left - insetLeft) + Math.abs(right - insetRight) > 4; insetTop = top; insetBottom = bottom; insetLeft = left; insetRight = right; applyInsets(); if (changed) setView(view); },
    setLight: (on) => { light = on; renderer.setPixelRatio(on ? 1 : Math.min(2, window.devicePixelRatio)); syncGroundVisibility(); },
    state: () => ({ flipped, hands: handsReady, canFlip: !!boardPart }),
    setStage: (st, hint) => {
      const prevOp = stage?.kind === "hold" ? stage.op : -1;
      if (st?.kind !== "hold" || st.op !== prevOp) holdGrades.clear();
      if (holding) { holding = null; controls.enabled = true; }
      stage = st; stageHint = hint ?? null;
      applyAll(); buildMarkers(); setView(viewFor(current));
    },
    flip: () => flipTo(true),
    ready: async () => {
      handsReady = true; markerG.clear();
      const from = handsT;
      if (from < 1) await tween(750 * (1 - from), (u) => { handsT = from + (1 - from) * u; applyAll(); });
      settle();
    },
    bend: async (ref) => {
      markerG.clear();
      await tween(700, (u) => { bendOverride.set(ref, u); applyAll(); });
      settle();
    },
    playOps: (from, to) => { void from; return runTo(Math.max(progress[current], opFrac(current, to))); },
    finishOp: (i) => { progress[current] = Math.max(progress[current], opFrac(current, i + 1)); holdGrades.clear(); holding = null; controls.enabled = true; applyAll(); },
    setHighlight: (tools, ps) => { hlTools = tools; hlParts = ps; },
    peek: (tool) => {
      const o = TOOLS[tool]?.[0]; if (!o) return;
      const wp = new three.Vector3(); o.getWorldPosition(wp);
      camFrom = { p: camera.position.clone(), t: controls.target.clone() }; camTo = { p: wp.clone().addScaledVector(DIR["34"], 210), t: wp }; camT = 0; camStart = performance.now();
      clearTimeout(peekTimer); peekTimer = window.setTimeout(() => setView(view), 2600);
    },
    dispose: () => {
      if (disposed) return; disposed = true;
      cancelAnimationFrame(raf); ro.disconnect(); clearTimeout(peekTimer);
      renderer.domElement.removeEventListener("pointerdown", onDown); renderer.domElement.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerdown", onHoldDown, { capture: true }); el.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("pointerup", onHoldUp); window.removeEventListener("pointercancel", onHoldUp);
      controls.dispose();
      scene.traverse((o) => { const m = o as T.Mesh; if (m.isMesh) { m.geometry.dispose(); } });
      pmrem.dispose(); renderer.dispose(); renderer.domElement.remove();
    }
  };
}
