"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as T from "three";
import { checkMockup, expand, type MockupPart, type MockupSolid, type MockupSpec } from "../lib/mockup";

// 정밀 목업 보기. 하우징 부위와 실측 부품을 실제 치수로 그리고, 서버와 같은 검사
// (lib/mockup.ts)의 결과를 옆에 둔다. 사람이 돌려 보고, 분해하고, 하우징을 비춰 보며
// "여기가 닿는다"를 따질 수 있어야 한다. 검사에서 걸린 부품은 붉게 보인다.
//
// 좌표: mm, z가 위. three는 y가 위라서 (x, y, z) → (x, z, y)로 옮긴다. 앞면(+y)이 카메라 쪽.

type View = "iso" | "front" | "side" | "top";
type Api = {
  setVisible: (hidden: Set<string>) => void;
  setExplode: (t: number) => void;
  setOpacity: (o: number) => void;
  setFocus: (ids: string[] | null) => void;
  setView: (view: View) => void;
};

const HOUSING = "#EDE9DF";
const KEEPOUT = "#7C93D6";
const PALETTE = ["#4F8A7B", "#C98A4B", "#6C7FB8", "#B8677A", "#8A8F5A", "#5E9BB5", "#9A7BB5", "#7A7F86"];
const GROUPS: Array<{ id: MockupPart["group"]; label: string }> = [{ id: "housing", label: "하우징" }, { id: "measured", label: "실측 부품" }, { id: "keepout", label: "비워 둘 자리" }];
const VIEWS: Array<{ id: View; label: string }> = [{ id: "iso", label: "비스듬히" }, { id: "front", label: "앞" }, { id: "side", label: "옆" }, { id: "top", label: "위" }];

/** 화면에 쓸 부품 색. 지정이 없으면 하우징은 미색, 실측 부품은 서로 다른 색을 돌려 쓴다 */
export function partColors(parts: MockupPart[]): Record<string, string> {
  let n = 0;
  return Object.fromEntries(parts.map((part) => [part.id, part.color ?? (part.group === "housing" ? HOUSING : part.group === "keepout" ? KEEPOUT : PALETTE[n++ % PALETTE.length])]));
}

type Piece = { kind: "box"; size: [number, number, number]; center: [number, number, number] } | { kind: "cyl"; d: number; len: number; center: [number, number, number]; axis: "x" | "y" | "z" };

/** 그릴 조각으로 푼다. 속이 빈 상자는 검사와 같은 방식(바닥 + 벽 넷)으로 풀어 위에서 속이 보인다 */
function pieces(solid: MockupSolid): Piece[] {
  if (solid.shape === "box") {
    const [x, y, z] = solid.size;
    const [sx, sy] = solid.rotate === 90 || solid.rotate === 270 ? [y, x] : [x, y];
    return [{ kind: "box", size: [sx, sy, z], center: [solid.at[0], solid.at[1], solid.at[2] + z / 2] }];
  }
  if (solid.shape === "hollowBox") {
    // 검사와 똑같은 조각(바닥 + 벽, 구멍이 있으면 구멍 둘레 조각)을 그린다. 보이는 것과 재는 것이 같아야 한다.
    return expand(solid).map((p) => ({ kind: "box" as const, size: [p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]] as [number, number, number], center: [(p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2] as [number, number, number] }));
  }
  const axis = solid.axis ?? "z";
  const [cx, cy, cz] = solid.at;
  return [{ kind: "cyl", d: solid.diameter, len: solid.length, axis, center: axis === "z" ? [cx, cy, cz + solid.length / 2] : [cx, cy, cz] }];
}

function Scene({ spec, failedIds, colors, hidden, explode, opacity, focus, view, viewKey, onFail }: {
  spec: MockupSpec; failedIds: string[]; colors: Record<string, string>; hidden: Set<string>; explode: number; opacity: number; focus: string[] | null; view: View; viewKey: number; onFail: () => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const live = useRef({ hidden, explode, opacity, focus });
  live.current = { hidden, explode, opacity, focus };

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
      el.appendChild(renderer.domElement);
      renderer.domElement.setAttribute("aria-label", "끌어서 돌려 보는 정밀 목업");

      const scene = new three.Scene();
      const disposables: Array<{ dispose: () => void }> = [];
      const toV = (x: number, y: number, z: number) => new three.Vector3(x, z, y);
      const failed = new Set(failedIds);

      type Entry = { part: MockupPart; group: T.Group; mats: T.MeshStandardMaterial[]; edges: T.LineBasicMaterial[]; offset: T.Vector3 };
      const entries: Entry[] = [];
      const box3 = new three.Box3();
      const unitBox = new three.BoxGeometry(1, 1, 1); disposables.push(unitBox);
      const unitCyl = new three.CylinderGeometry(0.5, 0.5, 1, 28); disposables.push(unitCyl);
      const boxEdges = new three.EdgesGeometry(unitBox); disposables.push(boxEdges);
      const cylEdges = new three.EdgesGeometry(unitCyl, 40); disposables.push(cylEdges);

      for (const part of spec.parts) {
        const group = new three.Group();
        const mats: T.MeshStandardMaterial[] = []; const edges: T.LineBasicMaterial[] = [];
        const bad = failed.has(part.id);
        for (const piece of part.solids.flatMap(pieces)) {
          const mat = new three.MeshStandardMaterial({ color: colors[part.id], roughness: part.group === "housing" ? 0.85 : 0.6, metalness: 0, transparent: true, emissive: new three.Color(bad ? "#D2452B" : "#000000"), emissiveIntensity: bad ? (part.group === "housing" ? 0.12 : 0.45) : 0 });
          // 하우징은 덩치가 커서 통째로 붉히면 다른 것이 안 보인다. 테두리만 붉게 하고 살짝만 물들인다.
          const line = new three.LineBasicMaterial({ color: bad ? "#C2351D" : "#3C4A45", transparent: true, opacity: bad ? 0.95 : 0.4 });
          disposables.push(mat, line); mats.push(mat); edges.push(line);
          const mesh = new three.Mesh(piece.kind === "box" ? unitBox : unitCyl, mat);
          const [cx, cy, cz] = piece.center;
          mesh.position.copy(toV(cx, cy, cz));
          if (piece.kind === "box") mesh.scale.set(piece.size[0], piece.size[2], piece.size[1]);
          else {
            mesh.scale.set(piece.d, piece.len, piece.d);
            if (piece.axis === "x") mesh.rotation.z = Math.PI / 2;
            if (piece.axis === "y") mesh.rotation.x = Math.PI / 2;
          }
          mesh.add(new three.LineSegments(piece.kind === "box" ? boxEdges : cylEdges, line));
          mesh.userData.label = part.name;
          group.add(mesh);
        }
        group.updateMatrixWorld(true);
        box3.expandByObject(group);
        scene.add(group);
        entries.push({ part, group, mats, edges, offset: new three.Vector3() });
      }
      if (box3.isEmpty()) box3.set(new three.Vector3(-20, 0, -20), new three.Vector3(20, 40, 20));
      const center = box3.getCenter(new three.Vector3());
      const size = box3.getSize(new three.Vector3());
      const radius = Math.max(20, size.length() / 2);

      // 분해 방향: 지정이 없으면 하우징 부위를 순서대로 위로 들어 올린다(뚜껑이 열리게).
      const lift = Math.max(18, size.y * 0.9 + 8);
      let housingIndex = 0;
      for (const entry of entries) {
        const e = entry.part.explode ?? (entry.part.group === "housing" ? [0, 0, lift * housingIndex] : [0, 0, 0]);
        if (entry.part.group === "housing") housingIndex++;
        entry.offset.copy(toV(e[0], e[1], e[2]));
      }

      const camera = new three.PerspectiveCamera(35, el.clientWidth / Math.max(1, el.clientHeight), radius / 50, radius * 60);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true; controls.dampingFactor = 0.08;
      controls.minDistance = radius * 0.6; controls.maxDistance = radius * 10;
      const DIR: Record<View, [number, number, number]> = { iso: [0.62, 0.52, 0.62], front: [0, 0.06, 1], side: [1, 0.06, 0], top: [0, 1, 0.001] };
      const setView = (name: View) => {
        const d = radius * (el.clientWidth < 480 ? 3.6 : 3.0);
        const v = new three.Vector3(...DIR[name]).normalize().multiplyScalar(d);
        camera.position.copy(center).add(v);
        controls.target.copy(center); controls.update();
      };
      setView("iso");

      scene.add(new three.HemisphereLight("#FFF6E8", "#B9C7C2", 1.7));
      const sun = new three.DirectionalLight("#FFFFFF", 1.6);
      sun.position.set(center.x + radius * 2, center.y + radius * 4, center.z + radius * 3);
      sun.target.position.copy(center); scene.add(sun.target); scene.add(sun);
      const fill = new three.DirectionalLight("#FFFFFF", 0.5);
      fill.position.set(center.x - radius * 3, center.y + radius, center.z - radius * 2); scene.add(fill);

      const state = { hidden: new Set<string>(), explode: 0, opacity: 1, focus: null as string[] | null };
      const refresh = () => {
        for (const entry of entries) {
          const { part } = entry;
          entry.group.visible = !state.hidden.has(part.id);
          entry.group.position.copy(entry.offset).multiplyScalar(state.explode);
          const dim = !!state.focus && !state.focus.includes(part.id);
          const base = part.group === "housing" ? 0.15 + 0.85 * state.opacity : part.group === "keepout" ? 0.35 : 1;
          const value = dim ? Math.min(base, 0.07) : base;
          for (const mat of entry.mats) { mat.opacity = value; mat.depthWrite = value >= 0.99; mat.needsUpdate = true; }
          const bad = failed.has(part.id);
          for (const line of entry.edges) line.opacity = dim ? 0.08 : bad ? 0.95 : part.group === "housing" && value < 0.99 ? 0.55 : 0.4;
          // 속이 비치는 부위는 나중에 그려야 안의 부품이 가려지지 않는다.
          entry.group.renderOrder = value >= 0.99 ? 0 : 1;
        }
      };
      Object.assign(state, live.current);
      refresh();

      // 눌러서 이름 보기
      const tip = document.createElement("div"); tip.className = "pm-tip"; tip.hidden = true; el.appendChild(tip);
      const ray = new three.Raycaster(); const ndc = new three.Vector2();
      let downAt = { x: 0, y: 0 };
      const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; };
      const onUp = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const targets = entries.filter((entry) => entry.group.visible && entry.mats[0] && entry.mats[0].opacity > 0.5).flatMap((entry) => entry.group.children);
        const hit = ray.intersectObjects(targets, false)[0];
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
      let visible = true;
      const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; });
      io.observe(el);
      let raf = 0;
      const loop = () => { raf = requestAnimationFrame(loop); if (!visible) return; controls.update(); renderer.render(scene, camera); };
      loop();

      api.current = {
        setVisible: (v) => { state.hidden = v; refresh(); },
        setExplode: (t) => { state.explode = t; refresh(); },
        setOpacity: (o) => { state.opacity = o; refresh(); },
        setFocus: (ids) => { state.focus = ids; refresh(); },
        setView
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
    // 도형이나 검사 결과가 바뀌면 장면을 새로 짓는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(spec.parts), failedIds.join("|"), JSON.stringify(colors)]);

  useEffect(() => { api.current?.setVisible(hidden); }, [hidden]);
  useEffect(() => { api.current?.setExplode(explode); }, [explode]);
  useEffect(() => { api.current?.setOpacity(opacity); }, [opacity]);
  useEffect(() => { api.current?.setFocus(focus); }, [focus]);
  useEffect(() => { api.current?.setView(view); }, [view, viewKey]);

  return <div ref={mount} className="pm-canvas" />;
}

export default function PreciseMockup({ spec }: { spec: MockupSpec }) {
  const report = useMemo(() => checkMockup(spec), [spec]);
  const colors = useMemo(() => partColors(spec.parts), [spec.parts]);
  const failedIds = useMemo(() => [...new Set(report.failed.flatMap((check) => check.parts))], [report]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [explode, setExplode] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const [view, setView] = useState<View>("iso");
  const [viewKey, setViewKey] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [noGl, setNoGl] = useState(false);
  const focus = useMemo(() => report.checks.find((check) => check.id === focusId)?.parts ?? null, [report, focusId]);
  const passedChecks = report.checks.filter((check) => check.pass);
  const allPass = report.failed.length === 0;
  const toggle = (id: string) => setHidden((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const size = [0, 1, 2].map((i) => Math.round((report.bounds.max[i] - report.bounds.min[i]) * 10) / 10);

  return <div className="pm">
    <div className="pm-stage">
      {noGl
        ? <p className="pm-fallback">이 브라우저에서는 3D를 그릴 수 없어요. 아래 검사 결과는 그대로 볼 수 있어요.</p>
        : <Scene spec={spec} failedIds={failedIds} colors={colors} hidden={hidden} explode={explode} opacity={opacity} focus={focus} view={view} viewKey={viewKey} onFail={() => setNoGl(true)} />}
      <span className={"pm-pill " + (allPass ? "ok" : "bad")}>검사 <b>{report.passed} / {report.total}</b> 통과</span>
      {!noGl && <span className="pm-hint">끌어서 돌리기 · 휠/두 손가락으로 확대</span>}
    </div>

    <div className="pm-card">
      {GROUPS.filter((group) => spec.parts.some((part) => part.group === group.id)).map((group) => <div className="pm-row" key={group.id}>
        <span className="pm-row-label">{group.label}</span>
        <div className="pm-chips">{spec.parts.filter((part) => part.group === group.id).map((part) => <label key={part.id} className={"pm-chip" + (hidden.has(part.id) ? " off" : "") + (failedIds.includes(part.id) ? " bad" : "")} title={part.note ?? part.name}>
          <input type="checkbox" checked={!hidden.has(part.id)} onChange={() => toggle(part.id)} />
          <i style={{ background: colors[part.id] }} />{part.name}{part.group === "measured" && part.basis === "assumed" && <em>추정</em>}
        </label>)}</div>
      </div>)}
      <div className="pm-sliders">
        <label>분해<input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} aria-label="분해해서 보기" /></label>
        <label>투명도<input type="range" min={0} max={1} step={0.01} value={1 - opacity} onChange={(e) => setOpacity(1 - Number(e.target.value))} aria-label="하우징을 비쳐 보기" /></label>
      </div>
      <div className="pm-views">{VIEWS.map((v) => <button key={v.id} type="button" className={view === v.id ? "on" : ""} onClick={() => { setView(v.id); setViewKey((k) => k + 1); }}>{v.label}</button>)}
        <span className="pm-size">전체 {size[0]}×{size[1]}×{size[2]}mm</span></div>
    </div>

    <div className="pm-card">
      <h3 className="pm-title">검사 {report.total}개</h3>
      {report.warnings.map((warning, index) => <p className="pm-warn" key={index}>{warning}</p>)}
      {allPass && <p className="pm-allpass">부품끼리 겹치는 곳이 없고, 정한 틈도 모두 맞아요.</p>}
      {report.failed.length > 0 && <ul className="pm-checks">{report.failed.map((check) => <li key={check.id}><button type="button" className={"bad" + (focusId === check.id ? " focused" : "")} aria-pressed={focusId === check.id} onClick={() => setFocusId(focusId === check.id ? null : check.id)}>
        <span className="pm-mark" aria-label="실패">✕</span><b>{check.title}</b><small>{check.detail}</small></button></li>)}</ul>}
      {report.failed.length > 0 && <p className="pm-note">줄을 누르면 그 두 부품만 또렷하게 보여요. 다시 누르면 돌아가요.</p>}
      {passedChecks.length > 0 && <details className="pm-passed"><summary>통과 {passedChecks.length}개 보기</summary>
        <ul className="pm-checks">{passedChecks.map((check) => <li key={check.id}><button type="button" className={focusId === check.id ? "focused" : ""} aria-pressed={focusId === check.id} onClick={() => setFocusId(focusId === check.id ? null : check.id)}>
          <span className="pm-mark ok" aria-label="통과">✓</span><b>{check.title}</b><small>{check.detail}</small></button></li>)}</ul>
      </details>}
    </div>
  </div>;
}
