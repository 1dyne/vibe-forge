"use client";
import { useEffect, useRef, useState } from "react";
import type * as T from "three";

// 걷는 손바닥 마을 (프로토타입). 거대한 손바닥 위를 달그락이 걸어 다닌다.
// 손가락 5개 = 마을, 손가락을 따라 집(대장간)이 줄지어 있고, 손바닥 한가운데 본관이 공사 중이다.
// 땅·집은 단순한 로우폴리 3D, 캐릭터는 다인이 그린 스프라이트를 종이 인형처럼 세운다.

export type WorldHouse = { id: string; nickname: string; theme: string; alleySeq: number; plotNo: number; color: string; peak: number; fuel: number; wants: number; lit: boolean };
type Village = { id: string; name: string; themes: string[] };
type Props = { houses: WorldHouse[]; villages: Village[]; hallStage: number; hallPct: number; myForgeId: string | null };

const PALM_R = 15;
// 손가락: 손바닥 중심에서 본 각도(라디안, 0 = 앞쪽 -z), 길이, 굵기. 엄지는 옆으로 낮게.
const FINGERS = [
  { a: -1.25, len: 20, w: 8.5, base: 0.55 },
  { a: -0.52, len: 30, w: 8 },
  { a: -0.15, len: 33, w: 8 },
  { a: 0.22, len: 31, w: 8 },
  { a: 0.6, len: 24, w: 7.5 }
];
const SPACING = 4.6;
const SKIN = "#A9DCC9";
const ROAD = "#F1E4C8";
const ROOFS = ["#F2A65A", "#6C8EBF", "#9B7BFF", "#4FB3A6", "#E7C14B", "#D97BA6"];
const hashOf = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

type Spot = { x: number; z: number; house?: WorldHouse; hall?: boolean; label: string };

function fingerAxis(i: number) {
  const f = FINGERS[i];
  const dir = { x: Math.sin(f.a), z: -Math.cos(f.a) };
  const r = PALM_R * (f.base ?? 0.82);
  const start = { x: dir.x * r, z: dir.z * r };
  return { start, dir, len: f.len, w: f.w };
}

function onLand(x: number, z: number) {
  if (Math.hypot(x, z) < PALM_R - 0.6) return true;
  for (let i = 0; i < FINGERS.length; i++) {
    const { start, dir, len, w } = fingerAxis(i);
    const px = x - start.x, pz = z - start.z;
    const t = Math.max(0, Math.min(len, px * dir.x + pz * dir.z));
    const cx = start.x + dir.x * t, cz = start.z + dir.z * t;
    if (Math.hypot(x - cx, z - cz) < w / 2 - 0.5) return true;
  }
  return false;
}
const solids: Array<{ x: number; z: number; r: number }> = [{ x: 0, z: 0, r: 3.9 }];
const walkable = (x: number, z: number) => onLand(x, z) && solids.every((o) => Math.hypot(x - o.x, z - o.z) > o.r);

function labelTexture(three: typeof T, text: string, opts: { bg?: string; fg?: string; size?: number } = {}) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const size = opts.size ?? 44;
  ctx.font = `${size}px Jua, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + size;
  c.width = w; c.height = size * 1.7;
  ctx.font = `${size}px Jua, sans-serif`;
  ctx.fillStyle = opts.bg ?? "rgba(255,255,255,.92)";
  ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, c.height / 2); ctx.fill();
  ctx.fillStyle = opts.fg ?? "#1E1F24"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new three.CanvasTexture(c);
  tex.colorSpace = three.SRGBColorSpace;
  const sprite = new three.Sprite(new three.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.set(c.width / c.height * 0.9, 0.9, 1);
  return sprite;
}

export default function WorldView({ houses, villages, hallStage, hallPct, myForgeId }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const stick = useRef({ x: 0, y: 0, active: false });
  const [near, setNear] = useState<Spot | null>(null);
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};
    (async () => {
      const three = await import("three");
      if (disposed || !mount.current) return;
      let renderer: T.WebGLRenderer;
      try {
        renderer = new three.WebGLRenderer({ antialias: true });
      } catch { setFailed(true); return; }
      const el = mount.current;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.outputColorSpace = three.SRGBColorSpace;
      el.appendChild(renderer.domElement);

      const scene = new three.Scene();
      scene.background = new three.Color("#CFEAF2");
      scene.fog = new three.Fog("#CFEAF2", 30, 90);
      const camera = new three.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 0.1, 200);
      scene.add(new three.HemisphereLight("#ffffff", "#9ED3CB", 1.1));
      const sun = new three.DirectionalLight("#fff6e4", 1.4);
      sun.position.set(20, 30, 10);
      scene.add(sun);

      // ── 손바닥 땅 (두께 있는 판) ──
      const land = new three.MeshStandardMaterial({ color: SKIN, roughness: 0.9 });
      const outline = new three.MeshStandardMaterial({ color: "#232323", roughness: 1 });
      const palm = new three.Mesh(new three.CylinderGeometry(PALM_R, PALM_R, 2, 64), land);
      palm.position.y = -1; scene.add(palm);
      const palmRim = new three.Mesh(new three.TorusGeometry(PALM_R, 0.18, 8, 96), outline);
      palmRim.rotation.x = Math.PI / 2; palmRim.position.y = -1.9; scene.add(palmRim);
      FINGERS.forEach((_, i) => {
        const { start, dir, len, w } = fingerAxis(i);
        const g = new three.CapsuleGeometry(w / 2, len, 8, 24);
        const m = new three.Mesh(g, land);
        m.scale.y = 1;
        m.rotation.x = Math.PI / 2;
        const holder = new three.Group();
        holder.add(m);
        holder.scale.set(1, 0.22, 1);
        holder.rotation.y = -Math.atan2(dir.x, -dir.z);
        holder.position.set(start.x + dir.x * len / 2, -(w / 2) * 0.22 + 0.01, start.z + dir.z * len / 2);
        scene.add(holder);
        // 손톱(끝 표시)
        const nail = new three.Mesh(new three.CircleGeometry(w * 0.28, 24), new three.MeshStandardMaterial({ color: "#E8F5F2" }));
        nail.rotation.x = -Math.PI / 2;
        nail.position.set(start.x + dir.x * (len + w * 0.15), 0.02, start.z + dir.z * (len + w * 0.15));
        scene.add(nail);
      });
      const roadMat = new three.MeshStandardMaterial({ color: ROAD, roughness: 1 });
      FINGERS.forEach((_, i) => {
        const { start, dir, len } = fingerAxis(i);
        const road = new three.Mesh(new three.PlaneGeometry(2.2, len + 2), roadMat);
        road.rotation.x = -Math.PI / 2;
        road.rotation.z = -Math.atan2(dir.x, -dir.z);
        road.position.set(start.x + dir.x * (len / 2 - 1), 0.03, start.z + dir.z * (len / 2 - 1));
        scene.add(road);
      });
      const plaza = new three.Mesh(new three.RingGeometry(4.2, 6.2, 48), roadMat);
      plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.03; scene.add(plaza);
      // 손바닥 가장자리 나무
      const trunkMat = new three.MeshStandardMaterial({ color: "#8B6A4A" });
      const leafMat = new three.MeshStandardMaterial({ color: "#5FAF7E", flatShading: true });
      for (let i = 0; i < 18; i++) {
        const a = Math.PI * 0.55 + (i / 18) * Math.PI * 0.9 + (i % 2 ? 0.05 : -0.05);
        const r = PALM_R - 1.6 - (i % 3) * 0.9;
        const x = Math.sin(a) * r, z = -Math.cos(a) * r;
        if (!onLand(x, z)) continue;
        const t = new three.Group();
        const trunk = new three.Mesh(new three.CylinderGeometry(0.15, 0.2, 0.9), trunkMat); trunk.position.y = 0.45; t.add(trunk);
        const leaf = new three.Mesh(new three.ConeGeometry(0.9, 2, 7), leafMat); leaf.position.y = 1.8; t.add(leaf);
        const sc = 0.8 + ((i * 37) % 10) / 20; t.scale.setScalar(sc);
        t.position.set(x, 0, z); scene.add(t);
      }
      // 바다처럼 깔린 구름 바닥
      const sea = new three.Mesh(new three.CircleGeometry(160, 48), new three.MeshBasicMaterial({ color: "#EAF6F8" }));
      sea.rotation.x = -Math.PI / 2; sea.position.y = -3; scene.add(sea);

      const spots: Spot[] = [];
      solids.length = 1;
      const flames: Array<{ mesh: T.Mesh; base: number; phase: number }> = [];
      const signs: Array<{ s: T.Sprite; x: number; z: number }> = [];
      const nameTags: Array<{ s: T.Sprite; x: number; z: number; mine: boolean }> = [];

      // ── 집 ──
      function makeHouse(h: WorldHouse, x: number, z: number, faceAngle: number) {
        const g = new three.Group();
        const mine = h.id === myForgeId;
        const wall = new three.Mesh(new three.BoxGeometry(2.2, 1.6, 2), new three.MeshStandardMaterial({ color: "#FBFAF6" }));
        wall.position.y = 0.8; g.add(wall);
        const roof = new three.Mesh(new three.ConeGeometry(1.85, 1.2, 4), new three.MeshStandardMaterial({ color: mine ? "#E2574C" : ROOFS[hashOf(h.id) % ROOFS.length], flatShading: true }));
        roof.position.y = 2.2; roof.rotation.y = Math.PI / 4; g.add(roof);
        const door = new three.Mesh(new three.BoxGeometry(0.55, 0.9, 0.05), new three.MeshStandardMaterial({ color: "#C99A6B" }));
        door.position.set(0.35, 0.45, 1.02); g.add(door);
        const win = new three.Mesh(new three.BoxGeometry(0.5, 0.45, 0.05), new three.MeshStandardMaterial({ color: h.lit ? "#FFD27A" : "#DDD8CC", emissive: h.lit ? "#FFB84D" : "#000000", emissiveIntensity: h.lit ? 0.6 : 0 }));
        win.position.set(-0.5, 0.95, 1.02); g.add(win);
        const chimney = new three.Mesh(new three.BoxGeometry(0.35, 0.8, 0.35), new three.MeshStandardMaterial({ color: "#B9B4A8" }));
        chimney.position.set(0.55, 2.4, -0.3); g.add(chimney);
        const level = Math.min(3, 1 + Math.floor((h.peak + h.fuel * 3) / 55));
        const flame = new three.Mesh(new three.SphereGeometry(0.18 + level * 0.1, 12, 10), new three.MeshStandardMaterial({ color: h.color, emissive: h.color, emissiveIntensity: 0.9 }));
        flame.position.set(0.55, 3 + level * 0.12, -0.3); flame.scale.y = 1.6; g.add(flame);
        flames.push({ mesh: flame, base: flame.position.y, phase: Math.random() * 6 });
        if (h.wants >= 5) {
          const pole = new three.Mesh(new three.CylinderGeometry(0.04, 0.04, 1.4), outline);
          pole.position.set(-0.9, 2.2, 0.8); g.add(pole);
          const flag = new three.Mesh(new three.PlaneGeometry(0.6, 0.35), new three.MeshStandardMaterial({ color: "#9B7BFF", side: three.DoubleSide }));
          flag.position.set(-0.6, 2.7, 0.8); g.add(flag);
        }
        const label = labelTexture(three, mine ? "내 집" : h.nickname, mine ? { bg: "#1E1F24", fg: "#fff" } : {});
        label.position.set(0, 3.9, 0); label.scale.multiplyScalar(0.8); g.add(label);
        nameTags.push({ s: label, x, z, mine });
        g.position.set(x, 0, z);
        g.rotation.y = faceAngle;
        scene.add(g);
        solids.push({ x, z, r: 1.45 });
        spots.push({ x, z, house: h, label: mine ? "내 대장간" : `${h.nickname}의 대장간` });
      }

      // 마을(손가락)마다 그 마을 골목의 집을 손가락을 따라 양옆으로
      villages.forEach((v, i) => {
        if (i >= FINGERS.length) return;
        const { start, dir, len, w } = fingerAxis(i);
        const side = { x: -dir.z, z: dir.x };
        const list = houses.filter((h) => v.themes.includes(h.theme));
        const slots = Math.floor((len - 3) / SPACING) * 2;
        list.slice(0, slots).forEach((h, k) => {
          const t = 3 + Math.floor(k / 2) * SPACING + SPACING / 2;
          const s = (k % 2 ? 1 : -1) * (w / 2 - 1.6);
          const x = start.x + dir.x * t + side.x * s, z = start.z + dir.z * t + side.z * s;
          // 집 정면이 손가락 가운데 길을 보게
          const face = Math.atan2(-side.x * Math.sign(s), -side.z * Math.sign(s));
          makeHouse(h, x, z, face);
        });
        // 마을 표지판 (손가락 시작)
        const sign = labelTexture(three, list.length > slots ? `${v.name} · ${list.length}채` : v.name, { bg: "#1E1F24", fg: "#fff", size: 52 });
        sign.position.set(start.x + dir.x * 1.5, 3.6, start.z + dir.z * 1.5);
        scene.add(sign);
        signs.push({ s: sign, x: sign.position.x, z: sign.position.z });
        if (!list.length) {
          const soon = labelTexture(three, "빈 터 · 선착순", { size: 36 });
          soon.position.set(start.x + dir.x * len * 0.55, 1.2, start.z + dir.z * len * 0.55);
          scene.add(soon);
        }
      });

      // ── 손바닥 한가운데: 달그락 대장간 본관 (공사 단계) ──
      const hall = new three.Group();
      const hallBase = new three.Mesh(new three.BoxGeometry(5, 0.3, 4), new three.MeshStandardMaterial({ color: "#D9D2C3" }));
      hallBase.position.y = 0.15; hall.add(hallBase);
      if (hallStage >= 1) for (const [px, pz] of [[-2.2, -1.7], [2.2, -1.7], [-2.2, 1.7], [2.2, 1.7]]) {
        const p = new three.Mesh(new three.BoxGeometry(0.3, 3, 0.3), new three.MeshStandardMaterial({ color: "#8B6A4A" }));
        p.position.set(px, 1.6, pz); hall.add(p);
      }
      if (hallStage >= 2) { const r = new three.Mesh(new three.ConeGeometry(3.8, 1.8, 4), new three.MeshStandardMaterial({ color: "#E2574C", flatShading: true })); r.position.y = 4; r.rotation.y = Math.PI / 4; hall.add(r); }
      if (hallStage >= 3) { const c = new three.Mesh(new three.BoxGeometry(0.6, 1.4, 0.6), new three.MeshStandardMaterial({ color: "#9E9E9E" })); c.position.set(1.2, 4.6, 0); hall.add(c); }
      if (hallStage >= 4) { const w = new three.Mesh(new three.BoxGeometry(4.4, 2.8, 3.4), new three.MeshStandardMaterial({ color: "#F6F5F1" })); w.position.y = 1.7; hall.add(w); }
      // 공사 중 가림막
      if (hallStage < 4) {
        const fence = new three.Mesh(new three.CylinderGeometry(3.6, 3.6, 0.8, 24, 1, true), new three.MeshStandardMaterial({ color: "#FFC48A", side: three.DoubleSide, transparent: true, opacity: 0.85 }));
        fence.position.y = 0.4; hall.add(fence);
      }
      const hallLabel = labelTexture(three, `달그락 대장간 본관 · 공사 ${hallPct}%`, { bg: "#FF8F3F", fg: "#1E1F24", size: 46 });
      hallLabel.position.set(0, 5.6, 0); hall.add(hallLabel);
      scene.add(hall);
      spots.push({ x: 0, z: 0, hall: true, label: "달그락 대장간 본관" });

      // ── 떠다니는 도깨비불들 ──
      const wisps: Array<{ m: T.Mesh; r: number; a: number; s: number; y: number }> = [];
      const wispColors = ["#9B7BFF", "#FF8F3F", "#3FBF6E", "#4FB3A6"];
      for (let i = 0; i < 14; i++) {
        const c = wispColors[i % 4];
        const m = new three.Mesh(new three.SphereGeometry(0.22, 10, 8), new three.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 }));
        scene.add(m);
        wisps.push({ m, r: 6 + Math.random() * 30, a: Math.random() * 6.28, s: (0.05 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1), y: 1.5 + Math.random() * 3 });
      }

      // ── 달그락 (다인 스프라이트를 종이 인형처럼) ──
      const loader = new three.TextureLoader();
      const [idleTex, walkTex] = await Promise.all([loader.loadAsync("/find/sprites/idle.webp"), loader.loadAsync("/find/sprites/stoke.webp")]);
      for (const t of [idleTex, walkTex]) { t.colorSpace = three.SRGBColorSpace; t.repeat.set(1 / 25, 1); t.magFilter = three.LinearFilter; }
      const playerMat = new three.SpriteMaterial({ map: idleTex, transparent: true });
      const player = new three.Sprite(playerMat);
      player.scale.set(2.4, 2.4, 1);
      const pos = new three.Vector3(0, 1.2, -7);
      player.position.copy(pos);
      scene.add(player);
      const shadow = new three.Mesh(new three.CircleGeometry(0.6, 20), new three.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.18 }));
      shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

      // ── 조작: 키보드 + 화면 스틱 ──
      const keys = new Set<string>();
      const kd = (e: KeyboardEvent) => { keys.add(e.key.toLowerCase()); setHint(false); };
      const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
      window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
      const onResize = () => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); };
      window.addEventListener("resize", onResize);

      let heading = Math.PI; // 카메라가 바라보는 방향(라디안). 처음엔 손가락 쪽(-z)을 본다
      let frame = 0, frameClock = 0, lastNear: Spot | null = null;
      const clock = new three.Clock();
      const camPos = new three.Vector3();
      const topView = new URLSearchParams(location.search).has("top");
      if (topView) scene.fog = null;

      const tick = () => {
        const dt = Math.min(0.05, clock.getDelta());
        // 입력 → 화면 기준 이동 (위 = 앞으로, 좌우 = 방향 틀기 + 옆걸음)
        let fwd = stick.current.active ? -stick.current.y : 0;
        let turn = stick.current.active ? stick.current.x : 0;
        if (keys.has("w") || keys.has("arrowup")) fwd = 1;
        if (keys.has("s") || keys.has("arrowdown")) fwd = -1;
        if (keys.has("a") || keys.has("arrowleft")) turn = -1;
        if (keys.has("d") || keys.has("arrowright")) turn = 1;
        heading += turn * dt * 1.9;
        const speed = 6.5 * fwd;
        const moving = Math.abs(fwd) > 0.08;
        if (moving) {
          const nx = pos.x + Math.sin(heading) * speed * dt * -1;
          const nz = pos.z + Math.cos(heading) * speed * dt;
          if (walkable(nx, nz)) { pos.x = nx; pos.z = nz; }
          else if (walkable(nx, pos.z)) pos.x = nx;
          else if (walkable(pos.x, nz)) pos.z = nz;
        }
        // 스프라이트 프레임
        frameClock += dt;
        const frameDur = moving ? 0.05 : 0.09;
        if (frameClock > frameDur) { frameClock = 0; frame = (frame + 1) % 25; }
        const tex = moving ? walkTex : idleTex;
        if (playerMat.map !== tex) { playerMat.map = tex; playerMat.needsUpdate = true; }
        tex.offset.x = frame / 25;
        player.position.set(pos.x, 1.2 + (moving ? Math.abs(Math.sin(clock.elapsedTime * 10)) * 0.12 : 0), pos.z);
        shadow.position.set(pos.x, 0.03, pos.z);

        // 카메라: 달그락 뒤 조금 위에서 (3인칭, 가까이)
        const back = { x: Math.sin(heading) * 8.5, z: -Math.cos(heading) * 8.5 };
        camPos.set(pos.x + back.x, 6, pos.z + back.z);
        camera.position.lerp(camPos, 0.12);
        if (topView) camera.position.set(0, 62, 18);
        if (topView) camera.lookAt(0, 0, -14); else camera.lookAt(pos.x - back.x * 0.25, 1.2, pos.z - back.z * 0.25);
        hallLabel.visible = Math.hypot(pos.x, pos.z) > 7;
        for (const t of nameTags) { const d = Math.hypot(t.x - pos.x, t.z - pos.z); t.s.visible = t.mine || d < 8; (t.s.material as T.SpriteMaterial).opacity = t.mine ? 1 : Math.max(0, Math.min(1, (8 - d) / 3)); }
        for (const t of signs) { const d = Math.hypot(t.x - pos.x, t.z - pos.z); (t.s.material as T.SpriteMaterial).opacity = Math.max(0.15, Math.min(1, (d - 2) / 4)); }

        for (const f of flames) f.mesh.position.y = f.base + Math.sin(clock.elapsedTime * 3 + f.phase) * 0.08;
        for (const w of wisps) { w.a += w.s * dt; w.m.position.set(Math.cos(w.a) * w.r, w.y + Math.sin(clock.elapsedTime + w.r) * 0.4, Math.sin(w.a) * w.r * 0.9 - 8); }

        // 가까운 집·본관
        let best: Spot | null = null, bestD = 3.4;
        for (const s of spots) { const d = Math.hypot(s.x - pos.x, s.z - pos.z) - (s.hall ? 3 : 0); if (d < bestD) { bestD = d; best = s; } }
        if (best !== lastNear) { lastNear = best; setNear(best); }

        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      tick();
      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("resize", onResize);
        renderer.dispose(); el.removeChild(renderer.domElement);
      };
    })().catch(() => setFailed(true));
    return () => { disposed = true; cleanup(); };
  }, [houses, villages, hallStage, hallPct, myForgeId]);

  // 화면 스틱 (폰)
  const pad = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  function move(e: React.PointerEvent) {
    const r = pad.current!.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    stick.current = { x: dx, y: dy, active: true };
    if (knob.current) knob.current.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
  }
  function end() {
    stick.current = { x: 0, y: 0, active: false };
    if (knob.current) knob.current.style.transform = "translate(0,0)";
  }

  if (failed) return (
    <div className="world-fallback">
      <p>이 기기에서는 3D 마을을 열 수 없어. 지도로 볼래?</p>
      <a className="btn btn-fire" href="/find/village" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>마을 지도로 보기</a>
    </div>
  );

  return (
    <div className="world">
      <div className="world-canvas" ref={mount} />
      {hint && <div className="world-hint">왼쪽 아래 동그라미를 밀어서 걸어봐 · 키보드는 W A S D</div>}
      <div className="world-pad" ref={pad} onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setHint(false); move(e); }} onPointerMove={(e) => { if (stick.current.active) move(e); }} onPointerUp={end} onPointerCancel={end}>
        <div className="world-knob" ref={knob} />
      </div>
      {near && (
        <a className="world-enter" href={near.hall ? "/find/village#hall" : `/f/${near.house!.id}`}>
          {near.hall ? "본관 공사장 보기" : `${near.label} 들어가기`}
        </a>
      )}
      <div className="world-top">
        <a href="/find">달그락 대장간</a>
        <span>
          <a href="/find/village">지도</a> · <a href="/find/home">내 집</a>
        </span>
      </div>
    </div>
  );
}
