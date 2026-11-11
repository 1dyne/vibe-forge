"use client";
import { useEffect, useRef, useState } from "react";
import type * as T from "three";
import { hueSpriteMaterial } from "../three-hue";
import { track } from "../track";
import { createVillageSound, type Ambience } from "./world-sound";
import { RopeSheet } from "../lantern-panel";
import type { LanternGroup } from "../../../lib/find/lantern";
import { buildWorld, PALETTE, START, villageCenter, type Phase, type Spot, type WorldHouse, type WorldVillage } from "./world-build";

// 걷는 도깨비 마을 (프로토타입). 가운데 본관 광장과 다섯 마을이 이어진 섬을 달그락이 걸어 다닌다.
// 땅·집은 로우폴리 3D, 캐릭터는 다인이 그린 스프라이트를 종이 인형처럼 세운다.

type Props = { houses: WorldHouse[]; villages: WorldVillage[]; hallStage: number; hallPct: number; myForgeId: string | null; myHue: number; lanterns: LanternGroup[] };

export default function WorldView({ houses, villages, hallStage, hallPct, myForgeId, myHue, lanterns }: Props) {
  const [rope, setRope] = useState<LanternGroup | null>(null);
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
      renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio));
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

      const world = buildWorld(three, scene, { houses, villages, hallStage, hallPct, myForgeId, hasForge: !!myForgeId, phase, lanterns });
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
      // ?house=집id (또는 me): 그 집 문 앞에 서서 집을 바라보며 시작
      const houseParam = new URLSearchParams(location.search).get("house");
      const target = houseParam ? world.spots.find((s) => s.kind === "house" && s.house!.id === (houseParam === "me" ? myForgeId : houseParam)) : null;
      if (target) {
        const v = world.villageAt(target.x, target.z);
        const c = v ? villageCenter(villages.indexOf(v)) : { x: 0, z: 0 };
        const dx = c.x - target.x, dz = c.z - target.z, len = Math.hypot(dx, dz) || 1;
        pos.x = target.x + (dx / len) * 4.2; pos.z = target.z + (dz / len) * 4.2;
        heading = Math.atan2(dx / len, -(dz / len));
      } else if (process.env.NODE_ENV !== "production" && new URLSearchParams(location.search).get("pos")) { // 개발 확인용 ?pos=x,z,heading
        const [px, pz, ph] = new URLSearchParams(location.search).get("pos")!.split(",").map(Number); pos.x = px; pos.z = pz; heading = ph || 0;
      } else if (atIdx >= 0) { const c = villageCenter(atIdx); const d = Number(new URLSearchParams(location.search).get("d") ?? 31); pos.x = Math.sin(c.a) * d; pos.z = -Math.cos(c.a) * d; heading = Math.PI + c.a; }
      let frame = 0, frameClock = 0, lastNear: Spot | null = null, lastVillage: WorldVillage | null = null;
      const clock = new three.Clock();
      const camPos = new three.Vector3();
      const eye = new three.Vector3(), toCam = new three.Vector3(), camRay = new three.Raycaster();
      camRay.camera = camera; // 불빛 스프라이트도 부딪힘 검사에 걸리므로 카메라가 필요
      // 개발 확인용 하늘 시점 (배포본에는 없음)
      const topView = process.env.NODE_ENV !== "production" && new URLSearchParams(location.search).has("top");
      if (topView) scene.fog = null;
      let first = true;

      const tick = () => {
        const dt = Math.min(0.05, clock.getDelta());
        const t = clock.elapsedTime;
        let fwd = stick.current.active ? -stick.current.y : 0;
        let turn = stick.current.active ? stick.current.x : 0;
        if (keys.has("w") || keys.has("arrowup")) fwd = 1;
        if (keys.has("s") || keys.has("arrowdown")) fwd = -1;
        if (keys.has("a") || keys.has("arrowleft")) turn = -1;
        if (keys.has("d") || keys.has("arrowright")) turn = 1;
        heading += turn * dt * 1.9;
        const moving = Math.abs(fwd) > 0.08;
        if (moving) {
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
        const v = world.placeAt(pos.x, pos.z);
        if (v !== lastVillage) { lastVillage = v; setHere(v); }

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
  }, [houses, villages, hallStage, hallPct, myForgeId, myHue, lanterns]);

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

  if (failed) return (
    <div className="world-fallback">
      <p>이 기기에서는 3D 마을을 열 수 없어. 지도로 볼래?</p>
      <a className="btn btn-fire" href="/find/map" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>마을 지도로 보기</a>
    </div>
  );

  const enterHref = near ? (near.kind === "hall" ? "/find/map#hall" : near.kind === "plot" ? "/find" : near.house ? `/f/${near.house.id}` : "") : "";
  const enterText = near ? (near.kind === "hall" ? "본관 게시판 보기" : near.kind === "plot" ? "내 도깨비불 찾고 여기 입주하기" : `${near.label} 들어가기`) : "";

  return (
    <div className="world">
      <div className="world-canvas" ref={mount} />
      {banner && (
        <div className="world-banner" key={banner.id}>
          <b>{banner.name}</b>
          <span>{banner.topics}</span>
        </div>
      )}
      {hint && !banner && <div className="world-hint">왼쪽 아래 동그라미를 밀어서 걸어봐 · 키보드는 W A S D</div>}
      <div className="world-pad" ref={pad} onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setHint(false); move(e); }} onPointerMove={(e) => { if (stick.current.active) move(e); }} onPointerUp={end} onPointerCancel={end}>
        <div className="world-knob" ref={knob} />
      </div>
      {near && near.kind === "rope" && <button type="button" className="world-enter" onClick={() => { setRope(lanterns.find((g) => g.key === near.group) ?? null); track("rope_open"); }}>소원 줄 보기</button>}
      {near && near.kind === "npc" && <div className="world-say" role="status"><b>{near.label}</b><span>{near.line}</span></div>}
      {near && near.kind !== "rope" && near.kind !== "npc" && <a className="world-enter" href={enterHref} onClick={() => track("world_house_enter", { kind: near.kind })}>{enterText}</a>}
      {rope && <RopeSheet group={rope} hasForge={Boolean(myForgeId)} onClose={() => setRope(null)} />}
      <div className="world-top">
        <a href="/find" className="world-brand">달그락</a>
        <span><button type="button" className="world-sound" onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? "소리 끄기" : "소리 켜기"}>{soundOn ? "소리 끔" : "소리"}</button><a href="/find/map">지도</a>{myForgeId ? <a href="/find/village?house=me">내 대장간</a> : <a href="/find">내 대장간 짓기</a>}</span>
      </div>
    </div>
  );
}
