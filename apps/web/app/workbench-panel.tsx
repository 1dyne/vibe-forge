"use client";
import { useEffect, useRef, useState } from "react";
import type { LocalProject } from "../lib/project-types";
import type { WorkbenchItem } from "../lib/workbench";
import { workbenchDownloadUrl } from "../lib/workbench";
import { AGENTS, workflowFor } from "../lib/workflow";
import { CircuitView, MockupView, TaskView } from "./artifact-views";
import { AssemblyView } from "./assembly-view";
import { HousingView } from "./housing-view";
import { ChangeSticker } from "./change-sticker";
import { HistoryList, PowerView, SafetyView, TestView } from "./plan-views";
import { ContractView } from "./contract-view";
import { provisionalReasons } from "../lib/provisional";

export default function WorkbenchPanel({ project, items, selected, busy, onSelect, onClose, onAction, ownerName, newMarks = [], connectorOnly = false }: {
  project: LocalProject; items: WorkbenchItem[]; selected: string; busy: boolean; connectorOnly?: boolean; ownerName: string; newMarks?: string[];
  onSelect: (id: string) => void; onClose: () => void; onAction: (input: Record<string, unknown>) => void;
}) {
  const item = items.find(i => i.id === selected) ?? items[0];
  const [sourceItem, setSourceItem] = useState<string | null>(null);
  const tabs = useRef<HTMLDivElement>(null);
  useEffect(() => { tabs.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [item?.id]);
  if (!item) return null;
  const source = sourceItem === item.id;
  const workflow = workflowFor(project);
  const hasPreview = ["product", "assembly", "housing", "power", "tests", "safety", "contract", "circuit", "cad", "bom", "tasks", "record"].includes(item.kind) || item.mimeType.startsWith("text/html");
  const downloadUrl = workbenchDownloadUrl(project.id, item.id);
  function select(id: string) { setSourceItem(null); onSelect(id); }
  return <aside className="artifact-panel" id="workbench-panel" aria-label="작업대">
    <header className="artifact-header"><div><h2>작업대 <span className="artifact-count">{items.length}</span></h2></div><div className="workbench-header-actions"><span className="revision">r{project.designRevision}</span><button className="icon-button" onClick={onClose} aria-label="작업대 닫기">×</button></div></header>
    {/* 파일이 하나뿐이면 탭 줄은 파일명을 한 번 더 보여줄 뿐이라, 아래 도구줄에만 이름을 둔다. */}
    {items.length > 1 && <div ref={tabs} className="artifact-tabs" role="tablist" aria-label="작업물 파일" onKeyDown={e => {
      const index = items.findIndex(i => i.id === item.id);
      let next = index;
      if (e.key === "ArrowRight") next = (index + 1) % items.length;
      else if (e.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = items.length - 1;
      else return;
      e.preventDefault(); select(items[next].id);
      (e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next])?.focus();
    }}>{items.map(i => <button key={i.id} id={`workbench-tab-${i.id}`} role="tab" aria-controls="workbench-content" tabIndex={item.id === i.id ? 0 : -1} aria-selected={item.id === i.id} className={(item.id === i.id ? "active" : "") + (newMarks.includes("item:" + i.id) ? " is-new" : "")} title={i.filename} onClick={() => select(i.id)}>{i.filename}</button>)}</div>}
    {/* 탭이 보일 때는 그 탭이 곧 파일명이라 여기서는 비운다(자리는 지켜 버튼 정렬을 유지). */}
    <div className="file-toolbar"><span title={item.filename}>{items.length > 1 ? "" : item.filename}</span>{hasPreview && <button aria-pressed={source} onClick={() => setSourceItem(source ? null : item.id)}>{source ? "미리보기" : "파일 원문"}</button>}<a href={downloadUrl} download={item.filename}>다운로드 ↓</a></div>
    <div className="artifact-content" id="workbench-content" role="tabpanel" tabIndex={0} aria-labelledby={`workbench-tab-${item.id}`}>
      {["product", "plan", "circuit", "cad", "assembly", "bom"].includes(item.kind) && <ChangeSticker reasons={provisionalReasons(project)} />}
      {source || !hasPreview ? <pre className="file-source">{item.content}</pre> : <>
        {item.kind === "circuit" && project.build && <><div className="artifact-title"><span className="pill">회로 초안</span><h3>{project.build.blueprint.title}</h3></div><CircuitView blueprint={project.build.blueprint} /><div className="check-list">{project.build.checks.map(c => <div key={c.id} className={c.verdict}><span>{c.verdict === "pass" ? "✓" : c.verdict === "unknown" ? "?" : "!"}</span><p><b>{c.id}</b>{c.message}</p></div>)}</div><details><summary>HW / SW 검토 결과</summary><p>{project.build.evaluator.summary}</p>{[project.build.evaluator.hw, project.build.evaluator.sw].map((v, i) => <p key={i}><span className={`pill ${v.verdict}`}>{i ? "SW" : "HW"} · {v.verdict}</span> {v.findings.join(" ")}</p>)}</details></>}
        {item.kind === "product" && project.productForm && <><div className="artifact-title"><span className="pill">완성품 미리보기</span><h3>{project.name}</h3></div><MockupView blueprint={project.build?.blueprint ?? { title: project.name, board: "", supplyVoltage: 5, components: [], nets: [], enclosure: { widthMm: 40, depthMm: 40, heightMm: 40, wallMm: 2 }, firmware: { platform: "arduino", behavior: "", pinAssignments: [], loopSteps: [] }, assumptions: [], humanChecks: [] }} form={project.productForm} /></>}
        {item.kind === "contract" && project.dataContract && <ContractView project={project} onAction={onAction} busy={busy} />}
        {item.kind === "power" && project.power && <PowerView project={project} />}
        {item.kind === "tests" && project.testPlan && <TestView project={project} onAction={onAction} busy={busy} />}
        {item.kind === "safety" && project.safety && <SafetyView project={project} onAction={onAction} busy={busy} />}
        {item.kind === "housing" && project.housing && project.productForm && <HousingView project={project} />}
        {item.kind === "assembly" && project.assembly && <AssemblyView project={project} busy={busy} onAction={onAction} connectorOnly={connectorOnly} />}
        {item.kind === "cad" && project.build && <><div className="artifact-title"><span className="pill">치수 기반 3D</span><h3>{item.filename}</h3></div><MockupView blueprint={project.build.blueprint} /></>}
        {item.kind === "bom" && project.build && <><h3>{project.name} · 부품목록</h3><p className="notice">구매 전 정확한 모델·수량·가격·판매처 재고를 확인해주세요. 출처의 가격은 확인한 날짜 기준이에요.</p><table className="bom-table"><thead><tr><th>부품 / 용도</th><th>진행 상태</th></tr></thead><tbody>{project.build.blueprint.components.map(c => <tr key={c.ref}><td><small>{c.ref} · 수량 확인 필요</small><strong>{c.valueOrModel}</strong><p>{c.reason}</p>{(workflow.partSources?.[c.ref] ?? []).map(s => <p className="part-source" key={s.url}><a href={s.url} target="_blank" rel="noreferrer noopener">↗ {s.title}</a>{s.price && <> · {s.price}</>} <small>{s.checkedAt.slice(0, 10)} 확인</small></p>)}</td><td><select aria-label={`${c.ref} 구매 상태`} value={workflow.purchases[c.ref] ?? "needed"} disabled={busy} onChange={e => onAction({ action: "purchase", ref: c.ref, status: e.target.value })}><option value="needed">구매 예정</option><option value="ordered">주문 완료</option><option value="received">수령 완료</option><option value="problem">문제 발생</option></select></td></tr>)}</tbody></table></>}
        {item.kind === "tasks" && <TaskView project={project} onAction={onAction} busy={busy} ownerName={ownerName} newMarks={newMarks} />}
        {item.kind === "record" && <><h3>팀 공통 기록</h3>{workflow.sharedUpdates.map(u => <article className="shared-record" key={u.id}><span className="pill">{AGENTS[u.agent].name}</span><p>{u.text}</p><small>{new Date(u.createdAt).toLocaleString("ko-KR")}</small></article>)}<HistoryList project={project} onAction={onAction} busy={busy} /></>}
        {(item.kind === "file" || item.kind === "plan") && item.mimeType.startsWith("text/html") && <iframe title={item.filename} className="file-preview" sandbox="" referrerPolicy="no-referrer" srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">${item.content}`} />}
      </>}
    </div>
    <footer className="artifact-footer"><span>● 저장됨 · {item.filename}</span><button disabled={busy} onClick={() => onAction({ action: "reopen" })}>설계 다시 논의</button></footer>
  </aside>;
}
