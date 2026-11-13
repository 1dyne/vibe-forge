"use client";
import { useEffect, useRef, useState } from "react";
import type * as T from "three";
import { hueSpriteMaterial } from "../three-hue";
import { track } from "../track";
import { createVillageSound, type Ambience } from "./world-sound";
import { ERAS, ERA_R, ERA_RADIUS, eraCenter } from "./world-eras";
import { AllRopes, MyLanterns, RopeSheet } from "../lantern-panel";
import Kkachi from "../kkachi";
import type { LanternGroup } from "../../../lib/find/lantern";
import { buildWorld, PALETTE, START, villageCenter, type Phase, type Spot, type WorldHouse, type WorldVillage } from "./world-build";

// 걷는 달그락 마을 (프로토타입). 가운데 본관 광장과 다섯 마을이 이어진 섬을 달그락이 걸어 다닌다.
// 땅·집은 로우폴리 3D, 캐릭터는 다인이 그린 스프라이트를 종이 인형처럼 세운다.

type Props = { houses: WorldHouse[]; villages: WorldVillage[]; hallStage: number; hallPct: number; myForgeId: string | null; myHue: number; lanterns: LanternGroup[]; giwa?: number; myName?: string };

export default function WorldView({ houses, villages, hallStage, hallPct, myForgeId, myHue, lanterns, giwa = 0, myName = "" }: Props) {
  const [rope, setRope] = useState<LanternGroup | null>(null);
  const [ropes, setRopes] = useState(false);
  // 처음 들어온 사람에게 마을 구조를 알려주는 안내 (이 기기에서 한 번, ? 버튼으로 다시)
  const [tut, setTut] = useState<number | null>(null);
  useEffect(() => { try { if (!localStorage.getItem("village_tut_v1")) setTut(0); } catch { /* 저장소 막힘 */ } }, []);
  const endTut = () => { setTut(null); try { localStorage.setItem("village_tut_v1", "1"); } catch { /* 무시 */ } };
  // 내 등불 걸기 (호수 소원 줄에서): 내 등불·남은 개수·도깨비불 목록을 불러와 연다
  const [hang, setHang] = useState<null | { lanterns: import("../../../lib/find/lantern").LanternRecord[]; allowance: number; fires: Array<{ id: string; name: string }> }>(null);
  async function openHang() {
    const j = await fetch("/api/find/lantern").then((r) => r.json()).catch(() => null);
    if (!j?.mine) return;
    setRope(null); setRopes(false); setHang(j.mine); track("rope_open", { via: "hang" });
  }
  const mount = useRef<HTMLDivElement>(null);
  const stick = useRef({ x: 0, y: 0, active: false });
  const [near, setNear] = useState<Spot | null>(null);
  const [here, setHere] = useState<WorldVillage | null>(null);
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState(true);
  // 소리: 첫 터치 뒤에만 켤 수 있다(브라우저 규칙). 기본은 꺼짐
  const soundRef = useRef<{ night: boolean; amb: (x: number, z: number) => Ambience; pos?: { x: number; z: number } } | null>(null);
  const audio = useRef<ReturnType<typeof createVillageSound> | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  // 가벼운 모드: null = 자동, true/false = 직접 고름(이 기기에 기억)
  const lightRef = useRef<boolean | null>(null);
  const lightApply = useRef<((on: boolean) => void) | null>(null);
  const [lightOn, setLightState] = useState(false);
  const look = useRef({ dx: 0, id: -1, x: 0 });
  // 지형도: 지금 마을을 위에서 찍은 그림과 이름표 자리
  type MapShot = { url: string; hx: number; hz: number; me: { x: number; z: number }; tags: Array<{ id: string; name: string; x: number; z: number; kind: "village" | "era" | "hall" | "mine" }> };
  const shoot = useRef<(() => MapShot | null) | null>(null);
  const travel = useRef<((id: string) => void) | null>(null);
  const [mapShot, setMapShot] = useState<MapShot | null>(null);
  // 집 앞 화살표: 누르면 달그락이 문까지 걸어 들어간 뒤 그 대장간으로
  const walkIn = useRef<((sp: Spot, href: string) => void) | null>(null);
  const tapAt = useRef<((x: number, y: number) => boolean) | null>(null);
  const tap0 = useRef<{ x: number; y: number; t: number } | null>(null);
  if (typeof window !== "undefined" && lightRef.current === null) {
    try { const v = localStorage.getItem("find_world_light"); if (v === "1" || v === "0") lightRef.current = v === "1"; } catch {}
  }
  useEffect(() => {
    if (!soundOn) return;
    const id = window.setInterval(() => { const sr = soundRef.current; if (sr?.pos && audio.current) audio.current.setAmbience(sr.amb(sr.pos.x, sr.pos.z)); }, 300);
    return () => clearInterval(id);
  }, [soundOn]);
  useEffect(() => () => { audio.current?.close(); audio.current = null; }, []);
  function toggleSound() {
    if (!soundRef.current) return;
    if (!audio.current) { audio.current = createVillageSound(soundRef.current.night); }
    audio.current.resume();
    audio.current.setMuted(soundOn);
    setSoundOn(!soundOn);
    track("world_sound", { on: String(!soundOn) });
  }

  useEffect(() => { track("world_enter"); }, []);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};
    (async () => {
      const three = await import("three");
      if ("fonts" in document) await document.fonts.load("44px Jua").catch(() => {});
      if (disposed || !mount.current) return;
      let renderer: T.WebGLRenderer;
      try { renderer = new three.WebGLRenderer({ antialias: true }); } catch { setFailed(true); return; }
      const el = mount.current;
      // 가벼운 모드: 저사양 기기는 처음부터, 그 밖에는 프레임이 계속 떨어지면 자동으로 켠다
      const nav = navigator as Navigator & { deviceMemory?: number };
      const lowEnd = (nav.deviceMemory ?? 8) <= 3 || (navigator.hardwareConcurrency ?? 8) <= 4;
      let light = lightRef.current ?? lowEnd;
      const applyQuality = () => {
        renderer.setPixelRatio(light ? 1 : Math.min(1.75, window.devicePixelRatio));
        renderer.setSize(el.clientWidth, el.clientHeight);
        // 빛 번짐(가산 스프라이트)·물안개를 끈다. 이름표·간판은 그대로
        scene.traverse((o) => {
          const m = (o as T.Mesh).material as T.Material | undefined;
          if (m && !Array.isArray(m) && m.blending === three.AdditiveBlending) o.visible = !light;
        });
      };
      setLightState(light);
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.outputColorSpace = three.SRGBColorSpace;
      el.appendChild(renderer.domElement);

      const scene = new three.Scene();
      // 시간대: 늘 해 질 녘(각색), 실제 밤(19~5시)엔 밤. 하늘·안개·빛을 한 묶음으로 맞춘다
      const hourParam = process.env.NODE_ENV !== "production" ? new URLSearchParams(location.search).get("hour") : null; // 개발 확인용
      const hour = hourParam ? Number(hourParam) : new Date().getHours();
      const phase: Phase = hour >= 19 || hour < 5 ? "night" : "dusk";
      const pal = PALETTE[phase];
      scene.background = new three.Color(pal.fog);
      scene.fog = new three.Fog(pal.fog, pal.near, pal.far);
      const camera = new three.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 400);
      scene.add(new three.HemisphereLight(pal.hemi[0], pal.hemi[1], pal.hemi[2]));
      const sun = new three.DirectionalLight(pal.sun[0], pal.sun[1]);
      sun.position.set(-40, 18, -25); // 서쪽 낮은 해(달)
      scene.add(sun);

      const world = buildWorld(three, scene, { houses, villages, hallStage, hallPct, myForgeId, hasForge: !!myForgeId, phase, lanterns, giwa });
      applyQuality();
      lightApply.current = (on: boolean) => { light = on; lightRef.current = on; applyQuality(); setLightState(on); };
      soundRef.current = { night: phase === "night", amb: world.ambienceAt };

      // 마을의 기척: 1분 반마다 '지금 마을에 있는 집'을 받아 연기·창문 불빛을 바꾼다 (내 집도 '마을에 있음'으로 기록됨)
      const beat = async () => {
        if (document.visibilityState !== "visible") return;
        const res = await fetch("/api/find/presence", { method: "POST" }).catch(() => null);
        const json = res?.ok ? await res.json().catch(() => null) : null;
        if (json?.active) world.setActive(new Set<string>(json.active));
      };
      const beatId = window.setInterval(beat, 90_000);

      // ── 달그락 (스프라이트 종이 인형) ──
      const loader = new three.TextureLoader();
      const [idleTex, walkTex] = await Promise.all([loader.loadAsync("/find/sprites/idle.webp"), loader.loadAsync("/find/sprites/stoke.webp")]);
      for (const t of [idleTex, walkTex]) { t.colorSpace = three.SRGBColorSpace; t.repeat.set(1 / 25, 1); }
      const playerMat = hueSpriteMaterial(three, idleTex, myHue);
      const player = new three.Sprite(playerMat);
      player.scale.set(2.4, 2.4, 1);
      scene.add(player);
      const shadow = new three.Mesh(new three.CircleGeometry(0.6, 20), new three.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.18 }));
      shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
      const pos = { x: START.x, z: START.z };

      const keys = new Set<string>();
      const kd = (e: KeyboardEvent) => { keys.add(e.key.toLowerCase()); setHint(false); };
      const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
      window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
      const onResize = () => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); };
      window.addEventListener("resize", onResize);

      let heading = Math.PI; // 처음엔 북쪽(-z, 본관 방향)을 본다
      // 개발 확인용: ?at=마을id 로 그 마을 문 앞에서 시작
      const at = new URLSearchParams(location.search).get("at"); // ?at=마을id: 그 마을 문 앞에서 시작 (2D 지도에서 넘어올 때)
      const atIdx = villages.findIndex((v) => v.id === at);
      const atEra = ERAS.find((e) => e.id === at);
      // ?house=집id (또는 me): 그 집 문 앞에 서서 집을 바라보며 시작
      const houseParam = new URLSearchParams(location.search).get("house");
      const target = houseParam ? world.spots.find((s) => s.kind === "house" && s.house!.id === (houseParam === "me" ? myForgeId : houseParam)) : null;
      if (target) {
        const v = world.villageAt(target.x, target.z);
        const c = v ? villageCenter(villages.indexOf(v)) : { x: 0, z: 0 };
        const dx = c.x - target.x, dz = c.z - target.z, len = Math.hypot(dx, dz) || 1;
        pos.x = target.x + (dx / len) * 2.6; pos.z = target.z + (dz / len) * 2.6;
        heading = Math.atan2(dx / len, -(dz / len));
      } else if (process.env.NODE_ENV !== "production" && new URLSearchParams(location.search).get("pos")) { // 개발 확인용 ?pos=x,z,heading
        const [px, pz, ph] = new URLSearchParams(location.search).get("pos")!.split(",").map(Number); pos.x = px; pos.z = pz; heading = ph || 0;
      } else if (at === "wish") { // 소원 선착장에서 나왔을 때: 선착장 앞에서 마을 쪽을 바라보며
        const a0 = Math.PI - 0.42, d = 26; pos.x = Math.sin(a0) * d; pos.z = -Math.cos(a0) * d; heading = a0 + Math.PI;
      } else if (atEra) { // 시대 마을 입구 앞에서 그 마을을 바라보며
        const d = ERA_R - ERA_RADIUS - 4; pos.x = Math.sin(atEra.angle) * d; pos.z = -Math.cos(atEra.angle) * d; heading = Math.PI + atEra.angle;
      } else if (atIdx >= 0) { const c = villageCenter(atIdx); const d = Number(new URLSearchParams(location.search).get("d") ?? 31); pos.x = Math.sin(c.a) * d; pos.z = -Math.cos(c.a) * d; heading = Math.PI + c.a; }
      // 지형도에서 고른 곳 앞으로 옮겨 서기
      travel.current = (id: string) => {
        const e = ERAS.find((x) => x.id === id), vi = villages.findIndex((v) => v.id === id);
        const mine = id === "mine" ? world.spots.find((sp) => sp.kind === "house" && sp.house!.id === myForgeId) : null;
        if (mine) {
          const v = world.villageAt(mine.x, mine.z); const c = v ? villageCenter(villages.indexOf(v)) : { x: 0, z: 0 };
          const dx = c.x - mine.x, dz = c.z - mine.z, len = Math.hypot(dx, dz) || 1;
          pos.x = mine.x + (dx / len) * 2.6; pos.z = mine.z + (dz / len) * 2.6; heading = Math.atan2(dx / len, -(dz / len));
        } else if (e) { const d = ERA_R - ERA_RADIUS - 4; pos.x = Math.sin(e.angle) * d; pos.z = -Math.cos(e.angle) * d; heading = Math.PI + e.angle; }
        else if (vi >= 0) { const c = villageCenter(vi); pos.x = Math.sin(c.a) * 31; pos.z = -Math.cos(c.a) * 31; heading = Math.PI + c.a; }
        else if (id === "wish") { const a0 = Math.PI - 0.42; pos.x = Math.sin(a0) * 24.5; pos.z = -Math.cos(a0) * 24.5; heading = a0; }
        else { pos.x = 0; pos.z = 24; heading = Math.PI; }
        first = true;
      };
      // 지형도 찍기: 같은 장면을 위에서 정사영으로 한 번 그려 이미지로 받고, 바로 원래 화면을 다시 그린다
      shoot.current = () => {
        const w = el.clientWidth, h = el.clientHeight, asp = w / h, hx = asp >= 1 ? 122 * asp : 122, hz = asp >= 1 ? 122 : 122 / asp; // 가로 화면에서도 섬 전체가 들어오게
        const oc = new three.OrthographicCamera(-hx, hx, hz, -hz, 1, 600);
        oc.position.set(0, 320, 0); oc.up.set(0, 0, -1); oc.lookAt(0, 0, 0);
        const hidden: T.Object3D[] = [];
        scene.traverse((o) => { if ((o as T.Sprite).isSprite && o.visible) { o.visible = false; hidden.push(o); } });
        const sky = scene.getObjectByName("sky"); if (sky) { sky.visible = false; hidden.push(sky); }
        const fog = scene.fog, bg = scene.background; scene.fog = null; scene.background = new three.Color("#2E4A5E"); // 섬 바깥은 바다색
        // 지형도는 선명하게: 잠깐 2배 해상도로 찍는다
        const ratio = renderer.getPixelRatio(); renderer.setPixelRatio(2); renderer.setSize(w, h);
        let url = "";
        try { renderer.render(scene, oc); url = renderer.domElement.toDataURL("image/jpeg", 0.85); } catch { url = ""; }
        renderer.setPixelRatio(ratio); renderer.setSize(w, h);
        scene.fog = fog; scene.background = bg; for (const o of hidden) o.visible = true;
        renderer.render(scene, camera);
        if (!url) return null;
        const tags: MapShot["tags"] = [
          { id: "hall", name: "본관", x: 0, z: 0, kind: "hall" },
          ...villages.map((v, i) => { const c = villageCenter(i); return { id: v.id, name: v.name, x: c.x, z: c.z, kind: "village" as const }; }),
          ...ERAS.map((e) => { const c = eraCenter(e); return { id: e.id, name: e.name, x: c.x, z: c.z, kind: "era" as const }; })
        ];
        { const a0 = Math.PI - 0.42; tags.push({ id: "wish", name: "소원 선착장", x: Math.sin(a0) * 22, z: -Math.cos(a0) * 22, kind: "hall" }); }
        const mine = world.spots.find((sp) => sp.kind === "house" && sp.house!.id === myForgeId);
        if (mine) tags.push({ id: "mine", name: "내 대장간", x: mine.x, z: mine.z, kind: "mine" });
        return { url, hx, hz, me: { x: pos.x, z: pos.z }, tags };
      };
      let frame = 0, frameClock = 0, lastNear: Spot | null = null, lastVillage: WorldVillage | null = null;
      const clock = new three.Clock();
      const camPos = new three.Vector3();
      const eye = new three.Vector3(), toCam = new three.Vector3(), camRay = new three.Raycaster();
      camRay.camera = camera; // 불빛 스프라이트도 부딪힘 검사에 걸리므로 카메라가 필요
      // 개발 확인용 하늘 시점 (배포본에는 없음)
      const topView = process.env.NODE_ENV !== "production" && new URLSearchParams(location.search).has("top");
      if (topView) scene.fog = null;
      let first = true, slowAcc = 0, fpsSent = false; const frames: number[] = [];
      let auto: { x: number; z: number; href: string; gone?: boolean } | null = null;
      // 문 위에서 통통 튀는 화살표 (집·본관·빈 터 가까이 가면)
      const arrowG = new three.Group(); scene.add(arrowG); arrowG.visible = false;
      { const cone = new three.Mesh(new three.ConeGeometry(0.45, 0.8, 4), new three.MeshBasicMaterial({ color: "#FF8F3F" })); cone.rotation.x = Math.PI; arrowG.add(cone);
        const hitBall = new three.Mesh(new three.SphereGeometry(1.2, 8, 6), new three.MeshBasicMaterial({ visible: false })); arrowG.add(hitBall); }
      walkIn.current = (sp, href) => { if (!auto) auto = { x: sp.x, z: sp.z, href }; track("world_house_enter", { kind: sp.kind, via: "arrow" }); };
      tapAt.current = (cx, cy) => {
        if (!arrowG.visible || !lastNear) return false;
        const r = renderer.domElement.getBoundingClientRect();
        const ndc = new three.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
        const rc = new three.Raycaster(); rc.setFromCamera(ndc, camera);
        if (!rc.intersectObject(arrowG, true).length) return false;
        const sp = lastNear; const href = sp.kind === "wish" ? "/find/wish" : sp.kind === "hall" ? "/find/map#hall" : sp.kind === "plot" ? "/find" : sp.house ? `/f/${sp.house.id}` : "";
        if (href) walkIn.current?.(sp, href);
        return Boolean(href);
      };

      const tick = () => {
        const dt = Math.min(0.05, clock.getDelta());
        const t = clock.elapsedTime;
        let fwd = stick.current.active ? -stick.current.y : 0;
        let turn = stick.current.active ? stick.current.x : 0;
        if (keys.has("w") || keys.has("arrowup")) fwd = 1;
        if (keys.has("s") || keys.has("arrowdown")) fwd = -1;
        if (keys.has("a") || keys.has("arrowleft")) turn = -1;
        if (keys.has("d") || keys.has("arrowright")) turn = 1;
        if (auto) { // 문으로 걸어 들어가는 중: 조작은 잠깐 멈춘다
          const dx = auto.x - pos.x, dz = auto.z - pos.z, L = Math.hypot(dx, dz);
          heading = Math.atan2(-dx, dz); fwd = L > 0.5 ? 1 : 0; turn = 0;
          if (L <= 0.5 && !auto.gone) { auto.gone = true; const h = auto.href; setTimeout(() => { window.location.href = h; }, 150); }
        }
        heading += turn * dt * 1.9;
        const moving = Math.abs(fwd) > 0.08;
        if (moving && auto) { const step = Math.min(7 * dt, Math.hypot(auto.x - pos.x, auto.z - pos.z)); pos.x -= Math.sin(heading) * step; pos.z += Math.cos(heading) * step; }
        else if (moving) {
          const step = 7 * fwd * dt;
          const nx = pos.x - Math.sin(heading) * step, nz = pos.z + Math.cos(heading) * step;
          if (world.walkable(nx, nz)) { pos.x = nx; pos.z = nz; }
          else if (world.walkable(nx, pos.z)) pos.x = nx;
          else if (world.walkable(pos.x, nz)) pos.z = nz;
        }
        const ground = world.heightAt(pos.x, pos.z);
        frameClock += dt;
        if (frameClock > (moving ? 0.05 : 0.09)) { frameClock = 0; frame = (frame + 1) % 25; }
        const tex = moving ? walkTex : idleTex;
        if (playerMat.map !== tex) { playerMat.map = tex; playerMat.needsUpdate = true; }
        tex.offset.x = frame / 25;
        player.position.set(pos.x, ground + 1.2 + (moving ? Math.abs(Math.sin(t * 10)) * 0.12 : 0), pos.z);
        shadow.position.set(pos.x, ground + 0.04, pos.z);
        world.player.x = pos.x; world.player.z = pos.z;
        if (soundRef.current && !soundRef.current.pos) soundRef.current.pos = pos;

        const back = { x: Math.sin(heading) * 8.5, z: -Math.cos(heading) * 8.5 };
        camPos.set(pos.x + back.x, ground + 5.6, pos.z + back.z);
        // 달그락과 카메라 사이를 큰 것이 가리면 카메라를 그 앞으로 당긴다
        eye.set(pos.x, ground + 1.6, pos.z);
        toCam.subVectors(camPos, eye); const full = toCam.length(); toCam.normalize();
        camRay.set(eye, toCam); camRay.far = full;
        const near = world.occluders.filter((o) => Math.hypot(o.position.x - pos.x, o.position.z - pos.z) < full + 6);
        const hitCam = camRay.intersectObjects(near, true)[0];
        if (hitCam) {
          // 너무 가까이 붙지 않게: 3.4보다 가까워지면 대신 위로 올라가 내려다본다
          const d = hitCam.distance - 0.4;
          camPos.copy(eye).addScaledVector(toCam, Math.max(3.4, d));
          if (d < 3.4) camPos.y += (3.4 - d) * 1.6;
        }
        const camGround = world.heightAt(camPos.x, camPos.z);
        if (camPos.y < camGround + 2) camPos.y = camGround + 2;
        if (first) { camera.position.copy(camPos); first = false; } else camera.position.lerp(camPos, 0.12);
        if (topView) { camera.position.set(0, 120, 60); camera.lookAt(0, 0, 0); }
        else camera.lookAt(pos.x - back.x * 0.25, ground + 1.2, pos.z - back.z * 0.25);

        for (const fn of world.anim) fn(t, dt);
        for (const f of world.fades) {
          // 카메라와 달그락 사이를 가리면 반투명
          const cx = camera.position.x, cz = camera.position.z, dx = pos.x - cx, dz = pos.z - cz;
          const k = Math.max(0, Math.min(1, ((f.x - cx) * dx + (f.z - cz) * dz) / (dx * dx + dz * dz)));
          const d = Math.hypot(f.x - (cx + dx * k), f.z - (cz + dz * k));
          const o = Math.max(0.15, Math.min(1, (d - 2.2) / 2));
          for (const m of f.mats) m.opacity = o;
        }
        for (const tag of world.nameTags) {
          const d = Math.hypot(tag.x - pos.x, tag.z - pos.z);
          tag.s.visible = tag.always || d < 9;
          (tag.s.material as T.SpriteMaterial).opacity = tag.always ? 1 : Math.max(0, Math.min(1, (9 - d) / 3));
        }

        let best: Spot | null = null, bestD = Infinity;
        for (const s of world.spots) { const d = Math.hypot(s.x - pos.x, s.z - pos.z); if (d < s.r && d < bestD) { bestD = d; best = s; } }
        if (best && best.kind === "plot" && myForgeId) best = null;
        if (best !== lastNear) { lastNear = best; setNear(best); }
        if (lastNear && (lastNear.kind === "house" || lastNear.kind === "hall" || lastNear.kind === "plot" || lastNear.kind === "wish")) {
          arrowG.visible = true; arrowG.position.set(lastNear.x, world.heightAt(lastNear.x, lastNear.z) + 2.6 + Math.abs(Math.sin(t * 3)) * 0.4, lastNear.z); arrowG.rotation.y = t;
        } else arrowG.visible = false;
        const v = world.placeAt(pos.x, pos.z);
        if (v !== lastVillage) { lastVillage = v; setHere(v); }

        if (!light && lightRef.current === null) { // 사용자가 직접 고르지 않았을 때만 자동
          slowAcc = slowAcc * 0.98 + (dt > 1 / 28 ? 1 : 0) * 0.02;
          if (t > 4 && slowAcc > 0.6) { lightApply.current?.(true); lightRef.current = null; track("world_quality", { auto: "light" }); }
        }
        // 실제 폰에서 얼마나 부드러운지 한 번만 기록 (2~12초 구간 중앙값, 개인 정보 없음)
        if (!fpsSent) {
          if (t > 2) frames.push(dt);
          if (t > 12 && frames.length > 20) {
            fpsSent = true; const sorted = frames.slice().sort((a, b) => a - b); const fps = Math.round(1 / sorted[Math.floor(sorted.length / 2)]);
            track("world_fps", { fps: String(fps), light: String(light), mem: String(nav.deviceMemory ?? "?"), cores: String(navigator.hardwareConcurrency ?? "?"), dpr: String(Math.round(window.devicePixelRatio * 10) / 10) });
          }
        }
        // 화면 끌어서 둘러보기
        if (look.current.dx) { heading += look.current.dx * 0.006; look.current.dx = 0; }
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      tick();
      cleanup = () => {
        cancelAnimationFrame(raf);
        clearInterval(beatId);
        window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("resize", onResize);
        renderer.dispose(); el.removeChild(renderer.domElement);
      };
    })().catch((e) => { console.error("3D 장면을 만들지 못함", e); setFailed(true); });
    return () => { disposed = true; cleanup(); };
  }, [houses, villages, hallStage, hallPct, myForgeId, myHue, lanterns, giwa]);

  // 마을에 들어서면 이름표를 잠깐 띄운다
  const [banner, setBanner] = useState<WorldVillage | null>(null);
  useEffect(() => {
    if (!here) return;
    setBanner(here);
    const id = setTimeout(() => setBanner(null), 3500);
    return () => clearTimeout(id);
  }, [here]);

  const pad = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  function move(e: React.PointerEvent) {
    const r = pad.current!.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    stick.current = { x: dx, y: dy, active: true };
    if (knob.current) knob.current.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
  }
  function end() {
    stick.current = { x: 0, y: 0, active: false };
    if (knob.current) knob.current.style.transform = "translate(0,0)";
  }

  function openMap() {
    const m = shoot.current?.();
    if (m) { setMapShot(m); track("world_map_open"); } else window.location.href = "/find/map";
  }
  function goMap(id: string) { travel.current?.(id); setMapShot(null); track("world_map_travel", { to: id }); }

  function toggleLight() {
    const on = !lightOn;
    try { localStorage.setItem("find_world_light", on ? "1" : "0"); } catch {}
    lightApply.current?.(on);
    track("world_quality", { manual: on ? "light" : "full" });
  }

  if (failed) return (
    <div className="world-fallback">
      <p>이 기기에서는 3D 마을을 열 수 없어. 본관 게시판은 볼 수 있어.</p>
      <a className="btn btn-fire" href="/find/map" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>본관 게시판 보기</a>
    </div>
  );

  const enterHref = near ? (near.kind === "wish" ? "/find/wish" : near.kind === "hall" ? "/find/map#hall" : near.kind === "plot" ? "/find" : near.house ? `/f/${near.house.id}` : "") : "";
  const enterText = near ? (near.kind === "wish" ? "소원 선착장 들어가기" : near.kind === "hall" ? "본관 게시판 보기" : near.kind === "plot" ? "내 도깨비불 찾고 여기 입주하기" : `${near.label} 들어가기`) : "";

  return (
    <div className="world">
      <div className="world-canvas" ref={mount}
        onPointerDown={(e) => { tap0.current = { x: e.clientX, y: e.clientY, t: Date.now() }; if (look.current.id !== -1) return; look.current.id = e.pointerId; look.current.x = e.clientX; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setHint(false); }}
        onPointerMove={(e) => { if (e.pointerId !== look.current.id) return; look.current.dx += e.clientX - look.current.x; look.current.x = e.clientX; }}
        onPointerUp={(e) => { if (e.pointerId === look.current.id) look.current.id = -1; const t0 = tap0.current; tap0.current = null; if (t0 && Math.hypot(e.clientX - t0.x, e.clientY - t0.y) < 10 && Date.now() - t0.t < 500) tapAt.current?.(e.clientX, e.clientY); }}
        onPointerCancel={(e) => { if (e.pointerId === look.current.id) look.current.id = -1; }} />
      {banner && (
        <div className="world-banner" key={banner.id}>
          <b>{banner.name}</b>
          <span>{banner.topics}</span>
        </div>
      )}
      {hint && !banner && <div className="world-hint">왼쪽 아래 동그라미로 걷고, 화면을 끌어서 둘러봐 · 키보드는 W A S D</div>}
      <div className="world-pad" ref={pad} onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setHint(false); move(e); }} onPointerMove={(e) => { if (stick.current.active) move(e); }} onPointerUp={end} onPointerCancel={end}>
        <div className="world-knob" ref={knob} />
      </div>
      {near && near.kind === "rope" && <a className="world-enter" href="/find/wish" onClick={() => track("rope_open", { via: "to-wish" })}>↓ 소원 선착장에서 보기</a>}
      {near && near.kind === "npc" && <div className="world-say" role="status"><b>{near.label}</b><span>{near.line}</span></div>}
      {near && near.kind !== "rope" && near.kind !== "npc" && <a className="world-enter" href={enterHref} onClick={(e) => { if (walkIn.current && enterHref) { e.preventDefault(); walkIn.current(near, enterHref); } }}>↓ {enterText}</a>}
      {tut !== null && (() => {
        const who = myName && myName !== "이름 없는 도깨비" ? myName : "너";
        const T = [
          { t: `달그락 마을에 온 걸 환영해${who !== "너" ? `, ${who}` : ""}!`, b: "가운데 호수 섬에 본관이 있고, 둘레에 다섯 마을이 있어. 마을마다 비슷한 아이디어를 가진 대장간들이 모여 살아. 마을에 들어서면 위에 어떤 아이디어가 모인 마을인지 떠." },
          { t: "도깨비는 어디서 왔을까", b: `오래 쓰인 물건에는 도깨비가 깃든대. 부싯돌, 측우기, 금속활자, 다이얼 전화기… 사람들의 삶을 바꾼 물건과 기술이 도깨비가 돼서 돌아다녀. 가까이 가면 말을 걸어. ${who}가 아는 도깨비도 있는지 찾아봐. 섬 바깥 은빛 언덕·꼼지락 골목·와글 뒷산엔 더 오래된 도깨비들이 살아.` },
          { t: "왜 사람은 안 보여?", b: `${who === "너" ? "너" : who}도, 대장간 주인들도 다 사람이야. 그런데 여긴 도깨비 마을이라 사람은 눈에 안 보여. 대신 굴뚝 연기와 창에 비치는 불빛으로 방금 누가 다녀갔는지 알 수 있어. 집 가까이 가면 문 위에 주황 화살표가 떠. 누르면 그 대장간에 놀러 가서 장작을 넣어주고 '갖고 싶어'를 남길 수 있어.` },
          { t: "대장장이 dyne과 까치", b: "마을 한가운데 본관 대장간에는 도깨비들이랑 같이 노는 대장장이 dyne이 있어. 이 달그락 대장간을 만드는 사람이야. 대장간과 마을의 새 소식은 왼쪽 위 까치가 물어다 줘. dyne한테 하고 싶은 말이나 고장 신고도 까치를 누르면 바로 보낼 수 있어." },
          { t: "소원은 소원 선착장에서", b: "호숫가 소원 선착장에 들어가면 같은 소원끼리 걸린 등불을 보고, 응원하고, 내 등도 달 수 있어. 위쪽 '지도'를 누르면 어디든 바로 갈 수 있고, '내 대장간'은 내 집 앞으로 데려다줘." },
        ];
        const c = T[tut]; const last = tut === T.length - 1;
        return (
          <div className="world-tut" role="dialog" aria-label="마을 안내">
            <div className="world-tut-card">
              <small>{tut + 1} / {T.length}</small>
              <b>{c.t}</b>
              <p>{c.b}</p>
              <div className="world-tut-row"><button type="button" onClick={endTut}>건너뛰기</button><button type="button" className="go" onClick={() => (last ? endTut() : setTut(tut + 1))}>{last ? "둘러보기" : "다음"}</button></div>
            </div>
          </div>
        );
      })()}
      {mapShot && (
        <div className="world-map" role="dialog" aria-label="마을 지형도">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mapShot.url} alt="" />
          {mapShot.tags.map((t) => (
            <button key={t.id} type="button" className={`map-tag ${t.kind}`} style={{ left: `${(t.x / mapShot.hx + 1) * 50}%`, top: `${(t.z / mapShot.hz + 1) * 50}%` }} onClick={() => goMap(t.id)} aria-label={t.name}>{t.kind === "mine" ? "" : t.name}</button>
          ))}
          <i className="map-me" style={{ left: `${(mapShot.me.x / mapShot.hx + 1) * 50}%`, top: `${(mapShot.me.z / mapShot.hz + 1) * 50}%` }} />
          <div className="map-head"><span>달그락 마을 지형도</span><button type="button" onClick={() => setMapShot(null)}>닫기</button></div>
          <div className="map-foot"><a className="map-ropes" href="/find/wish">소원 선착장으로</a><br />이름을 누르면 그 앞으로 바로 가{mapShot.tags.some((t) => t.kind === "mine") ? " · 주황 깃발이 내 대장간" : ""} · <a href="/find/map" style={{ color: "#FFD27A" }}>본관 게시판</a></div>
        </div>
      )}
      {rope && <RopeSheet group={rope} hasForge={Boolean(myForgeId)} onHang={myForgeId ? openHang : undefined} onClose={() => setRope(null)} />}
      {ropes && <AllRopes groups={lanterns} onPick={(g) => { setRopes(false); setRope(g); }} onHang={myForgeId ? openHang : undefined} onClose={() => setRopes(false)} />}
      {hang && <MyLanterns initial={hang.lanterns} allowance={hang.allowance} fires={hang.fires} onClose={() => setHang(null)} />}
      <div className="world-top">
        <span className="world-left"><Kkachi where="village" onTutorial={() => setTut(0)} /><a href="/find" className="world-brand">달그락</a></span>
        <span><button type="button" className="world-sound" onClick={toggleLight} aria-pressed={lightOn} title="느린 폰이면 켜줘">{lightOn ? "가볍게 ✓" : "가볍게"}</button><button type="button" className="world-sound" onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? "소리 끄기" : "소리 켜기"}>{soundOn ? "소리 끔" : "소리"}</button><button type="button" className="world-sound" onClick={openMap}>지도</button>{myForgeId ? <a href="/find/village?house=me">내 대장간</a> : <a href="/find">내 대장간 짓기</a>}</span>
      </div>
    </div>
  );
}
