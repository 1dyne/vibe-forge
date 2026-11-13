"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type * as T from "three";
import { hueSpriteMaterial } from "./three-hue";

// 대장간 안 (3D). 동물의 숲의 '내 집'처럼, 아이디어를 쌓을수록 방이 변한다.
//  - 방 크기·구조: 가장 많이 자란 도깨비불의 단계 (불씨 = 작은 방 / 타오름 = 창문 둘·러그·매단 등 / 활활 = 넓은 방·다락·풀무)
//  - 선반: 도깨비불 하나 = 그 불 색으로 빛나는 한지 초롱 하나 (선반 칸은 초롱 수만큼 늘어난다)
//  - 작업대: 메모 쪽지(불씨) → 펼친 한지 설계도(타오름) → 부품 함 + 깜빡이는 시제품(활활)
//  - 공구 걸이: 지금까지 채운 장작 갈래마다 공구 하나 (감지 = 돋보기, 반응 = 종, 형태 = 자, 누구 = 액자)
//  - 화덕(흙)과 풀무: 불 크기 = 화력 + 받은 장작, 불 색 = 가장 최근 도깨비불 색. 옆에 장작더미(받은 장작 수만큼)
//  - 소반: '나도 갖고 싶어'가 쌓이면 메밀묵 한 그릇 → 금빛 초롱 (메밀묵은 도깨비가 가장 좋아하는 제물)
//  - 편지함: 놀러 온 도깨비가 남긴 말만큼 편지가 꽂힌다 · 벽 족자 = 이웃 수
//  고증: 흙벽·나무 기둥·창호·마루(대장간 마을은 흙바닥). 유리·벽돌·타일·청사진 같은 근대 재료는 쓰지 않는다.

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
  /** 집 주인 달그락 색 (온보딩 때 받은 색) */
  hue: number;
  /** 전체 화면으로 보일 때 */
  full?: boolean;
  /** 작업실 메모 수: 설계도 판에 쪽지가 붙는다 */
  memos?: number;
  /** 이 대장간에 건 소원 등불 (켜진 것 / 이뤄진 것) */
  lanternsLit?: number;
  lanternsDone?: number;
  onPick: (o: RoomObj) => void;
  /** 열린 쪽 화살표를 누르면: 달그락이 걸어 나간 뒤 불린다 (주인 화면에서 마을로) */
  onExit?: () => void;
  fallback: ReactNode;
};

const STYLE: Record<string, { wall: string; wall2: string; floor: string; floor2: string; trim: string; rug: string; floorKind: "maru" | "earth" }> = {
  kkomul: { wall: "#E6D9BE", wall2: "#6E5236", floor: "#B8946A", floor2: "#9C7A58", trim: "#6E5236", rug: "#C9B98F", floorKind: "maru" },
  ttukttak: { wall: "#D2BF9C", wall2: "#5E4430", floor: "#8C7A62", floor2: "#7A6A54", trim: "#5E4430", rug: "#B79E70", floorKind: "earth" },
  jjaekkak: { wall: "#EBE1CB", wall2: "#4E3A2A", floor: "#A07C58", floor2: "#86664A", trim: "#4E3A2A", rug: "#C9B98F", floorKind: "maru" },
  wagle: { wall: "#E2D3B4", wall2: "#6E5236", floor: "#B8946A", floor2: "#9C7A58", trim: "#6E5236", rug: "#D6C29A", floorKind: "maru" },
  kkambbak: { wall: "#DCCFB4", wall2: "#5A4636", floor: "#A88A66", floor2: "#8E7254", trim: "#5A4636", rug: "#C9B993", floorKind: "maru" }
};
const LABEL: Record<RoomObj, string> = { hearth: "화덕", blueprint: "설계도", shelf: "도깨비불 선반", invention: "작업대", mailbox: "편지함", woodpile: "장작더미", tools: "연장 걸이", display: "소반" };

export default function ForgeRoom({ village, fires, peak, fuel, wants, notes, neighbors, hue, full = false, memos = 0, lanternsLit = 0, lanternsDone = 0, onPick, onExit, fallback }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
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
        const R = 3; // 여러 배로 그려야 글씨가 안 깨진다
        const c = document.createElement("canvas"); const ctx = c.getContext("2d")!;
        ctx.font = "34px Jua, sans-serif"; const w = Math.ceil(ctx.measureText(text).width) + 30; c.width = w * R; c.height = 54 * R;
        ctx.scale(R, R); ctx.font = "34px Jua, sans-serif"; ctx.fillStyle = "rgba(30,31,36,.82)"; ctx.beginPath(); ctx.roundRect(0, 0, w, 54, 27); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, w / 2, 29);
        const tex = new three.CanvasTexture(c); tex.colorSpace = three.SRGBColorSpace; tex.anisotropy = 8;
        const s = new three.Sprite(new three.SpriteMaterial({ map: tex, depthTest: false })); s.scale.set((c.width / c.height) * 0.32, 0.32, 1); s.position.set(x, y, z); s.renderOrder = 10; scene.add(s);
      };

      // ── 벽·바닥 무늬 (마을 재료) ──
      const patternTex = (kind: string, a: string, b: string, w: number, h: number) => {
        const c = document.createElement("canvas"); c.width = 256; c.height = 256; const x = c.getContext("2d")!;
        x.fillStyle = a; x.fillRect(0, 0, 256, 256); x.strokeStyle = b; x.fillStyle = b;
        if (kind === "earthwall") { for (let k = 0; k < 2; k++) x.fillRect(k * 128 + 58, 0, 14, 256); x.fillRect(0, 150, 256, 10); x.fillStyle = "rgba(0,0,0,.05)"; for (let i = 0; i < 90; i++) x.fillRect((i * 97) % 256, (i * 61) % 256, 3, 2); }
        else if (kind === "earth") { x.fillStyle = "rgba(0,0,0,.08)"; for (let i = 0; i < 160; i++) x.fillRect((i * 97) % 256, (i * 61) % 256, 4, 3); }
        else if (kind === "brick") { x.lineWidth = 4; for (let r = 0; r < 8; r++) { x.beginPath(); x.moveTo(0, r * 32); x.lineTo(256, r * 32); x.stroke(); for (let k = 0; k < 4; k++) { const bx = k * 64 + (r % 2) * 32; x.beginPath(); x.moveTo(bx, r * 32); x.lineTo(bx, r * 32 + 32); x.stroke(); } } }
        else if (kind === "stone") { x.lineWidth = 3; for (let r = 0; r < 4; r++) { x.beginPath(); x.moveTo(0, r * 64); x.lineTo(256, r * 64); x.stroke(); for (let k = 0; k < 3; k++) { const bx = k * 96 + (r % 2) * 48; x.beginPath(); x.moveTo(bx, r * 64); x.lineTo(bx, r * 64 + 64); x.stroke(); } } }
        else if (kind === "beam") { for (let k = 0; k < 2; k++) x.fillRect(k * 128 + 54, 0, 20, 256); }
        else if (kind === "stripe") { for (let k = 0; k < 4; k++) x.fillRect(k * 64, 0, 26, 256); }
        else if (kind === "tile") { x.lineWidth = 3; for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(k * 64, 0); x.lineTo(k * 64, 256); x.stroke(); x.beginPath(); x.moveTo(0, k * 64); x.lineTo(256, k * 64); x.stroke(); } }
        else if (kind === "plank") { x.lineWidth = 3; for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(0, k * 64); x.lineTo(256, k * 64); x.stroke(); } }
        else if (kind === "checker") { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) x.fillRect(i * 64, j * 64, 64, 64); }
        const t = new three.CanvasTexture(c); t.colorSpace = three.SRGBColorSpace; t.wrapS = t.wrapT = three.RepeatWrapping; t.repeat.set(w / 2.4, h / 2.4); return t;
      };
      const floorKind = st.floorKind === "earth" ? "earth" : "plank"; // 마루 / 흙바닥
      const floor = new three.Mesh(new three.BoxGeometry(W, 0.2, D), new three.MeshStandardMaterial({ map: patternTex(floorKind, st.floor, st.floor2, W, D), roughness: 0.9 }));
      floor.position.set(0, -0.1, 0); scene.add(floor);
      const wallMat = new three.MeshStandardMaterial({ map: patternTex("earthwall", st.wall, st.wall2, W, H), roughness: 0.95 });
      const wallMatL = new three.MeshStandardMaterial({ map: patternTex("earthwall", st.wall, st.wall2, D, H), roughness: 0.95 });
      part(BOX, wallMat, W, H, 0.2, 0, H / 2, -D / 2 - 0.1);
      part(BOX, wallMatL, 0.2, H, D, -W / 2 - 0.1, H / 2, 0);
      part(BOX, mat(st.trim), W, 0.16, 0.24, 0, 0.08, -D / 2 + 0.02); part(BOX, mat(st.trim), 0.24, 0.16, D, -W / 2 + 0.02, 0.08, 0);
      part(BOX, mat(st.trim), W + 0.2, 0.22, 0.3, 0, H, -D / 2); part(BOX, mat(st.trim), 0.3, 0.22, D + 0.2, -W / 2, H, 0);

      // 창문 (단계가 오를수록 늘어남)
      // 창호: 한지 바른 살창 (바깥 해 질 녘 빛이 은은하게 비친다)
      const win = (x: number, y: number, z: number, ry: number) => {
        const g = group(null, x, y, z, ry);
        part(BOX, mat(st.trim), 1.2, 1.0, 0.1, 0, 0, 0, g);
        part(BOX, mat("#F3E7C9", { e: "#F2B07A", ei: 0.35 }), 1.04, 0.84, 0.12, 0, 0, 0.01, g);
        for (let k = 1; k < 4; k++) part(BOX, mat(st.trim), 0.03, 0.84, 0.14, -0.52 + k * 0.26, 0, 0.02, g);
        for (let k = 1; k < 3; k++) part(BOX, mat(st.trim), 1.04, 0.03, 0.14, 0, -0.42 + k * 0.28, 0.02, g);
      };
      win(stage >= 3 ? -1.0 : -0.1, 2.15, -D / 2 + 0.02, 0);
      if (stage >= 2) win(-W / 2 + 0.02, 2.15, D / 2 - 0.65, Math.PI / 2);

      // ── 화로 + 장작더미 + 모루 ──
      const hx = -W / 2 + 1.4, hz = -D / 2 + 1.0;
      const hearth = group("hearth", hx, 0, hz);
      // 흙으로 빚은 화덕 + 벽을 따라 올라간 굴뚝 (김홍도 「대장간」의 화덕)
      part(BOX, mat("#8C877C"), 1.7, 0.35, 1.3, 0, 0.17, 0, hearth);
      part(new three.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat("#9C6B4E"), 0.75, 0.75, 0.6, 0, 0.35, -0.05, hearth);
      part(BOX, mat("#3B3633"), 0.55, 0.4, 0.3, 0, 0.6, 0.5, hearth); // 아궁이
      part(CYL, mat("#8C7A62"), 0.2, H, 0.2, 0, H / 2 + 0.5, -0.45, hearth);
      const heat = Math.min(1.6, 0.6 + (peak / 100) * 0.6 + fuel * 0.04);
      const flames = [0, 1, 2].map((i) => part(new three.ConeGeometry(0.22, 0.7, 6), mat(i === 1 ? "#FFD27A" : latest, { e: i === 1 ? "#FFB84D" : latest, ei: 1 }), heat, heat, heat, (i - 1) * 0.28, 0.95, 0.1, hearth));
      const glow = new three.PointLight(latest, 2.2, 6, 1.6); glow.position.set(hx, 1.3, hz + 0.6); scene.add(glow);
      anim.push((t) => { flames.forEach((f, i) => { f.scale.y = heat * (1 + Math.sin(t * 9 + i * 2) * 0.18); }); glow.intensity = 2 + Math.sin(t * 11) * 0.4 + Math.sin(t * 7.3) * 0.3; });
      label(LABEL.hearth, hx, 2.6, hz);
      // 풀무: 손잡이를 밀고 당기면 불이 커진다 (활활 단계엔 큰 풀무)
      { const big = stage >= 3 ? 1.3 : 1; const b = part(BOX, mat("#5A4030"), 0.6 * big, 0.35 * big, 0.45 * big, 1.05, 0.35, 0.2, hearth); const handle = part(BOX, mat(st.trim), 0.5, 0.05, 0.05, 1.45, 0.62, 0.2, hearth); anim.push((t) => { handle.position.x = 1.45 + Math.sin(t * 2.2) * 0.12; b.scale.y = 0.35 * big * (1 + Math.sin(t * 2.2) * 0.08); }); }

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
        // 한지 초롱: 안에 그 도깨비불이 들어 있다
        const shade = part(CYL, mat("#F3E7C9", { e: f.color, ei: 0.8 }), 0.13, 0.3, 0.13, 0, 0.18, 0, jar);
        part(CYL, mat(st.trim), 0.14, 0.03, 0.14, 0, 0.34, 0, jar); part(CYL, mat(st.trim), 0.14, 0.03, 0.14, 0, 0.03, 0, jar);
        anim.push((t) => { (shade.material as T.MeshStandardMaterial).emissiveIntensity = 0.7 + Math.sin(t * 3 + i) * 0.15; });
      });
      if (fires.length === 0) part(BOX, mat("#FFFFFF"), 0.02, 0.18, 0.3, 0.2, 0.84, 0, shelf);
      if (fires.length > shown.length) label(`+${fires.length - shown.length}`, -W / 2 + 0.45, 0.75 + boards * 0.62, SZ + 0.9);
      label(`${LABEL.shelf} ${fires.length}`, -W / 2 + 0.5, 1.0 + boards * 0.62, SZ);

      // 이웃 족자 (왼쪽 벽 위): 한지에 먹으로 쓴 이웃 이름
      for (let i = 0; i < Math.min(4, neighbors); i++) { const f = group(null, -W / 2 + 0.03, 2.85, SZ - 0.9 + i * 0.6, Math.PI / 2); part(BOX, mat("#F3E7C9"), 0.32, 0.62, 0.02, 0, 0, 0, f); part(CYL, mat(st.trim), 0.02, 0.4, 0.02, 0, 0.32, 0.01, f).rotation.z = Math.PI / 2; part(CYL, mat(st.trim), 0.02, 0.4, 0.02, 0, -0.32, 0.01, f).rotation.z = Math.PI / 2; part(BOX, mat("#2A2118"), 0.03, 0.36, 0.025, 0, 0, 0.005, f); }

      // ── 설계도 벽 (뒷벽 오른쪽) + 공구 걸이 ──
      const BX = W / 2 - 1.35;
      const LX = W / 2 - W * 0.25;
      const bp = group("blueprint", BX, stage >= 3 ? 0.72 : 1.0, -D / 2 + 0.05);
      const pinned = Math.max(1, Math.min(6, memos || fires.length));
      for (let i = 0; i < pinned; i++) { const p = part(BOX, mat(i % 2 ? "#F3E7C9" : "#EADCB8"), 0.36, 0.44, 0.02, -0.75 + (i % 2) * 0.45, 0.4 + Math.floor(i / 2) * 0.52, 0.02, bp); p.rotation.z = (i % 2 ? 1 : -1) * 0.06; part(BOX, mat(st.trim), 0.06, 0.04, 0.03, p.position.x, p.position.y + 0.2, 0.04, bp); }
      if (stage >= 2) {
        const c = document.createElement("canvas"); c.width = 256; c.height = 200; const x = c.getContext("2d")!;
        x.fillStyle = "#F1E4C4"; x.fillRect(0, 0, 256, 200); x.strokeStyle = "rgba(40,30,20,.85)"; x.lineWidth = 4; // 한지에 먹으로 그린 설계도
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
        const sh = part(BOX, mat("#F1E4C4"), 1.0, 0.02, 0.6, -0.3, 0.9, 0, bench); sh.rotation.y = 0.08;
        const roll = part(CYL, mat("#EADCB8"), 0.06, 0.6, 0.06, 0.3, 0.94, 0, bench); roll.rotation.x = Math.PI / 2;
        part(BOX, mat("#2A2118"), 0.5, 0.02, 0.02, -0.3, 0.92, 0.1, bench); part(CYL, mat("#3E3530"), 0.02, 0.3, 0.02, 0.0, 0.93, 0.22, bench).rotation.z = Math.PI / 2; // 먹선과 붓
      }
      if (stage >= 3) {
        part(BOX, mat("#6E5236"), 0.5, 0.25, 0.35, 0.55, 1.0, -0.2, bench); // 부품 함
        ["#B8946A", "#8C877C", "#C9B98F", "#5A3B2A"].forEach((c, i) => part(BOX, mat(c), 0.08, 0.08, 0.08, 0.42 + (i % 2) * 0.14, 1.15, -0.27 + Math.floor(i / 2) * 0.14, bench));
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
        // 소반 위에 메밀묵 한 그릇, 5개가 넘으면 금빛 초롱이 하나 더
        part(CYL, mat(st.trim), 0.45, 0.06, 0.45, 0, 0.45, 0, d);
        for (let k = 0; k < 4; k++) part(BOX, mat(st.trim), 0.05, 0.42, 0.05, Math.cos(k * 1.57 + 0.78) * 0.32, 0.21, Math.sin(k * 1.57 + 0.78) * 0.32, d);
        part(CYL, mat("#E8E2D2"), 0.16, 0.08, 0.16, -0.12, 0.52, 0, d); part(BOX, mat("#6E5A4A"), 0.16, 0.06, 0.12, -0.12, 0.58, 0, d); // 메밀묵
        if (wants >= 5) { part(CYL, mat("#F3E7C9", { e: "#E8C25A", ei: 1 }), 0.11, 0.24, 0.11, 0.18, 0.62, 0, d); }
        label(`${LABEL.display} ${wants}`, W * 0.4, 1.85, -D / 2 + 1.3);
      }

      // ── 우체통 ──
      const mb = group("mailbox", -W / 2 + 0.7, 0, D / 2 - 0.7);
      part(BOX, mat("#5A4636"), 0.1, 0.9, 0.1, 0, 0.45, 0, mb);
      part(BOX, mat(st.trim), 0.55, 0.4, 0.4, 0, 1.05, 0, mb); // 나무 편지함
      for (let i = 0; i < Math.min(3, notes); i++) { const e = part(BOX, mat("#FFFFFF"), 0.3, 0.2, 0.02, -0.05 + i * 0.06, 1.33, -0.05 + i * 0.05, mb); e.rotation.z = (i - 1) * 0.2; }
      label(LABEL.mailbox, -W / 2 + 0.7, 1.75, D / 2 - 0.7);

      // ── 단계 장식: 러그·매단 등 / 다락 ──
      if (stage >= 2) {
        part(BOX, mat(st.rug), 2.2, 0.02, 1.4, 0.2, 0.01, 0.5); // 돗자리
        const lamp = group(null, W * 0.3, 0, D / 2 - 0.9); // 등잔
        part(CYL, mat(st.trim), 0.15, 0.06, 0.15, 0, 0.03, 0, lamp); part(CYL, mat(st.trim), 0.03, 1.1, 0.03, 0, 0.6, 0, lamp); part(CYL, mat("#8C7A62"), 0.1, 0.05, 0.1, 0, 1.17, 0, lamp);
        const flameL = part(new three.ConeGeometry(0.05, 0.14, 6), mat("#FFD27A", { e: "#FFB84D", ei: 1 }), 1, 1, 1, 0, 1.28, 0, lamp);
        const pl = new three.PointLight("#FFD9A0", 0.8, 6); pl.position.set(W * 0.3, 1.4, D / 2 - 0.9); scene.add(pl);
        anim.push((t) => { flameL.scale.y = 1 + Math.sin(t * 12) * 0.15; pl.intensity = 0.75 + Math.sin(t * 9) * 0.1; });
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

      // ── 소원 등불: 앞 처마 도리에 매단 한지 초롱 (이뤄진 것은 금빛) ──
      {
        const n = Math.min(8, lanternsLit + lanternsDone);
        const LZ = -D / 2 + 0.35; // 뒷벽 도리
        if (n) part(BOX, mat(st.trim), W * 0.8, 0.12, 0.12, 0.3, H - 0.25, LZ);
        for (let k = 0; k < n; k++) {
          const done = k < lanternsDone;
          const x = 0.3 - W * 0.36 + (k + 0.5) * (W * 0.72 / n);
          part(CYL, mat("#8A7350"), 0.01, 0.4, 0.01, x, H - 0.5, LZ);
          const lan = part(CYL, mat("#F3E7C9", { e: done ? "#FFD27A" : "#F2A65A", ei: 1 }), 0.13, 0.28, 0.13, x, H - 0.85, LZ);
          const ph = k; anim.push((t) => { lan.rotation.z = Math.sin(t * 1.2 + ph) * 0.08; });
        }
        if (n) { const pl = new three.PointLight("#FFC27A", 0.6, 5); pl.position.set(0.3, H - 1, LZ + 0.4); scene.add(pl); }
      }

      // ── 집 도깨비: 이 집 주인의 달그락(온보딩 때 받은 색)이 화로 옆을 지킨다 ──
      // 바닥을 누르면 그리로 걸어가고, 물건을 누르면 그 앞까지 걸어간 뒤 연다. 처음엔 열린 쪽에서 걸어 들어온다
      const loader = new three.TextureLoader();
      const [tex, walkTex] = await Promise.all([loader.loadAsync("/find/sprites/idle.webp").catch(() => null), loader.loadAsync("/find/sprites/stoke.webp").catch(() => null)]);
      const home = new three.Vector3(hx + 0.9, 0, hz + 2.2);
      const me = { pos: new three.Vector3(W / 2 + 1.4, 0, D / 2 + 1.4), target: home.clone() as T.Vector3 | null, then: null as null | (() => void), leaving: false };
      const clampIn = (v: T.Vector3) => { v.x = Math.max(-W / 2 + 0.6, Math.min(W / 2 - 0.4, v.x)); v.z = Math.max(-D / 2 + 0.9, Math.min(D / 2 - 0.2, v.z)); return v; };
      let sp: T.Sprite | null = null;
      if (tex && !disposed) {
        for (const t0 of [tex, walkTex]) if (t0) { t0.colorSpace = three.SRGBColorSpace; t0.repeat.set(1 / 25, 1); }
        const spMat = hueSpriteMaterial(three, tex, hue);
        sp = new three.Sprite(spMat); sp.scale.set(1.4, 1.4, 1); scene.add(sp);
        const shadow = new three.Mesh(new three.CircleGeometry(0.32, 16), new three.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.18 }));
        shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
        let f = 0, clockF = 0, last = 0;
        anim.push((t) => {
          const dt = Math.min(0.05, t - last); last = t;
          let moving = false;
          if (me.target) {
            const d = me.target.clone().sub(me.pos); d.y = 0; const len = d.length();
            if (len < 0.05) { me.target = null; const fn = me.then; me.then = null; fn?.(); }
            else { me.pos.addScaledVector(d.normalize(), Math.min(len, (me.leaving ? 2.2 : 1.8) * dt)); moving = true; }
          }
          const cur = moving && walkTex ? walkTex : tex;
          const m = sp!.material as T.SpriteMaterial & { uniforms?: { map: { value: T.Texture } } };
          if (m.uniforms?.map) { if (m.uniforms.map.value !== cur) m.uniforms.map.value = cur; } else if (m.map !== cur) { m.map = cur; m.needsUpdate = true; }
          if (t - clockF > (moving ? 0.05 : 0.09)) { clockF = t; f = (f + 1) % 25; cur.offset.x = f / 25; }
          sp!.position.set(me.pos.x, 0.7 + (moving ? Math.abs(Math.sin(t * 10)) * 0.06 : 0), me.pos.z);
          shadow.position.set(me.pos.x, 0.02, me.pos.z);
          if (me.leaving) { const o = Math.max(0, Math.min(1, (W / 2 + 1.5 - me.pos.x) / 1.4)); (sp!.material as T.Material).opacity = o; (sp!.material as T.Material).transparent = true; }
        });
      }
      const walkTo = (p: T.Vector3, then?: () => void) => { if (me.leaving) return; if (!sp) { then?.(); return; } me.target = clampIn(p.clone()); me.then = then ?? null; };

      // ── 나가는 화살표: 방의 열린 쪽(앞) 바닥에서 통통 튄다 ──
      if (exitRef.current) {
        const ex = group(null, W / 2 - 0.75, 0, D / 2 - 0.75); // 앞 오른쪽 모서리(열린 쪽)
        ex.userData.exit = true; pickables.push(ex);
        const shape = new three.Shape(); shape.moveTo(0, 0.55); shape.lineTo(0.45, 0.05); shape.lineTo(0.18, 0.05); shape.lineTo(0.18, -0.45); shape.lineTo(-0.18, -0.45); shape.lineTo(-0.18, 0.05); shape.lineTo(-0.45, 0.05); shape.closePath();
        const arrow = new three.Mesh(new three.ShapeGeometry(shape), new three.MeshBasicMaterial({ color: "#FF8F3F", side: three.DoubleSide }));
        arrow.rotation.x = -Math.PI / 2; arrow.position.y = 0.05; const holder = new three.Group(); holder.rotation.y = -Math.PI * 0.75; holder.add(arrow); ex.add(holder); // 열린 모서리 바깥을 가리킨다
        const hit = new three.Mesh(new three.CircleGeometry(0.8, 12), new three.MeshBasicMaterial({ visible: false })); hit.rotation.x = -Math.PI / 2; hit.position.y = 0.06; ex.add(hit);
        anim.push((t) => { arrow.position.z = -0.1 - Math.abs(Math.sin(t * 3)) * 0.2; });
        label("마을로", W / 2 - 0.75, 0.85, D / 2 - 0.75);
      }
      const leave = () => {
        if (me.leaving) return;
        walkTo(new three.Vector3(W / 2 - 0.8, 0, D / 2 - 0.8), () => { me.leaving = true; me.target = new three.Vector3(W / 2 + 1.6, 0, D / 2 + 1.6); me.then = () => exitRef.current?.(); });
      };

      // ── 카메라: 오른쪽 앞에서 방 모서리를 본다. 옆으로 끌면 조금 돌려볼 수 있다 ──
      const FOV = 38;
      const camera = new three.PerspectiveCamera(FOV, el.clientWidth / el.clientHeight, 0.1, 100);
      const target = new three.Vector3(0, 1.1, 0);
      const fit = Math.hypot(W, D) / 2 / Math.tan(((FOV / 2) * Math.PI) / 180) / Math.min(1, el.clientWidth / el.clientHeight);
      const dist = fit * (full ? 0.74 : 0.92);
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
        while (o && !o.userData.obj && !o.userData.exit) o = o.parent;
        if (o?.userData.exit) { leave(); return; }
        if (o) {
          // 물건 앞(방 가운데 쪽)까지 걸어간 뒤 연다
          const wp = new three.Vector3(); o.getWorldPosition(wp);
          const toward = new three.Vector3(-wp.x, 0, -wp.z + 0.6).normalize();
          const obj = o.userData.obj as RoomObj; let opened = false;
          const open = () => { if (!opened) { opened = true; pick.current(obj); } };
          walkTo(new three.Vector3(wp.x, 0, wp.z).addScaledVector(toward, 1.1), open);
          setTimeout(open, 1600); // 멀리 있어도 오래 기다리게 하지 않는다
          return;
        }
        const fl = ray.intersectObject(floor)[0];
        if (fl) walkTo(fl.point);
      };
      const cv = renderer.domElement;
      cv.style.touchAction = full ? "none" : "pan-y";
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
    })().catch((e) => { console.error("3D 장면을 만들지 못함", e); setFailed(true); });
    return () => { disposed = true; cleanup(); };
  }, [village, fires, peak, fuel, wants, notes, neighbors, hue, full, memos, lanternsLit, lanternsDone]);

  if (failed) return <>{fallback}</>;
  return <div className={full ? "room3d room3d-full" : "room3d"} ref={mount} role="img" aria-label="대장간 안. 화로, 도깨비불 선반, 설계도, 작업대, 우체통이 있어." />;
}
