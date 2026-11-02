"use client";
import { useMemo, useRef, useState } from "react";
import type { BuildBlueprint, LocalProject, ProductForm } from "../lib/project-types";
import { AGENTS, workflowFor } from "../lib/workflow";
import { CircuitPartsView } from "./circuit-parts";

export function CircuitView({ blueprint }: { blueprint: BuildBlueprint }) {
  // Circuits built from part cards are drawn as real parts; older circuits
  // without cards keep the net diagram below.
  if (blueprint.components.some((c) => c.catalogId)) return <CircuitPartsView blueprint={blueprint} />;
  return <NetDiagram blueprint={blueprint} />;
}

function NetDiagram({ blueprint }: { blueprint: BuildBlueprint }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const components = blueprint.components;
  const width = Math.max(820, components.length * 142 + 80);
  const height = 185 + blueprint.nets.length * 42;
  return <div className="circuit-view">
    <div className="view-toolbar"><span>{blueprint.board} · {blueprint.supplyVoltage}V</span><button onClick={() => setZoom(Math.max(.6, zoom - .2))} aria-label="회로 축소">−</button><button onClick={() => setZoom(1)}>맞춤</button><button onClick={() => setZoom(Math.min(2, zoom + .2))} aria-label="회로 확대">＋</button></div>
    <div className="schematic-scroll"><svg width={`${zoom * 100}%`} style={{ minWidth: 800 * zoom }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="부품 단자와 연결 net 회로도">
      <defs><pattern id="circuit-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#d7deda"/></pattern></defs>
      <rect width={width} height={height} fill="url(#circuit-grid)"/>
      {components.map((c, i) => <g key={c.ref}><rect x={55 + i * 142} y={20} width="124" height="82" rx="7" fill="#fff" stroke="#668c84"/><text x={117 + i * 142} y="43" textAnchor="middle" fontSize="13" fontWeight="700">{c.ref}</text><text x={117 + i * 142} y="64" textAnchor="middle" fontSize="10">{c.type}</text><text x={117 + i * 142} y="83" textAnchor="middle" fontSize="9">{c.valueOrModel.slice(0, 17)}</text><title>{c.valueOrModel} · {c.reason}</title></g>)}
      {blueprint.nets.map((net, row) => {
        const y = 143 + row * 42;
        const color = net.kind === "power" ? "#b06832" : net.kind === "ground" ? "#717c7a" : "#287e73";
        return <g key={net.name} opacity={selected && selected !== net.name ? .22 : 1} onClick={() => setSelected(selected === net.name ? null : net.name)} style={{ cursor: "pointer" }}>
          <text x="12" y={y - 10} fontSize="10" fill={color}>{net.name}</text>
          <line x1="35" x2={width - 30} y1={y} y2={y} stroke={color} strokeWidth={selected === net.name ? 3 : 1.3}/>
          {net.members.map((member, index) => {
            const [ref, ...terminal] = member.split(".");
            const col = components.findIndex((c) => c.ref === ref);
            const x = 100 + Math.max(col, 0) * 142 + (index % 2) * 8;
            return <g key={`${member}-${index}`}><circle cx={x} cy={y} r="3" fill={color}/><rect x={x - 8} y={y - 26} width="93" height="19" rx="3" fill="#fff" stroke={color}/><text x={x - 3} y={y - 13} fontSize="9">{ref}.{terminal.join(".")}</text><line x1={x} x2={x} y1={y - 7} y2={y} stroke={color}/></g>;
          })}
        </g>;
      })}
    </svg></div>
    <p className="notice">이 회로는 부품 카드 없이 제출돼서 실제 부품 모양으로 그릴 수 없어요. Claude에게 “부품 카드(find_part_cards)로 회로를 다시 제출해줘”라고 하면 실제 부품 배치도로 바뀌어요.</p>
    <p className="muted">같은 선의 단자는 전기적으로 연결됩니다. 선을 누르면 해당 net을 강조합니다. 실제 부품의 단자명·정격을 확인할 회로 초안입니다.</p>
    <details><summary>부품별 연결표</summary><table><thead><tr><th>NET</th><th>연결 단자</th></tr></thead><tbody>{blueprint.nets.map((n) => <tr key={n.name}><td>{n.name}</td><td>{n.members.join(" · ")}</td></tr>)}</tbody></table></details>
  </div>;
}

type Point = [number, number, number];
export function MockupView({ blueprint, form }: { blueprint: BuildBlueprint; form?: ProductForm }) {
  const [rotation, setRotation] = useState({ yaw: -.6, pitch: .55, zoom: 1 });
  const [inside, setInside] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const { widthMm: w, depthMm: d, heightMm: h, wallMm: wall } = blueprint.enclosure;
  const shapeParts = form?.shape ?? blueprint.shape;
  const faces = useMemo(() => {
    const output: Array<{ points: string; z: number; fill: string; label: string; opacity?: number }> = [];
    const extent = Math.max(form ? 0 : w, form ? 0 : d, form ? 0 : h, 40, ...(shapeParts ?? []).flatMap((p) => [Math.abs(p.position[0]) * 2 + p.size[0], Math.abs(p.position[1]) * 2 + p.size[1], p.position[2] + p.size[2]]));
    const scale = 285 / extent * rotation.zoom;
    // Lift tall described shapes so their middle sits where the box's floor did.
    const zc = shapeParts?.length ? Math.max(...shapeParts.map((p) => p.position[2] + p.size[2])) * .45 : 0;
    const rotate = ([x, y, z0]: Point) => { const z = z0 - zc;
      const xx = x * Math.cos(rotation.yaw) - y * Math.sin(rotation.yaw);
      const yy = x * Math.sin(rotation.yaw) + y * Math.cos(rotation.yaw);
      return [280 + xx * scale, 205 + (yy * Math.sin(rotation.pitch) - z * Math.cos(rotation.pitch)) * scale, yy * Math.cos(rotation.pitch) + z * Math.sin(rotation.pitch)];
    };
    const box = (x: number, y: number, z: number, bw: number, bd: number, bh: number, color: string, label: string, opacity?: number) => {
      const points: Point[] = [[x,y,z],[x+bw,y,z],[x+bw,y+bd,z],[x,y+bd,z],[x,y,z+bh],[x+bw,y,z+bh],[x+bw,y+bd,z+bh],[x,y+bd,z+bh]];
      for (const ids of [[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]) {
        const transformed = ids.map((i) => rotate(points[i]));
        output.push({ points: transformed.map(([px,py]) => `${px},${py}`).join(" "), z: transformed.reduce((a,p) => a+p[2],0)/4, fill: color, label, opacity });
      }
    };
    const shape = shapeParts ?? [];
    const shell = inside ? .18 : undefined;
    if (shape.length) {
      // Described outer form: each part as a low-poly mesh, painter-sorted.
      const palette = ["#94D2C9", "#b7d7cf", "#e9e3cf", "#d9b8c4", "#a9b7d9", "#424b48"];
      const face = (pts: Point[], fill: string, label: string, opacity = shell) => { const t = pts.map(rotate); output.push({ points: t.map(([px, py]) => `${px},${py}`).join(" "), z: t.reduce((a, p) => a + p[2], 0) / t.length, fill, label, opacity }); };
      shape.forEach((part, index) => {
        const fill = part.color ?? palette[index % palette.length];
        const [sx, sy, sz] = part.size; const [px, py, pz] = part.position;
        if (part.primitive === "box") { box(px - sx / 2, py - sy / 2, pz, sx, sy, sz, fill, part.name, shell); return; }
        const seg = 16;
        if (part.primitive === "sphere") {
          const rings = 8; const at = (i: number, j: number): Point => { const th = Math.PI * i / rings, ph = 2 * Math.PI * j / seg; return [px + sx / 2 * Math.sin(th) * Math.cos(ph), py + sy / 2 * Math.sin(th) * Math.sin(ph), pz + sz / 2 - sz / 2 * Math.cos(th)]; };
          for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) face([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)], fill, part.name);
          return;
        }
        const ring = (z: number, scale: number) => Array.from({ length: seg }, (_, j): Point => [px + sx / 2 * scale * Math.cos(2 * Math.PI * j / seg), py + sy / 2 * scale * Math.sin(2 * Math.PI * j / seg), z]);
        const bottom = ring(pz, 1); const top = ring(pz + sz, part.primitive === "cone" ? 0 : 1);
        for (let j = 0; j < seg; j++) face([bottom[j], bottom[(j + 1) % seg], top[(j + 1) % seg], top[j]], fill, part.name);
        face(bottom, fill, part.name); if (part.primitive === "cylinder") face(top, fill, part.name);
      });
      // Visible features sit as thin plates on the surface they face.
      const featureColor = { screen: "#1f2a2e", camera: "#111111", button: "#e0a43a", speaker: "#59636a", mic: "#59636a", port: "#7a7f84", light: "#f3d36b", other: "#8a8f94" } as const;
      for (const f of form?.features ?? []) {
        const [fx, fy, fz] = f.position; const [a, b] = f.size; const t = 1.5;
        const dims: Record<typeof f.facing, [number, number, number]> = { front: [a, t, b], back: [a, t, b], left: [t, a, b], right: [t, a, b], top: [a, b, t], bottom: [a, b, t] };
        const [bx, by, bz] = dims[f.facing];
        box(fx - bx / 2, fy - by / 2, fz - bz / 2, bx, by, bz, featureColor[f.kind], `${f.name} (${f.kind})`);
      }
      if (inside) for (const part of form?.internals ?? []) box(part.position[0] - part.size[0] / 2, part.position[1] - part.size[1] / 2, part.position[2], part.size[0], part.size[1], part.size[2], "#2e786b", `${part.ref} · ${part.label} (${part.size.join("×")}mm)`);
      return output.sort((a, b) => a.z - b.z);
    }
    box(-w/2,-d/2,0,w,d,wall,"#b5d8d1","하우징 바닥");
    box(-w/2,-d/2,wall,w,wall,h-wall,"#cbe0db","후면 벽");
    box(-w/2,d/2-wall,wall,w,wall,h-wall,"#a6ccc3","전면 벽");
    box(-w/2,-d/2,wall,wall,d,h-wall,"#b7d7cf","측면 벽");
    box(w/2-wall,-d/2,wall,wall,d,h-wall,"#b7d7cf","측면 벽");
    box(-w*.30,-d*.29,wall+1,w*.55,d*.50,3,"#2e786b",blueprint.board + " 자리표시자");
    box(w*.13,-d*.12,wall+5,w*.1,d*.15,h*.18,"#424b48","부품 자리표시자");
    return output.sort((a,b) => a.z-b.z);
  }, [w,d,h,wall,rotation,blueprint.board,shapeParts,form,inside]);
  return <div className="mockup-view">
    <div className="view-toolbar"><span>{form ? "완성품 미리보기" : `${w} × ${d} × ${h} mm`}</span>{form && <button aria-pressed={inside} onClick={() => setInside(!inside)}>{inside ? "겉모습 보기" : "속 보기"}</button>}<button onClick={() => setRotation({yaw:-.6,pitch:.55,zoom:1})}>시점 초기화</button></div>
    <svg className="orbit-canvas" viewBox="0 0 560 360" role="img" aria-label="드래그로 회전 가능한 3D 하우징 목업" tabIndex={0}
      onPointerDown={(e) => { drag.current={x:e.clientX,y:e.clientY}; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (!drag.current) return; const dx=e.clientX-drag.current.x,dy=e.clientY-drag.current.y; drag.current={x:e.clientX,y:e.clientY}; setRotation((r)=>({...r,yaw:r.yaw+dx*.012,pitch:Math.max(-1.3,Math.min(1.3,r.pitch+dy*.009))})); }}
      onPointerUp={() => { drag.current=null; }} onPointerCancel={() => { drag.current=null; }}
      onKeyDown={(e) => { if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) {e.preventDefault();setRotation((r)=>({...r,yaw:r.yaw+(e.key==="ArrowLeft"?-.15:e.key==="ArrowRight"?.15:0),pitch:Math.max(-1.3,Math.min(1.3,r.pitch+(e.key==="ArrowUp"?.1:e.key==="ArrowDown"?-.1:0)))}));} }}>
      <ellipse cx="280" cy="297" rx="185" ry="30" fill="#1f1f1f" opacity=".05"/>
      {faces.map((f,i)=><polygon key={i} points={f.points} fill={f.fill} stroke="#506f66" strokeWidth=".65" strokeOpacity={f.opacity !== undefined ? .35 : 1} fillOpacity={f.opacity ?? .86}><title>{f.label}</title></polygon>)}
      <text x="22" y="335" fill="#64736e" fontSize="11">드래그 / 방향키로 회전 · 치수 기반 기구 목업</text>
    </svg>
    <label className="zoom-slider">확대 <input aria-label="3D 확대" type="range" min=".5" max="1.8" step=".05" value={rotation.zoom} onChange={(e)=>setRotation({...rotation,zoom:Number(e.target.value)})}/></label>
    {form && <div className="product-notes"><p>{form.summary}</p><p><b>재질·마감</b> {form.material}</p>{form.features.length > 0 && <p><b>겉에 보이는 것</b> {form.features.map((f) => f.name).join(" · ")}</p>}{form.internals.length > 0 && <p><b>안에 들어가는 부품</b> {form.internals.map((i) => `${i.label} ${i.size.join("×")}mm`).join(" · ")}</p>}<details><summary>형태를 정한 질문과 답</summary>{form.answers.map((a, i) => <p key={i}><b>{a.question}</b><br/>{a.answer}</p>)}</details></div>}
    {!form && !blueprint.shape?.length && <p className="notice">아직 완성품 형태가 정해지지 않아 기본 상자로 보여주고 있어요. Claude에게 “완성품 모양부터 정하자”라고 말하면 형태 질문을 하고 완성품 미리보기를 만들어요.</p>}
    <p className="muted">{form ? "실제 부품 치수로 안에 들어갈 자리를 표시했어요. 출력 전 실측과 간섭 확인이 필요해요." : blueprint.shape?.length ? `설명한 형태를 ${blueprint.shape.length}개의 기본 도형으로 만든 외형 목업이에요. 내부 전자부품 공간은 ${w}×${d}×${h}mm 기준이에요. ` : ""}벽 두께 {wall} mm. 보드와 부품은 자리표시자이며, 실제 부품 치수를 받으면 기구 설계를 조정합니다. 출력 전 CAD 렌더와 간섭 확인이 필요합니다.</p>
  </div>;
}

function escapeHtml(s: string) { return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!)); }
export function downloadBom(project: LocalProject) {
  const w=workflowFor(project);
  const rows=project.build?.blueprint.components.map(c=>`<tr><td>${escapeHtml(c.ref)}</td><td>${escapeHtml(c.valueOrModel)}</td><td>${escapeHtml(c.reason)}</td><td>${escapeHtml(w.purchases[c.ref]??"needed")}</td><td>가격·재고·수량 확인 필요</td></tr>`).join("")??"";
  const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><title>${escapeHtml(project.name)} BOM</title><style>body{font-family:system-ui;background:#EDEEF0;color:#1F1F1F;padding:40px}table{border-collapse:collapse;width:100%;background:white}td,th{padding:14px;border:1px solid #cbd5d2;text-align:left}th{background:#94D2C9}</style><h1>${escapeHtml(project.name)} · BOM</h1><p>설계 r${project.designRevision} · 공급처, 정확한 수량, 가격과 재고를 구매 전에 확인하세요.</p><table><tr><th>참조</th><th>부품</th><th>용도</th><th>구매 상태</th><th>확인</th></tr>${rows}</table></html>`;
  const url=URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="dalgeurak-bom.html";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function TaskView({project, onAction, busy}: {project:LocalProject;onAction:(input:Record<string,unknown>)=>void;busy:boolean}) {
  const [answers,setAnswers]=useState<Record<string,string>>({});
  return <><h3>함께 할 다음 작업</h3><table><thead><tr><th>담당</th><th>작업과 결과</th></tr></thead><tbody>
    {project.tasks.map(t=><tr key={t.id}><td><span className={`pill ${t.status === "completed" ? "pass" : "unknown"}`}>{t.status==="completed"?"결과 제출됨":"사용자"}</span></td><td><strong>{t.title}</strong><p>{t.plain}</p>{t.status==="ready"&&<div className="evidence-input"><textarea aria-label={`${t.title} 결과`} value={answers[t.id]??""} placeholder="측정값, IDE 오류, 진행 결과를 알려주세요" onChange={e=>setAnswers({...answers,[t.id]:e.target.value})}/><button disabled={busy||!answers[t.id]?.trim()} onClick={()=>onAction({action:"evidence",taskId:t.id,text:answers[t.id]})}>팀에 결과 공유</button></div>}</td></tr>)}
    {workflowFor(project).activeAgents.map(a=><tr key={a}><td><span className="pill">{AGENTS[a].name}</span></td><td>{a==="hw"?"회로·펌웨어 검토, 측정 결과로 원인 좁히기":a==="sw"?"웹·앱 코드 제안 및 완성된 결과 검사":a==="me"?"부품 실측 요청과 구조·배치 조정":"외형·착용감·안전성 충돌 검토"}</td></tr>)}
  </tbody></table><p className="muted">실행 결과는 모든 작업실에 공유됩니다. 측정값을 제출해도 검증 상태가 자동으로 합격 처리되지는 않습니다.</p></>;
}
