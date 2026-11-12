"use client";
import type { LocalProject, ProductForm } from "../lib/project-types";
import { FAB_ICON, FAB_LABEL, housingFiles } from "../lib/housing";
import { workbenchDownloadUrl } from "../lib/workbench";
import { MockupView } from "./artifact-views";

// 하우징 부위별 제작 방식 (명세서 2차 v0.1 §6.5): 부위 색 지도 + 부위 카드 + 내려받을 파일
const REGION_COLORS = ["#e9a48c", "#9ed3cb", "#cdbdff", "#ffc48a", "#f7c1d4", "#b9d98a", "#a9c7f2", "#e6d17a", "#c7b8a6", "#8fd1e0"];
const FEASIBLE: Record<string, [string, string]> = { yes: ["pass", "직접 할 수 있어요"], needs_service: ["unknown", "대행·메이커스페이스"], no: ["fail", "어려워요"], unknown: ["unknown", "확인 필요"] };
const FILE_LABEL: Record<string, string> = { stl: "STL (3D 프린트)", dxf_unfold: "PP 전개도 SVG (1:1 인쇄)", svg_cut: "재단 SVG (레이저·칼)", mold_plan: "레진 주형 계획" };
const won = (n: number | null) => (n == null ? "확인 필요" : `${n.toLocaleString("ko-KR")}원`);

export function HousingView({ project }: { project: LocalProject }) {
  const h = project.housing!, form = project.productForm!;
  const colorOf = (i: number) => REGION_COLORS[i % REGION_COLORS.length];
  const tinted: ProductForm = { ...form, shape: form.shape.map((s, si) => { const ri = h.regions.findIndex((r) => r.shapeRefs.includes(si)); return { ...s, color: ri >= 0 ? colorOf(ri) : "#dddddd" }; }) };
  const files = housingFiles(project);
  const env = h.environment;
  return <div className="housing-view">
    <div className="artifact-title"><span className="pill">하우징</span><h3>부위별 제작 방식</h3></div>
    <p>{h.summary}</p>
    <MockupView blueprint={project.build?.blueprint ?? { title: project.name, board: "", supplyVoltage: 5, components: [], nets: [], enclosure: { widthMm: 60, depthMm: 40, heightMm: 30, wallMm: 2 }, firmware: { platform: "arduino", behavior: "", pinAssignments: [], loopSteps: [] }, assumptions: [], humanChecks: [] }} form={tinted} />
    <ul className="housing-legend">{h.regions.map((r, i) => <li key={r.id}><span style={{ background: colorOf(i) }} />{FAB_ICON[r.method]} {r.name} · {FAB_LABEL[r.method]}</li>)}</ul>
    <p className="housing-meta">
      <span className="pill">{{ indoor: "실내", outdoor: "실외", both: "실내·실외" }[env.indoorOutdoor]}</span>
      {env.water !== "none" && <span className="pill unknown">물: {{ splash: "튀김", rain: "비", submerge: "잠김" }[env.water]}</span>}
      {env.skinContact && <span className="pill unknown">피부 접촉</span>}
      {env.childUse && <span className="pill unknown">아이 사용</span>}
      <span>합계 {won(h.totals.costKRW)} · {h.totals.timeHours == null ? "시간 확인 필요" : `${h.totals.timeHours}시간`}{h.totals.partial ? " (일부 미정)" : ""}</span>
    </p>
    {h.assemblyOrder.length > 0 && <p className="muted">조립 순서: {h.assemblyOrder.map((id) => h.regions.find((r) => r.id === id)?.name ?? id).join(" → ")}</p>}
    {h.regions.map((r, i) => {
      const f = FEASIBLE[r.feasible];
      const mine = files.filter((x) => x.regionId === r.id);
      return <article className="housing-region" key={r.id} style={{ borderLeftColor: colorOf(i) }}>
        <header><b>{FAB_ICON[r.method]} {r.name}</b><span>{FAB_LABEL[r.method]}</span><span className={`pill ${f[0]}`}>{f[1]}</span></header>
        <p>{r.role}. <span className="muted">{r.why}</span></p>
        <dl>
          <dt>재료</dt><dd>{r.material.name}{r.material.thicknessMm != null ? ` · ${r.material.thicknessMm}mm` : ""}{r.material.color ? ` · ${r.material.color}` : ""}{r.material.finish ? ` · ${r.material.finish}` : ""}</dd>
          <dt>결합</dt><dd>{r.join.length ? r.join.map((j) => `${h.regions.find((x) => x.id === j.to)?.name ?? j.to}와 ${{ screw: "나사", heat_insert: "열 인서트", snap: "끼움", magnet: "자석", tape: "양면테이프", glue: "접착", slot: "홈 끼움", sew: "바느질", velcro: "벨크로" }[j.method]} (${j.detail})`).join(" / ") : "없음"}</dd>
          <dt>공차</dt><dd>{r.toleranceMm == null ? "확인 필요" : `${r.toleranceMm}mm`}</dd>
          {r.access && r.access.purpose !== "none" && <><dt>여는 곳</dt><dd>{{ battery: "배터리", charging: "충전", button: "버튼", debug: "디버그" }[r.access.purpose]} · {r.access.how}</dd></>}
          <dt>비용·시간</dt><dd>{won(r.costKRW)} · {r.timeHours == null ? "?" : `${r.timeHours}시간`}</dd>
        </dl>
        <ol>{r.process.map((p, k) => <li key={k}>{p}</li>)}</ol>
        {(mine.length > 0 || r.outputs.some((o) => o.url)) && <div className="housing-files">
          {mine.map((x) => <a key={x.id} href={workbenchDownloadUrl(project.id, x.id)} download={x.filename}>↓ {FILE_LABEL[x.kind] ?? x.filename}</a>)}
          {r.outputs.filter((o) => o.url).map((o, k) => <a key={k} href={o.url} target="_blank" rel="noreferrer noopener">↗ {o.kind === "buy_link" ? "구매 링크" : o.kind} {o.note}</a>)}
        </div>}
      </article>;
    })}
    {h.risks.length > 0 && <section className="housing-risks"><h4>확인할 것</h4><ul>{h.risks.map((x, k) => <li key={k}>{x}</li>)}</ul></section>}
    <p className="muted">파일은 완성품 도형 기준이에요. 상자·원기둥 부위는 위가 열린 껍데기, 나머지는 꽉 찬 외형이에요. 구멍 위치는 함께 받은 OpenSCAD 파일과 위 전개도를 기준으로, 출력 전 실제 부품으로 맞춰 보세요.</p>
  </div>;
}
