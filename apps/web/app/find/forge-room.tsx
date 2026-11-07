"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type * as T from "three";

// 대장간 안 (3D). 동물의 숲의 '내 집'처럼, 아이디어를 쌓을수록 방이 변한다.
//  - 방 크기·구조: 가장 많이 자란 도깨비불의 단계 (불씨 = 작은 방 / 타오름 = 창문 둘·러그·매단 등 / 활활 = 넓은 방·다락·풀무)
//  - 선반: 도깨비불 하나 = 빛나는 유리병 하나 (선반 칸은 병 수만큼 늘어난다)
//  - 작업대: 메모 쪽지(불씨) → 펼친 설계도(타오름) → 부품 상자 + 깜빡이는 시제품(활활)
//  - 공구 걸이: 지금까지 채운 장작 갈래마다 공구 하나 (감지 = 돋보기, 반응 = 종, 형태 = 자, 누구 = 액자)
//  - 화로: 불 크기 = 화력 + 받은 장작, 불 색 = 가장 최근 도깨비불 색. 옆에 장작더미(받은 장작 수만큼)
//  - 진열대: '나도 갖고 싶어'가 쌓이면 리본 → 트로피
//  - 우체통: 놀러 온 도깨비가 남긴 말만큼 편지가 꽂힌다 · 벽 액자 = 이웃 수
//  벽·바닥 재료는 이 집이 있는 마을을 따른다.

export type RoomObj = "hearth" | "blueprint" | "shelf" | "invention" | "mailbox" | "woodpile" | "tools" | "display";
export type RoomFire = { id: string; color: string; stage: 1 | 2 | 3; cats: string[] };
type Props = {
  village: string;
  fires: RoomFire[];
  peak: number;
  fuel: number;
  wants: number;
  notes: number;
  neighbors: number;
  onPick: (o: RoomObj) => void;
  fallback: ReactNode;
};

const STYLE: Record<string, { wall: string; wall2: string; floor: string; floor2: string; trim: string; rug: string; pattern: "beam" | "brick" | "stone" | "stripe" | "tile" }> = {
  kkomul: { wall: "#F4ECDA", wall2: "#E9DFC8", floor: "#D9B98C", floor2: "#CDA977", trim: "#B08458", rug: "#8FB79A", pattern: "beam" },
  ttukttak: { wall: "#C0634A", wall2: "#A9533D", floor: "#8B6A4A", floor2: "#7A5C3F", trim: "#C9A24A", rug: "#C9A24A", pattern: "brick" },
  jjaekkak: { wall: "#A3ACB8", wall2: "#8E98A5", floor: "#5A4636", floor2: "#4D3B2D", trim: "#34446E", rug: "#34446E", pattern: "stone" },
  wagle: { wall: "#FFE39A", wall2: "#FF8C7A", floor: "#FFF4DE", floor2: "#FF8C7A", trim: "#6FC3E8", rug: "#6FC3E8", pattern: "stripe" },
  kkambbak: { wall: "#ECEEF0", wall2: "#D9DDE1", floor: "#7FD3CB", floor2: "#6CC0B8", trim: "#C27C4E", rug: "#B9A3E3", pattern: "tile" }
};
const LABEL: Record<RoomObj, string> = { hearth: "화로", blueprint: "설계도", shelf: "도깨비불 선반", invention: "작업대", mailbox: "우체통", woodpile: "장작더미", tools: "공구 걸이", display: "진열대" };

export default function ForgeRoom({ village, fires, peak, fuel, wants, notes, neighbors, onPick, fallback }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false, raf = 0, cleanup = () => {};
    (async () => {
      const three = await import("three");
      if ("fonts" in document) await document.fonts.load("40px Jua").catch(() => {});
      if (disposed || !mount.current) return;
      let renderer: T.WebGLRenderer;
      try { renderer = new three.WebGLRenderer({ antialias: true, alpha: true }); } catch { setFailed(true); return; }
      const el = mount.current;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.outputColorSpace = three.SRGBColorSpace;
      el.appendChild(renderer.domElement);
      const scene = new three.Scene();
      const st = STYLE[village] ?? STYLE.kkomul;
      const stage = fires.reduce((m, f) => Math.max(m, f.stage), 1) as 1 | 2 | 3;
      const W = [6, 7.4, 9][stage - 1], D = [5, 6, 7][stage - 1], H = 3.4;
      const latest = fires[0]?.color ?? "#FF8F3F";
      const anim: Array<(t: number) => void> = [];
      const pickables: T.Object3D[] = [];

      scene.add(new three.HemisphereLight("#fffaf0", "#b9a58a", 1.0));
      const sun = new three.DirectionalLight("#fff3dd", 0.9); sun.position.set(4, 8, 6); scene.add(sun);

      const mats = new Map<string, T.Material>();
      const mat = (c: string, o: { e?: string; ei?: number; op?: number } = {}) => {
        const k = JSON.stringify([c, o]);
        let m = mats.get(k);
        if (!m) { m = new three.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true, emissive: o.e ?? "#000", emissiveIntensity: o.ei ?? 0, transparent: o.op !== undefined, opacity: o.op ?? 1 }); mats.set(k, m); }
        return m;
      };
      const BOX = new three.BoxGeometry(1, 1, 1), CYL = new three.CylinderGeometry(1, 1, 1, 12), BALL = new three.IcosahedronGeometry(1, 1), CONE4 = new three.ConeGeometry(1, 1, 4), TORUS = new three.TorusGeometry(1, 0.15, 6, 16);
      CONE4.rotateY(Math.PI / 4);
      const part = (g: T.BufferGeometry, m: T.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, parent: T.Object3D = scene) => {
        const mesh = new three.Mesh(g, m); mesh.scale.set(sx, sy, sz); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
      };
      const group = (obj: RoomObj | null, x: number, y: number, z: number, ry = 0) => {
        const g = new three.Group(); g.position.set(x, y, z); g.rotation.y = ry; scene.add(g);
        if (obj) { g.userData.obj = obj; pickables.push(g); }
        return g;
      };
      const label = (text: string, x: number, y: number, z: number) => {
        const c = document.createElement("canvas"); const ctx = c.getContext("2d")!;
        ctx.font = "34px Jua, sans-serif"; c.width = Math.ceil(ctx.measureText(text).width) + 30; c.height = 54;
        ctx.font = "34px Jua, sans-serif"; ctx.fillStyle = "rgba(30,31,36,.82)"; ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, 27); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, c.width / 2, c.height / 2 + 2);
        const tex = new three.CanvasTexture(c); tex.colorSpace = three.SRGBColorSpace;
        const s = new three.Sprite(new three.SpriteMaterial({ map: tex, depthTest: false })); s.scale.set((c.width / c.height) * 0.32, 0.32, 1); s.position.set(x, y, z); s.renderOrder = 10; scene.add(s);
      };

      // ── 벽·바닥 무늬 (마을 재료) ──
      const patternTex = (kind: string, a: string, b: string, w: number, h: number) => {
        const c = document.createElement("canvas"); c.width = 256; c.height = 256; const x = c.getContext("2d")!;
        x.fillStyle = a; x.fillRect(0, 0, 256, 256); x.strokeStyle = b; x.fillStyle = b;
        if (kind === "brick") { x.lineWidth = 4; for (let r = 0; r < 8; r++) { x.beginPath(); x.moveTo(0, r * 32); x.lineTo(256, r * 32); x.stroke(); for (let k = 0; k < 4; k++) { const bx = k * 64 + (r % 2) * 32; x.beginPath(); x.moveTo(bx, r * 32); x.lineTo(bx, r * 32 + 32); x.stroke(); } } }
        else if (kind === "stone") { x.lineWidth = 3; for (let r = 0; r < 4; r++) { x.beginPath(); x.moveTo(0, r * 64); x.lineTo(256, r * 64); x.stroke(); for (let k = 0; k < 3; k++) { const bx = k * 96 + (r % 2) * 48; x.beginPath(); x.moveTo(bx, r * 64); x.lineTo(bx, r * 64 + 64); x.stroke(); } } }
        else if (kind === "beam") { for (let k = 0; k < 2; k++) x.fillRect(k * 128 + 54, 0, 20, 256); }
        else if (kind === "stripe") { for (let k = 0; k < 4; k++) x.fillRect(k * 64, 0, 26, 256); }
        else if (kind === "tile") { x.lineWidth = 3; for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(k * 64, 0); x.lineTo(k * 64, 256); x.stroke(); x.beginPath(); x.moveTo(0, k * 64); x.lineTo(256, k * 64); x.stroke(); } }
        else if (kind === "plank") { x.lineWidth = 3; for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(0, k * 64); x.lineTo(256, k * 64); x.stroke(); } }
        else if (kind === "checker") { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) x.fillRect(i * 64, j * 64, 64, 64); }
        const t = new three.CanvasTexture(c); t.colorSpace = three.SRGBColorSpace; t.wrapS = t.wrapT = three.RepeatWrapping; t.repeat.set(w / 2.4, h / 2.4); return t;
      };
      const floorKind = village === "wagle" ? "checker" : village === "kkambbak" ? "tile" : "plank";
      const floor = new three.Mesh(new three.BoxGeometry(W, 0.2, D), new three.MeshStandardMaterial({ map: patternTex(floorKind, st.floor, st.floor2, W, D), roughness: 0.9 }));
      floor.position.set(0, -0.1, 0); scene.add(floor);
      const wallMat = new three.MeshStandardMaterial({ map: patternTex(st.pattern, st.wall, st.wall2, W, H), roughness: 0.95 });
      const wallMatL = new three.MeshStandardMaterial({ map: patternTex(st.pattern, st.wall, st.wall2, D, H), roughness: 0.95 });
      part(BOX, wallMat, W, H, 0.2, 0, H / 2, -D / 2 - 0.1);
      part(BOX, wallMatL, 0.2, H, D, -W / 2 - 0.1, H / 2, 0);
      part(BOX, mat(st.trim), W, 0.16, 0.24, 0, 0.08, -D / 2 + 0.02); part(BOX, mat(st.trim), 0.24, 0.16, D, -W / 2 + 0.02, 0.08, 0);
      part(BOX, mat(st.trim), W + 0.2, 0.22, 0.3, 0, H, -D / 2); part(BOX, mat(st.trim), 0.3, 0.22, D + 0.2, -W / 2, H, 0);

      // 창문 (단계가 오를수록 늘어남)
      const win = (x: number, y: number, z: number, ry: number, round = village === "kkambbak") => {
        const g = group(null, x, y, z, ry);
        if (round) { const f = part(CYL, mat(st.trim), 0.62, 0.1, 0.62, 0, 0, 0, g); f.rotation.x = Math.PI / 2; const p = part(CYL, mat("#CDEFF6", { e: "#BDE7F2", ei: 0.4 }), 0.52, 0.12, 0.52, 0, 0, 0.02, g); p.rotation.x = Math.PI / 2; }
        else { part(BOX, mat(st.trim), 1.2, 1.0, 0.1, 0, 0, 0, g); part(BOX, mat("#CDEFF6", { e: "#BDE7F2", ei: 0.4 }), 1.0, 0.8, 0.12, 0, 0, 0.01, g); part(BOX, mat(st.trim), 0.05, 0.8, 0.14, 0, 0, 0.02, g); part(BOX, mat(st.trim), 1.0, 0.05, 0.14, 0, 0, 0.02, g); }
      };
      win(stage >= 3 ? -1.0 : -0.1, 2.15, -D / 2 + 0.02, 0);
      if (stage >= 2) win(-W / 2 + 0.02, 2.15, D / 2 - 0.65, Math.PI / 2);

      // ── 화로 + 장작더미 + 모루 ──
      const hx = -W / 2 + 1.4, hz = -D / 2 + 1.0;
      const hearth = group("hearth", hx, 0, hz);
      part(BOX, mat("#8E8A84"), 1.7, 0.7, 1.3, 0, 0.35, 0, hearth);
      part(BOX, mat("#3B3633"), 1.2, 0.5, 0.9, 0, 0.62, 0.05, hearth);
      const hood = part(CONE4, mat("#6E6A66"), 1.25, 1.1, 1.0, 0, 1.75, -0.05, hearth); hood.scale.z = 0.95;
      part(BOX, mat("#6E6A66"), 0.5, H, 0.5, 0, 1.75 + H / 2, -0.15, hearth);
      const heat = Math.min(1.6, 0.6 + (peak / 100) * 0.6 + fuel * 0.04);
      const flames = [0, 1, 2].map((i) => part(new three.ConeGeometry(0.22, 0.7, 6), mat(i === 1 ? "#FFD27A" : latest, { e: i === 1 ? "#FFB84D" : latest, ei: 1 }), heat, heat, heat, (i - 1) * 0.28, 0.95, 0.1, hearth));
      const glow = new three.PointLight(latest, 2.2, 6, 1.6); glow.position.set(hx, 1.3, hz + 0.6); scene.add(glow);
      anim.push((t) => { flames.forEach((f, i) => { f.scale.y = heat * (1 + Math.sin(t * 9 + i * 2) * 0.18); }); glow.intensity = 2 + Math.sin(t * 11) * 0.4 + Math.sin(t * 7.3) * 0.3; });
      label(LABEL.hearth, hx, 2.6, hz);
      if (stage >= 3) { const b = part(BOX, mat("#8B6A4A"), 0.7, 0.2, 0.45, 1.2, 0.5, 0.2, hearth); b.rotation.z = 0.3; part(BOX, mat("#C9A24A"), 0.12, 0.12, 0.5, 1.55, 0.6, 0.2, hearth); }

      const wood = group("woodpile", hx + 1.5, 0, hz + 0.1);
      const logs = Math.min(18, fuel);
      for (let i = 0, row = 0, inRow = 0; i < logs; i++) {
        const per = 5 - row; const x = (inRow - (per - 1) / 2) * 0.24; const l = part(CYL, mat(i % 3 ? "#A0744B" : "#8B6A4A"), 0.11, 0.7, 0.11, x, 0.11 + row * 0.2, 0, wood); l.rotation.x = Math.PI / 2;
        if (++inRow >= per) { inRow = 0; row++; }
      }
      if (logs === 0) part(BOX, mat("#C9B79C"), 0.8, 0.05, 0.6, 0, 0.03, 0, wood);
      label(`${LABEL.woodpile} ${fuel}`, hx + 1.6, 0.95, hz + 0.6);

      const anvil = group(null, hx + 0.6, 0, hz + 1.6);
      part(BOX, mat("#5A4636"), 0.5, 0.5, 0.5, 0, 0.25, 0, anvil);
      part(BOX, mat("#4A4E55"), 0.8 + stage * 0.08, 0.25, 0.4, 0, 0.62, 0, anvil);
      const horn = part(new three.ConeGeometry(0.18, 0.45, 8), mat("#4A4E55"), 1, 1, 1, 0.6 + stage * 0.04, 0.62, 0, anvil); horn.rotation.z = -Math.PI / 2;

      // ── 도깨비불 선반 (왼쪽 벽) ──
      const SZ = 0.2;
      const shelf = group("shelf", -W / 2 + 0.3, 0, SZ);
      const shown = fires.slice(0, stage >= 3 ? 16 : 12);
      const boards = Math.max(1, Math.min(stage >= 3 ? 4 : 3, Math.ceil(shown.length / 4)));
      const sw = 2.2;
      part(BOX, mat(st.trim), 0.35, 0.6 + boards * 0.62, 0.08, 0, (0.6 + boards * 0.62) / 2, -sw / 2, shelf);
      part(BOX, mat(st.trim), 0.35, 0.6 + boards * 0.62, 0.08, 0, (0.6 + boards * 0.62) / 2, sw / 2, shelf);
      for (let b = 0; b < boards; b++) part(BOX, mat(st.trim), 0.38, 0.07, sw, 0, 0.7 + b * 0.62, 0, shelf);
      shown.forEach((f, i) => {
        const b = Math.floor(i / 4), k = i % 4;
        const jar = new three.Group(); jar.position.set(0.02, 0.74 + b * 0.62, -0.78 + k * 0.52); shelf.add(jar);
        part(CYL, mat("#E8F4F6", { op: 0.35 }), 0.14, 0.34, 0.14, 0, 0.17, 0, jar);
        part(CYL, mat("#8B6A4A"), 0.1, 0.05, 0.1, 0, 0.36, 0, jar);
        const orb = part(BALL, mat(f.color, { e: f.color, ei: 1 }), 0.08, 0.1, 0.08, 0, 0.16, 0, jar);
        anim.push((t) => { orb.scale.setScalar(0.075 + Math.sin(t * 3 + i) * 0.015); });
      });
      if (fires.length === 0) part(BOX, mat("#FFFFFF"), 0.02, 0.18, 0.3, 0.2, 0.84, 0, shelf);
      if (fires.length > shown.length) label(`+${fires.length - shown.length}`, -W / 2 + 0.45, 0.75 + boards * 0.62, SZ + 0.9);
      label(`${LABEL.shelf} ${fires.length}`, -W / 2 + 0.5, 1.0 + boards * 0.62, SZ);

      // 이웃 액자 (왼쪽 벽 위)
      for (let i = 0; i < Math.min(4, neighbors); i++) { const f = group(null, -W / 2 + 0.03, 2.95, SZ - 0.9 + i * 0.6, Math.PI / 2); part(BOX, mat(st.trim), 0.4, 0.5, 0.05, 0, 0, 0, f); part(BOX, mat(["#F2A3B3", "#9ED3CB", "#FFD27A", "#B9A3E3"][i]), 0.3, 0.38, 0.06, 0, 0, 0.01, f); }

      // ── 설계도 벽 (뒷벽 오른쪽) + 공구 걸이 ──
      const BX = W / 2 - 1.35;
      const LX = W / 2 - W * 0.25;
      const bp = group("blueprint", BX, stage >= 3 ? 0.72 : 1.0, -D / 2 + 0.05);
      const pinned = Math.max(1, Math.min(6, fires.length));
      for (let i = 0; i < pinned; i++) { const p = part(BOX, mat(i % 2 ? "#FFFFFF" : "#F6EEDC"), 0.36, 0.44, 0.02, -0.75 + (i % 2) * 0.45, 0.4 + Math.floor(i / 2) * 0.52, 0.02, bp); p.rotation.z = (i % 2 ? 1 : -1) * 0.06; part(BALL, mat("#E2574C"), 0.04, 0.04, 0.04, p.position.x, p.position.y + 0.2, 0.05, bp); }
      if (stage >= 2) {
        const c = document.createElement("canvas"); c.width = 256; c.height = 200; const x = c.getContext("2d")!;
        x.fillStyle = "#3D6FB6"; x.fillRect(0, 0, 256, 200); x.strokeStyle = "rgba(255,255,255,.85)"; x.lineWidth = 4;
        x.strokeRect(30, 30, 110, 80); x.beginPath(); x.arc(190, 70, 30, 0, 6.28); x.stroke(); x.beginPath(); x.moveTo(140, 70); x.lineTo(160, 70); x.moveTo(85, 110); x.lineTo(85, 160); x.lineTo(200, 160); x.lineTo(200, 100); x.stroke();
        const tex = new three.CanvasTexture(c); tex.colorSpace = three.SRGBColorSpace;
        const sheet = new three.Mesh(new three.PlaneGeometry(0.95, 0.75), new three.MeshBasicMaterial({ map: tex })); sheet.position.set(0.5, 0.95, 0.03); bp.add(sheet);
      }
      label(LABEL.blueprint, BX - 0.5, stage >= 3 ? 1.0 : 2.75, -D / 2 + 0.4);

      const cats = new Set(fires.flatMap((f) => f.cats));
      if (cats.size) {
        const tools = stage >= 3 ? group("tools", LX, 2.45, -D / 2 + 1.42) : group("tools", BX, 2.72, -D / 2 + 0.06);
        part(BOX, mat(st.trim), 1.5, 0.12, 0.08, 0, 0.5, 0, tools);
        let i = 0;
        if (cats.has("감지")) { const g = new three.Group(); g.position.set(-0.55 + i++ * 0.37, 0.15, 0.06); tools.add(g); const r = part(TORUS, mat("#C9A24A"), 0.13, 0.13, 0.13, 0, 0.1, 0, g); void r; part(BOX, mat("#5A4636"), 0.05, 0.25, 0.05, 0, -0.12, 0, g); }
        if (cats.has("반응")) { const g = new three.Group(); g.position.set(-0.55 + i++ * 0.37, 0.15, 0.06); tools.add(g); part(new three.ConeGeometry(0.13, 0.22, 10), mat("#E8C25A"), 1, 1, 1, 0, 0.05, 0, g); part(BALL, mat("#8B6A4A"), 0.04, 0.04, 0.04, 0, -0.08, 0, g); }
        if (cats.has("형태")) { const g = new three.Group(); g.position.set(-0.55 + i++ * 0.37, 0.1, 0.06); tools.add(g); part(BOX, mat("#F2C14E"), 0.06, 0.5, 0.02, 0, 0, 0, g); part(BOX, mat("#F2C14E"), 0.25, 0.06, 0.02, 0.1, -0.22, 0, g); }
        if (cats.has("누구")) { const g = new three.Group(); g.position.set(-0.55 + i++ * 0.37, 0.12, 0.06); tools.add(g); part(BOX, mat(st.trim), 0.26, 0.3, 0.03, 0, 0, 0, g); part(BALL, mat("#E2574C"), 0.06, 0.06, 0.02, 0, 0, 0.02, g); }
        if (stage >= 3) label(LABEL.tools, LX + 1.1, 3.2, -D / 2 + 1.4); else label(LABEL.tools, BX - 0.2, 3.1, -D / 2 + 0.3);
      }

      // ── 작업대 (발명품) ──
      const bench = group("invention", W * 0.2, 0, D * 0.12);
      part(BOX, mat(st.trim), 1.9, 0.12, 0.9, 0, 0.82, 0, bench);
      for (const [lx, lz] of [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]]) part(BOX, mat(st.trim), 0.1, 0.82, 0.1, lx, 0.41, lz, bench);
      if (stage === 1) {
        for (let i = 0; i < 3; i++) { const p = part(BOX, mat("#FFFFFF"), 0.3, 0.02, 0.22, -0.4 + i * 0.35, 0.9, (i % 2) * 0.15 - 0.05, bench); p.rotation.y = i * 0.5; }
        const pen = part(CYL, mat("#F2C14E"), 0.02, 0.35, 0.02, 0.5, 0.9, 0.2, bench); pen.rotation.z = Math.PI / 2; pen.rotation.y = 0.4;
      } else {
        const sh = part(BOX, mat("#3D6FB6"), 1.0, 0.02, 0.6, -0.3, 0.9, 0, bench); sh.rotation.y = 0.08;
        const roll = part(CYL, mat("#3D6FB6"), 0.06, 0.6, 0.06, 0.3, 0.94, 0, bench); roll.rotation.x = Math.PI / 2;
        part(BOX, mat("#F2C14E"), 0.6, 0.02, 0.06, -0.3, 0.92, 0.25, bench);
      }
      if (stage >= 3) {
        part(BOX, mat("#8B6A4A"), 0.5, 0.25, 0.35, 0.55, 1.0, -0.2, bench);
        ["#E2574C", "#3FBF6E", "#6FC3E8", "#F2C14E"].forEach((c, i) => part(BOX, mat(c), 0.08, 0.08, 0.08, 0.42 + (i % 2) * 0.14, 1.15, -0.27 + Math.floor(i / 2) * 0.14, bench));
        const proto = new three.Group(); proto.position.set(0.5, 0.88, 0.22); bench.add(proto);
        part(BOX, mat("#F6F5F1"), 0.4, 0.25, 0.3, 0, 0.13, 0, proto);
        const led = part(BALL, mat(latest, { e: latest, ei: 1.2 }), 0.06, 0.06, 0.06, 0.1, 0.28, 0.1, proto);
        part(CYL, mat("#555"), 0.01, 0.3, 0.01, -0.12, 0.4, 0, proto);
        anim.push((t) => { led.visible = (t * 1.5) % 1 < 0.6; });
      }
      label(LABEL.invention, W * 0.2, 1.75, D * 0.12);

      // ── 진열대 ('나도 갖고 싶어') ──
      if (wants > 0) {
        const d = group("display", W * 0.4, 0, -D / 2 + 1.3);
        part(CYL, mat(st.trim), 0.3, 0.9, 0.3, 0, 0.45, 0, d);
        if (wants >= 5) { part(CYL, mat("#E8C25A"), 0.1, 0.25, 0.1, 0, 1.03, 0, d); part(new three.CylinderGeometry(0.22, 0.08, 0.3, 12), mat("#E8C25A"), 1, 1, 1, 0, 1.3, 0, d); }
        else { part(TORUS, mat("#E2574C"), 0.12, 0.12, 0.12, 0, 1.05, 0, d); }
        label(`${LABEL.display} ${wants}`, W * 0.4, 1.85, -D / 2 + 1.3);
      }

      // ── 우체통 ──
      const mb = group("mailbox", -W / 2 + 0.7, 0, D / 2 - 0.7);
      part(BOX, mat("#5A4636"), 0.1, 0.9, 0.1, 0, 0.45, 0, mb);
      part(BOX, mat("#E2574C"), 0.55, 0.4, 0.4, 0, 1.05, 0, mb);
      for (let i = 0; i < Math.min(3, notes); i++) { const e = part(BOX, mat("#FFFFFF"), 0.3, 0.2, 0.02, -0.05 + i * 0.06, 1.33, -0.05 + i * 0.05, mb); e.rotation.z = (i - 1) * 0.2; }
      label(LABEL.mailbox, -W / 2 + 0.7, 1.75, D / 2 - 0.7);

      // ── 단계 장식: 러그·매단 등 / 다락 ──
      if (stage >= 2) {
        const rug = part(CYL, mat(st.rug), 1.3, 0.02, 0.9, 0.2, 0.01, 0.5); void rug;
        const lamp = group(null, W * 0.05, H - 0.3, 0.2);
        part(CYL, mat("#555"), 0.01, 0.6, 0.01, 0, 0, 0, lamp);
        const bulb = part(BALL, mat("#FFE6A3", { e: "#FFD27A", ei: 1 }), 0.14, 0.14, 0.14, 0, -0.4, 0, lamp);
        part(new three.ConeGeometry(0.3, 0.25, 12, 1, true), mat(st.trim), 1, 1, 1, 0, -0.3, 0, lamp);
        const pl = new three.PointLight("#FFE6A3", 0.8, 6); pl.position.set(W * 0.05, H - 0.8, 0.2); scene.add(pl); void bulb;
      }
      if (stage >= 3) {
        // 다락: 뒷벽 오른쪽 위 (아래엔 설계도 판)
        const loft = group(null, LX, 2.55, -D / 2 + 0.7);
        part(BOX, mat(st.trim), W * 0.5, 0.12, 1.4, 0, 0, 0, loft);
        for (let i = 0; i < 6; i++) part(BOX, mat(st.trim), 0.06, 0.5, 0.06, -W * 0.25 + 0.1 + i * (W * 0.5 - 0.2) / 5, 0.3, 0.68, loft);
        part(BOX, mat(st.trim), W * 0.5, 0.06, 0.06, 0, 0.55, 0.68, loft);
        ["#B28A5A", "#8B6A4A", "#C9A24A"].forEach((c, i) => part(BOX, mat(c), 0.45, 0.4, 0.4, -W * 0.18 + i * 0.6, 0.26, -0.2, loft));
        const ladder = group(null, LX - W * 0.25 - 0.35, 0, -D / 2 + 1.5);
        for (const s of [-0.22, 0.22]) part(BOX, mat(st.trim), 0.06, 2.7, 0.06, s, 1.35, 0, ladder);
        for (let i = 0; i < 6; i++) part(BOX, mat(st.trim), 0.44, 0.05, 0.05, 0, 0.35 + i * 0.4, 0, ladder);
      }

      // ── 집 도깨비: 달그락 스프라이트가 화로 옆을 지킨다 ──
      const tex = await new three.TextureLoader().loadAsync("/find/sprites/idle.webp").catch(() => null);
      if (tex && !disposed) {
        tex.colorSpace = three.SRGBColorSpace; tex.repeat.set(1 / 25, 1);
        const sp = new three.Sprite(new three.SpriteMaterial({ map: tex, transparent: true }));
        sp.scale.set(1.4, 1.4, 1); sp.position.set(hx + 0.9, 0.7, hz + 2.2); scene.add(sp);
        let f = 0, clockF = 0;
        anim.push((t) => { if (t - clockF > 0.09) { clockF = t; f = (f + 1) % 25; tex.offset.x = f / 25; } });
      }

      // ── 카메라: 오른쪽 앞에서 방 모서리를 본다. 옆으로 끌면 조금 돌려볼 수 있다 ──
      const FOV = 38;
      const camera = new three.PerspectiveCamera(FOV, el.clientWidth / el.clientHeight, 0.1, 100);
      const target = new three.Vector3(0, 1.1, 0);
      const fit = Math.hypot(W, D) / 2 / Math.tan(((FOV / 2) * Math.PI) / 180) / Math.min(1, el.clientWidth / el.clientHeight);
      const dist = fit * 0.92;
      let yaw = 0.62, drag: { x: number; yaw: number; moved: boolean } | null = null;
      const place = () => { camera.position.set(target.x + Math.sin(yaw) * dist * 0.85, target.y + dist * 0.5, target.z + Math.cos(yaw) * dist * 0.85); camera.lookAt(target); };
      place();
      const ray = new three.Raycaster(), ndc = new three.Vector2();
      const down = (e: PointerEvent) => { drag = { x: e.clientX, yaw, moved: false }; };
      const move = (e: PointerEvent) => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 4) drag.moved = true; yaw = Math.max(0.15, Math.min(1.25, drag.yaw - dx * 0.005)); place(); };
      const up = (e: PointerEvent) => {
        const d = drag; drag = null;
        if (!d || d.moved) return;
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects(pickables, true)[0];
        let o: T.Object3D | null = hit?.object ?? null;
        while (o && !o.userData.obj) o = o.parent;
        if (o) pick.current(o.userData.obj as RoomObj);
      };
      const cv = renderer.domElement;
      cv.style.touchAction = "pan-y";
      cv.addEventListener("pointerdown", down); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
      const onResize = () => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); };
      window.addEventListener("resize", onResize);

      const clock = new three.Clock();
      const tick = () => { const t = clock.getElapsedTime(); for (const fn of anim) fn(t); renderer.render(scene, camera); raf = requestAnimationFrame(tick); };
      tick();
      cleanup = () => {
        cancelAnimationFrame(raf);
        cv.removeEventListener("pointerdown", down); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("resize", onResize);
        renderer.dispose(); el.removeChild(cv);
      };
    })().catch(() => setFailed(true));
    return () => { disposed = true; cleanup(); };
  }, [village, fires, peak, fuel, wants, notes, neighbors]);

  if (failed) return <>{fallback}</>;
  return <div className="room3d" ref={mount} role="img" aria-label="대장간 안. 화로, 도깨비불 선반, 설계도, 작업대, 우체통이 있어." />;
}
