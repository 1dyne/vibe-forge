"use client";
import { useEffect, useRef, useState } from "react";
import type * as T from "three";
import { buildWorld, villageCenter, type Spot, type WorldHouse, type WorldVillage } from "./world-build";

// 걷는 도깨비 마을 (프로토타입). 가운데 본관 광장과 다섯 마을이 이어진 섬을 달그락이 걸어 다닌다.
// 땅·집은 로우폴리 3D, 캐릭터는 다인이 그린 스프라이트를 종이 인형처럼 세운다.

type Props = { houses: WorldHouse[]; villages: WorldVillage[]; alleyNames: Record<string, string>; hallStage: number; hallPct: number; myForgeId: string | null };

export default function WorldView({ houses, villages, alleyNames, hallStage, hallPct, myForgeId }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const stick = useRef({ x: 0, y: 0, active: false });
  const [near, setNear] = useState<Spot | null>(null);
  const [here, setHere] = useState<WorldVillage | null>(null);
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState(true);

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
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.outputColorSpace = three.SRGBColorSpace;
      el.appendChild(renderer.domElement);

      const scene = new three.Scene();
      scene.background = new three.Color("#CFE9F1");
      scene.fog = new three.Fog("#CFE9F1", 35, 110);
      const camera = new three.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 0.1, 300);
      scene.add(new three.HemisphereLight("#ffffff", "#A9CF9A", 1.15));
      const sun = new three.DirectionalLight("#fff3dd", 1.5);
      sun.position.set(30, 40, 12);
      scene.add(sun);

      const world = buildWorld(three, scene, { houses, villages, alleyNames, hallStage, hallPct, myForgeId, hasForge: !!myForgeId });

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
      const playerMat = new three.SpriteMaterial({ map: idleTex, transparent: true });
      const player = new three.Sprite(playerMat);
      player.scale.set(2.4, 2.4, 1);
      scene.add(player);
      const shadow = new three.Mesh(new three.CircleGeometry(0.6, 20), new three.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.18 }));
      shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
      const pos = { x: 0, z: 11 };

      const keys = new Set<string>();
      const kd = (e: KeyboardEvent) => { keys.add(e.key.toLowerCase()); setHint(false); };
      const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
      window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
      const onResize = () => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); };
      window.addEventListener("resize", onResize);

      let heading = Math.PI; // 처음엔 북쪽(-z, 본관 방향)을 본다
      // 개발 확인용: ?at=마을id 로 그 마을 문 앞에서 시작
      const at = process.env.NODE_ENV !== "production" ? new URLSearchParams(location.search).get("at") : null;
      const atIdx = villages.findIndex((v) => v.id === at);
      if (atIdx >= 0) { const c = villageCenter(atIdx); const d = Number(new URLSearchParams(location.search).get("d") ?? 21); pos.x = Math.sin(c.a) * d; pos.z = -Math.cos(c.a) * d; heading = Math.PI + c.a; }
      let frame = 0, frameClock = 0, lastNear: Spot | null = null, lastVillage: WorldVillage | null = null;
      const clock = new three.Clock();
      const camPos = new three.Vector3();
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

        const back = { x: Math.sin(heading) * 8.5, z: -Math.cos(heading) * 8.5 };
        camPos.set(pos.x + back.x, ground + 5.6, pos.z + back.z);
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
        const v = world.villageAt(pos.x, pos.z);
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
    })().catch(() => setFailed(true));
    return () => { disposed = true; cleanup(); };
  }, [houses, villages, alleyNames, hallStage, hallPct, myForgeId]);

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
      <a className="btn btn-fire" href="/find/village" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>마을 지도로 보기</a>
    </div>
  );

  const enterHref = near ? (near.kind === "hall" ? "/find/village#hall" : near.kind === "plot" ? "/find" : `/f/${near.house!.id}`) : "";
  const enterText = near ? (near.kind === "hall" ? "본관 공사장 보기" : near.kind === "plot" ? "내 도깨비불 찾고 여기 입주하기" : `${near.label} 들어가기`) : "";

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
      {near && <a className="world-enter" href={enterHref}>{enterText}</a>}
      <div className="world-top">
        <a href="/find">달그락 대장간</a>
        <span><a href="/find/village">지도</a><a href="/find/home">내 집</a></span>
      </div>
    </div>
  );
}
