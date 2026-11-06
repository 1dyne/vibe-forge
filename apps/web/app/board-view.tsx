"use client";
import { useEffect, useState } from "react";
import type { DesignConflict, LocalProject, ProjectTask, TaskAssignee } from "../lib/project-types";
import { AGENTS } from "../lib/workflow";
import { assigneeOf, claimExpired, isOpenTask } from "../lib/coordination";
import { OpenButtons, WorkspaceSection } from "./workspace-links";

// The shared board: decisions waiting for the person, the person's tasks in
// order, and what each agent is doing. Agents' tasks are read-only here.

const STATUS: Record<ProjectTask["status"], string> = { ready: "할 예정", in_progress: "하는 중", blocked: "막힘", cannot: "못 함", completed: "완료", cancelled: "취소됨" };
const STATUS_CLASS: Record<ProjectTask["status"], string> = { ready: "unknown", in_progress: "doing", blocked: "fail", cannot: "fail", completed: "pass", cancelled: "" };
const CANNOT_REASONS = ["측정·작업 방법을 모르겠어요", "필요한 도구가 없어요", "부품에 손이 닿지 않아요", "위험해 보여요"];
const won = (v: number | null) => v == null ? "비용 차이 미정" : v === 0 ? "비용 차이 없음" : `${v > 0 ? "+" : ""}${v.toLocaleString("ko-KR")}원`;
const who = (a: TaskAssignee) => a === "human" ? "나" : AGENTS[a].name;

export function BoardView({ project, onAction, busy, focus }: { project: LocalProject; onAction: (input: Record<string, unknown>) => void; busy: boolean; focus?: string | null }) {
  useEffect(() => { if (focus) document.getElementById(`board-${focus.replace(":", "-")}`)?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [focus]);
  const conflicts = (project.conflicts ?? []).filter((c) => c.status === "open" || c.status === "reviewing");
  const settled = (project.conflicts ?? []).filter((c) => c.status === "resolved").slice(-5).reverse();
  const open = project.tasks.filter(isOpenTask);
  const mine = open.filter((t) => assigneeOf(t) === "human");
  const agents = open.filter((t) => assigneeOf(t) !== "human");
  const done = project.tasks.filter((t) => !isOpenTask(t)).slice(-8).reverse();
  const lanes = Array.from(new Set(agents.map(assigneeOf))) as Exclude<TaskAssignee, "human">[];
  return <div className="board">
    {conflicts.length > 0 && <section aria-labelledby="board-conflicts"><h3 id="board-conflicts">결정해 주세요 <span className="count">{conflicts.length}</span></h3>{conflicts.map((c) => <ConflictCard key={c.id} conflict={c} onAction={onAction} busy={busy} focused={focus === `conflict:${c.id}`} />)}</section>}
    <section aria-labelledby="board-mine"><h3 id="board-mine">내가 할 일 <span className="count">{mine.length}</span></h3>
      {mine.length ? <ol className="task-list">{mine.map((t) => <HumanTask key={t.id} project={project} task={t} onAction={onAction} busy={busy} focused={focus === `task:${t.id}`} blockedBy={(t.dependsOn ?? []).map((id) => project.tasks.find((x) => x.id === id)).filter((x): x is ProjectTask => !!x && isOpenTask(x))} />)}</ol> : <p className="muted">지금 내가 할 일은 없어요. 새로 생기면 여기에 나타나요.</p>}
    </section>
    <section aria-labelledby="board-agents"><h3 id="board-agents">달그락들이 하는 일</h3>
      {lanes.length ? lanes.map((lane) => <div className="lane" key={lane}><h4><span className={`agent-dot dot-${lane}`} />{AGENTS[lane].name}<OpenButtons project={project} role={lane} compact /></h4><ul>{agents.filter((t) => assigneeOf(t) === lane).map((t) => { const expired = claimExpired(t); const status = expired ? "ready" : t.status; return <li key={t.id} id={`board-task-${t.id}`} className={focus === `task:${t.id}` ? "focused" : ""}><span className={`pill ${STATUS_CLASS[status]}`}>{STATUS[status]}</span> <strong>{t.title}</strong><p>{t.plain}</p>{t.claimedBy && !expired && status === "in_progress" && <small>진행 중인 곳: {/^https:\/\/claude\.ai\/code\/session_/.test(t.claimedBy) ? <a href={t.claimedBy} target="_blank" rel="noreferrer noopener">세션 열기 ↗</a> : t.claimedBy}</small>}{t.dispatch && !t.dispatch.ok && <small className="task-note">Code를 깨우지 못했어요{t.dispatch.status ? ` (응답 ${t.dispatch.status})` : ""}. 작업 공간의 연결을 확인해 주세요.</small>}{expired && <small>2시간 넘게 소식이 없어 다시 맡을 수 있는 상태예요.</small>}{t.note && <small className="task-note">메모: {t.note}</small>}</li>; })}</ul></div>) : <p className="muted">에이전트가 맡은 일이 아직 없어요.</p>}
    </section>
    <WorkspaceSection project={project} onAction={onAction} busy={busy} />
    {(done.length > 0 || settled.length > 0) && <details className="board-done"><summary>끝난 일 · 정리된 결정</summary><ul>{settled.map((c) => <li key={c.id}>✓ {c.title}{c.resolution?.note ? ` — ${c.resolution.note}` : ""}</li>)}{done.map((t) => <li key={t.id}>{t.status === "completed" ? "✓" : "–"} [{who(assigneeOf(t))}] {t.title}{t.response ? ` — ${Object.entries(t.response.values).map(([k, v]) => `${t.form?.fields.find((f) => f.key === k)?.label ?? k} ${v}${t.response!.judgements[k] === "abnormal" ? " (범위 밖)" : ""}`).join(", ")}` : t.note ? ` — ${t.note}` : ""}</li>)}</ul></details>}
    <p className="muted">결과를 보내도 검증 합격으로 바로 처리되지 않아요. 달그락이 결과를 보고 다음 할 일을 정해요.</p>
  </div>;
}

function HumanTask({ project, task, onAction, busy, focused, blockedBy }: { project: LocalProject; task: ProjectTask; onAction: (input: Record<string, unknown>) => void; busy: boolean; focused: boolean; blockedBy: ProjectTask[] }) {
  const [mode, setMode] = useState<null | "completed" | "blocked" | "cannot" | "question">(null);
  const [note, setNote] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [help, setHelp] = useState<string | null>(null);
  const send = (status: string, text?: string) => { onAction({ action: "task_status", taskId: task.id, status, ...(text?.trim() ? { note: text.trim() } : {}) }); setMode(null); setNote(""); };
  const form = task.form;
  const missing = form ? form.fields.filter((f) => f.required && !values[f.key]?.trim()) : [];
  const submitForm = () => { onAction({ action: "task_submit", taskId: task.id, values: Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim())), ...(note.trim() ? { note: note.trim() } : {}) }); setNote(""); };
  return <li id={`board-task-${task.id}`} className={`human-task ${focused ? "focused" : ""}`}>
    <div className="task-head"><span className={`pill ${STATUS_CLASS[task.status]}`}>{STATUS[task.status]}</span><strong>{task.title}</strong></div>
    <p>{task.plain}</p>
    {task.howTo?.length ? <div className="how-to"><b>이렇게 해요</b><ol>{task.howTo.map((step, i) => <li key={i}>{step}</li>)}</ol></div> : null}
    {task.doneWhen && <small>완료 기준: {task.doneWhen}</small>}
    {blockedBy.length > 0 && <small className="task-note">먼저 끝낼 일: {blockedBy.map((t) => t.title).join(", ")}</small>}
    {task.note && <small className="task-note">내 메모: {task.note}</small>}
    {task.createdBy && task.createdBy !== "human" && task.createdBy !== "server" && <small className="task-with">요청한 달그락: {AGENTS[task.createdBy].name} <OpenButtons project={project} role={task.createdBy} compact /></small>}
    {task.kind === "run_firmware" && <small className="muted">보드를 USB로 꽂아 올리는 일은 내 컴퓨터에서만 돼요.</small>}
    {form && <div className="task-form">
      <details className="form-info"><summary>정보 · 무엇을 왜 넣나요</summary><p>{form.help}</p></details>
      {form.fields.map((f) => <div className="form-field" key={f.key}>
        <label htmlFor={`f-${task.id}-${f.key}`}>{f.label}{f.required ? <span aria-hidden> *</span> : <small> (선택)</small>}{f.expected && <small> · 정상 {f.expected.min ?? "…"}~{f.expected.max ?? "…"}{f.unit ?? ""}</small>}</label>
        <div className="form-input">
          {f.type === "choice" ? <select id={`f-${task.id}-${f.key}`} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}><option value="">고르세요</option>{f.choices?.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            : f.type === "text" && f.long ? <textarea id={`f-${task.id}-${f.key}`} rows={2} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            : <input id={`f-${task.id}-${f.key}`} type={f.type === "link" ? "url" : "text"} inputMode={f.type === "number" ? "decimal" : undefined} placeholder={f.type === "link" ? "https://" : ""} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />}
          {f.unit && f.type === "number" && <span className="unit">{f.unit}</span>}
          {f.help && <button type="button" className="help-button" aria-label={`${f.label} 도움말`} aria-expanded={help === f.key} onClick={() => setHelp(help === f.key ? null : f.key)}>?</button>}
        </div>
        {help === f.key && <small className="field-help">{f.help}</small>}
      </div>)}
      <textarea aria-label="메모" rows={2} value={note} placeholder="덧붙일 말 (선택)" onChange={(e) => setNote(e.target.value)} />
      <div className="task-actions"><button className="primary" disabled={busy || missing.length > 0} onClick={submitForm}>정보 보내기</button>{missing.length > 0 && <small>필수 칸 {missing.length}개가 남았어요</small>}</div>
    </div>}
    {(task.questions ?? []).map((q) => <div className="task-question" key={q.id}><small>내 질문: {q.text}</small>{q.answer ? <p>↳ {q.answeredBy ? AGENTS[q.answeredBy].name : "달그락"}: {q.answer}</p> : <small className="muted">답을 기다리고 있어요</small>}</div>)}
    {mode === null ? <div className="task-actions">
      {task.status !== "in_progress" && <button disabled={busy} onClick={() => send("in_progress")}>하는 중</button>}
      {!form && <button className="primary" disabled={busy} onClick={() => setMode("completed")}>완료 · 결과 보내기</button>}
      <button disabled={busy} onClick={() => setMode("blocked")}>막혔어요</button>
      <button disabled={busy} onClick={() => setMode("cannot")}>할 수 없어요</button>
      <button className="link-button" disabled={busy} onClick={() => setMode("question")}>질문 남기기</button>
    </div> : <div className="evidence-input">
      {mode === "cannot" && <div className="reason-chips" role="group" aria-label="할 수 없는 이유">{CANNOT_REASONS.map((r) => <button type="button" key={r} className={note === r ? "selected" : ""} onClick={() => setNote(r)}>{r}</button>)}</div>}
      <textarea aria-label={`${task.title} ${mode === "completed" ? "결과" : mode === "question" ? "질문" : "이유"}`} value={note} placeholder={mode === "completed" ? "측정값, 오류 메시지, 확인한 내용을 적어주세요 (선택)" : mode === "question" ? "무엇이 궁금한지 적어주세요. 요청한 달그락이 답해요." : mode === "blocked" ? "어디서 막혔는지 적어주세요" : "이유를 고르거나 적어주세요"} onChange={(e) => setNote(e.target.value)} />
      <div className="task-actions"><button className="primary" disabled={busy || (mode !== "completed" && !note.trim())} onClick={() => { if (mode === "question") { onAction({ action: "task_question", taskId: task.id, text: note.trim() }); setMode(null); setNote(""); } else send(mode, note); }}>{mode === "completed" ? "완료로 보내기" : mode === "question" ? "질문 보내기" : "달그락에게 알리기"}</button><button disabled={busy} onClick={() => { setMode(null); setNote(""); }}>취소</button></div>
    </div>}
  </li>;
}

function ConflictCard({ conflict, onAction, busy, focused }: { conflict: DesignConflict; onAction: (input: Record<string, unknown>) => void; busy: boolean; focused: boolean }) {
  const [proposal, setProposal] = useState("");
  const [writing, setWriting] = useState(false);
  const reviewing = conflict.status === "reviewing";
  return <article id={`board-conflict-${conflict.id}`} className={`conflict-card ${focused ? "focused" : ""}`}>
    <header><span className="pill unknown">{conflict.afterFinal ? "확정 뒤 변경 제안" : { rule: "규칙 검사", stock: "재고", interface: "HW·SW 연결", agent: "설계 충돌", change: "변경 제안" }[conflict.source]}</span><strong>{conflict.title}</strong></header>
    <p>{conflict.detail}</p>
    {reviewing ? <p className="notice">내 제안을 대장이 검토하고 있어요: “{conflict.resolution?.proposal}”</p> : conflict.options.length === 0 ? <p className="notice">대장이 선택지를 준비하고 있어요. 먼저 제안할 것이 있으면 아래에 적어주세요.</p> : <div className="conflict-options">{conflict.options.map((o) => <div className="conflict-option" key={o.id}>
      <strong>{o.label}</strong><span className="cost">{won(o.costDeltaKRW)}</span><p>{o.detail}</p>
      {o.changes.length > 0 && <small>바뀌는 것: {o.changes.join(" · ")}</small>}
      {o.affects.length > 0 && <small>다시 할 일: {o.affects.join(" · ")}</small>}
      <button className="primary" disabled={busy} onClick={() => onAction({ action: "resolve_conflict", conflictId: conflict.id, optionId: o.id })}>이걸로 할게요</button>
    </div>)}</div>}
    {!reviewing && (writing ? <div className="evidence-input"><textarea aria-label="제3안 제안" value={proposal} placeholder="다른 방법이 있으면 적어주세요. 대장이 검토한 뒤 다시 알려드려요." onChange={(e) => setProposal(e.target.value)} /><div className="task-actions"><button className="primary" disabled={busy || !proposal.trim()} onClick={() => { onAction({ action: "resolve_conflict", conflictId: conflict.id, proposal: proposal.trim() }); setWriting(false); setProposal(""); }}>제안 보내기</button><button disabled={busy} onClick={() => setWriting(false)}>취소</button></div></div> : <button className="link-button" disabled={busy} onClick={() => setWriting(true)}>다른 방법을 제안할게요</button>)}
  </article>;
}
