"use client";
import { useEffect, useRef } from "react";
import type * as T from "three";

// 완성품 미리보기를 달그락 마을과 같은 로우폴리 3D로 그린다.
// 입력은 SVG 목업과 같은 mm 단위 도형 목록이다 (z가 위, 도형·부품 position의 z는 바닥 높이, 겉 표시는 중심).
export type MockSolid = {
  primitive: "box" | "sphere" | "cylinder" | "cone";
  size: [number, number, number];
  /** 바닥 중심 (mm, z-up) */
  base: [number, number, number];
  color: string;
  role: "shell" | "feature" | "internal";
  label: string;
};

export default function Mockup3D({ solids, inside, zoom, resetKey, onFail }: { solids: MockSolid[]; inside: boolean; zoom: number; resetKey: number; onFail: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const api = useRef<{ setInside: (v: boolean) => void; setZoom: (z: number) => void; reset: () => void } | null>(null);
  const insideRef = useRef(inside); insideRef.current = inside;
  const zoomRef = useRef(zoom); zoomRef.current = zoom;

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const three = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const el = mount.current;
      if (disposed || !el) return;
      let renderer: T.WebGLRenderer;
      try { renderer = new three.WebGLRenderer({ antialias: true, alpha: true }); } catch { onFail(); return; }
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.outputColorSpace = three.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = three.PCFSoftShadowMap;
      el.appendChild(renderer.domElement);
      renderer.domElement.setAttribute("aria-label", "드래그로 돌려보는 완성품 3D 미리보기");

      const scene = new three.Scene();
      const disposables: Array<{ dispose: () => void }> = [];
      // mm(z-up) → three(y-up). 앞면(+y)이 카메라 쪽(+z)을 보게 한다.
      const toV = (x: number, y: number, z: number) => new three.Vector3(x, z, y);

      // 크기에 맞춰 카메라 거리를 잡는다
      const box3 = new three.Box3();
      for (const s of solids) {
        const [sx, sy, sz] = s.size; const [bx, by, bz] = s.base;
        box3.expandByPoint(toV(bx - sx / 2, by - sy / 2, bz)); box3.expandByPoint(toV(bx + sx / 2, by + sy / 2, bz + sz));
      }
      if (box3.isEmpty()) box3.set(new three.Vector3(-20, 0, -20), new three.Vector3(20, 40, 20));
      const center = box3.getCenter(new three.Vector3());
      const radius = Math.max(20, box3.getSize(new three.Vector3()).length() / 2);

      const camera = new three.PerspectiveCamera(35, el.clientWidth / el.clientHeight, radius / 50, radius * 40);
      const home = () => {
        const d = radius * 3.1 / zoomRef.current;
        camera.position.set(center.x + d * 0.62, center.y + d * 0.5, center.z + d * 0.62);
        controls.target.copy(center); controls.update();
      };
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true; controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.minDistance = radius * 1.2; controls.maxDistance = radius * 8;
      controls.autoRotate = true; controls.autoRotateSpeed = 0.9;
      controls.addEventListener("start", () => { controls.autoRotate = false; });
      home();

      // 빛: 마을처럼 부드러운 하늘빛 + 한쪽 햇빛
      scene.add(new three.HemisphereLight("#FFF6E8", "#B9C7C2", 1.6));
      const sun = new three.DirectionalLight("#FFFFFF", 1.7);
      sun.position.set(center.x + radius * 2, center.y + radius * 4, center.z + radius * 3);
      sun.target.position.copy(center); scene.add(sun.target);
      sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
      const sc = sun.shadow.camera as T.OrthographicCamera; sc.left = sc.bottom = -radius * 1.6; sc.right = sc.top = radius * 1.6; sc.near = radius * 0.5; sc.far = radius * 12;
      sun.shadow.bias = -0.0005;
      scene.add(sun);

      // 바닥: 둥근 받침 + 그림자
      const ground = new three.Mesh(new three.CircleGeometry(Math.max(box3.max.x - box3.min.x, box3.max.z - box3.min.z) * 0.85, 10), new three.MeshStandardMaterial({ color: "#EFEBE0", roughness: 1, flatShading: true }));
      ground.rotation.x = -Math.PI / 2; ground.position.set(center.x, box3.min.y - 0.2, center.z); ground.receiveShadow = true; scene.add(ground);
      disposables.push(ground.geometry, ground.material as T.Material);

      const shellMats: T.MeshStandardMaterial[] = [];
      const edgeMats: T.LineBasicMaterial[] = [];
      const internals: T.Object3D[] = [];
      const pickables: T.Mesh[] = [];
      const geoFor = (p: MockSolid["primitive"]) => {
        // 로우폴리: 면이 보이도록 분할을 적게
        if (p === "box") return new three.BoxGeometry(1, 1, 1);
        if (p === "sphere") return new three.IcosahedronGeometry(0.5, 1);
        if (p === "cone") return new three.ConeGeometry(0.5, 1, 9);
        return new three.CylinderGeometry(0.5, 0.5, 1, 10);
      };
      for (const s of solids) {
        const [sx, sy, sz] = s.size; const [bx, by, bz] = s.base;
        const geo = geoFor(s.primitive); disposables.push(geo);
        const mat = new three.MeshStandardMaterial({ color: s.color, roughness: s.role === "feature" ? 0.45 : 0.75, flatShading: true, transparent: s.role === "shell", emissive: s.role === "feature" && /light|불빛/.test(s.label) ? new three.Color(s.color) : undefined, emissiveIntensity: 0.4 });
        disposables.push(mat);
        const mesh = new three.Mesh(geo, mat);
        mesh.scale.set(sx, sz, sy);
        mesh.position.copy(toV(bx, by, bz + sz / 2));
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.label = s.label;
        // 테두리 선: 마을처럼 먹선 느낌
        const edges = new three.LineSegments(new three.EdgesGeometry(geo, 28), new three.LineBasicMaterial({ color: "#3C4A45", transparent: true, opacity: 0.55 }));
        disposables.push(edges.geometry, edges.material as T.Material);
        mesh.add(edges);
        scene.add(mesh);
        pickables.push(mesh);
        if (s.role === "shell") { shellMats.push(mat); edgeMats.push(edges.material as T.LineBasicMaterial); }
        if (s.role === "internal") internals.push(mesh);
      }

      const applyInside = (v: boolean) => {
        for (const m of shellMats) { m.opacity = v ? 0.16 : 1; m.depthWrite = !v; m.needsUpdate = true; }
        for (const m of edgeMats) m.opacity = v ? 0.3 : 0.55;
        for (const o of internals) o.visible = v;
      };
      applyInside(insideRef.current);

      // 눌러서 이름 보기
      const tip = document.createElement("div"); tip.className = "mockup3d-tip"; tip.hidden = true; el.appendChild(tip);
      const ray = new three.Raycaster(); const ndc = new three.Vector2();
      let downAt = { x: 0, y: 0 };
      const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; };
      const onUp = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects(pickables.filter((m) => m.visible && !(insideRef.current && shellMats.includes(m.material as T.MeshStandardMaterial))), false)[0];
        if (!hit) { tip.hidden = true; return; }
        tip.textContent = String(hit.object.userData.label ?? ""); tip.hidden = false;
        tip.style.left = `${e.clientX - r.left}px`; tip.style.top = `${e.clientY - r.top}px`;
      };
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);

      const ro = new ResizeObserver(() => {
        const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
        renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
      });
      ro.observe(el);

      // 화면에 안 보이면 그리지 않는다 (대시보드에서 다른 카드 볼 때 배터리 아끼기)
      let visible = true;
      const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; });
      io.observe(el);
      let raf = 0;
      const loop = () => { raf = requestAnimationFrame(loop); if (!visible) return; controls.update(); renderer.render(scene, camera); };
      loop();

      api.current = {
        setInside: applyInside,
        setZoom: (z) => { const dir = camera.position.clone().sub(controls.target).normalize(); camera.position.copy(controls.target).addScaledVector(dir, radius * 3.1 / z); },
        reset: () => { controls.autoRotate = true; home(); },
      };
      cleanup = () => {
        cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); controls.dispose();
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointerup", onUp);
        for (const d of disposables) d.dispose();
        renderer.dispose(); renderer.domElement.remove(); tip.remove();
        api.current = null;
      };
    })().catch(() => onFail());
    return () => { disposed = true; cleanup(); };
    // 도형이 바뀌면 장면을 새로 짓는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(solids)]);

  useEffect(() => { api.current?.setInside(inside); }, [inside]);
  useEffect(() => { api.current?.setZoom(zoom); }, [zoom]);
  useEffect(() => { if (resetKey) api.current?.reset(); }, [resetKey]);

  return <div ref={mount} className="mockup3d" />;
}
