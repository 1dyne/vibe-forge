"use client";
import { useState } from "react";
import type { AgentId, LocalProject } from "../lib/project-types";
import { AGENTS } from "../lib/workflow";
import { LINK_LABEL, LOCAL_KINDS, linksFor, routinePrompt, wakeView } from "../lib/workspaces";

// Where each role works, as buttons, and how coding agents are woken.

const WAKE_LABEL = { manual: "직접 열기 · 세션을 열어 말하면 시작해요", schedule: "예약 시간마다 · Claude Code 예약 작업이 보드를 확인해요", event: "바로 깨우기 · 할 일이 생기면 서버가 예약 작업을 호출해요" };

export function OpenButtons({ project, role, compact = false }: { project: LocalProject; role: AgentId; compact?: boolean }) {
  const links = linksFor(project, role);
  if (!links.length) return null;
  return <span className="open-buttons">{links.map((l) => <a key={l.id} className={`button-link ${compact ? "compact" : ""}`} href={l.url} target={l.url.startsWith("https://") ? "_blank" : undefined} rel="noreferrer noopener" title={LOCAL_KINDS.includes(l.kind) ? "내 컴퓨터와 앱이 켜져 있어야 열려요" : undefined}>↗ {LINK_LABEL[l.kind]}</a>)}</span>;
}

export function WorkspaceSection({ project, onAction, busy }: { project: LocalProject; onAction: (input: Record<string, unknown>) => void; busy: boolean }) {
  const w = project.workflow;
  const roles = Array.from(new Set<AgentId>(["chief", ...(w?.activeAgents ?? [])]));
  const wake = wakeView(project);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"claude_project" | "claude_chat">("claude_project");
  const [url, setUrl] = useState("");
  const [fireUrl, setFireUrl] = useState("");
  const [token, setToken] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const local = (w?.links ?? []).some((l) => LOCAL_KINDS.includes(l.kind));
  return <section aria-labelledby="board-workspaces" className="workspace-section"><h3 id="board-workspaces">작업 공간</h3>
    <ul className="workspace-list">{roles.map((role) => <li key={role}><span className={`agent-dot dot-${role}`} /><b>{AGENTS[role].name}</b>
      {linksFor(project, role).length ? <OpenButtons project={project} role={role} /> : <small className="muted">{role === "chief" ? "Claude 프로젝트 주소를 등록하면 버튼이 생겨요" : "세션이 시작되면 버튼이 생겨요"}</small>}
      {(w?.links ?? []).filter((l) => l.role === role && l.registeredBy === "human").map((l) => <button key={l.id} className="link-button" disabled={busy} onClick={() => onAction({ action: "link_remove", id: l.id })} aria-label={`${l.label} 지우기`}>지우기</button>)}
    </li>)}</ul>
    {local && <p className="muted"><small>‘내 컴퓨터’ 버튼은 그 컴퓨터에서 Claude Code나 Codex가 켜져 있어야 열려요. 처음이라면 그 컴퓨터에서 Claude Code를 한 번 실행해 메시지를 보내야 버튼이 동작해요.</small></p>}
    {adding ? <div className="evidence-input">
      <div className="reason-chips" role="group" aria-label="주소 종류">{(["claude_project", "claude_chat"] as const).map((k) => <button type="button" key={k} className={kind === k ? "selected" : ""} onClick={() => setKind(k)}>{LINK_LABEL[k]}</button>)}</div>
      <input className="wide-input" aria-label="대장 주소" placeholder={kind === "claude_project" ? "https://claude.ai/project/…" : "https://claude.ai/chat/…"} value={url} onChange={(e) => setUrl(e.target.value)} />
      <div className="task-actions"><button className="primary" disabled={busy || !url.trim()} onClick={() => { onAction({ action: "link_add", role: "chief", kind, url: url.trim() }); setAdding(false); setUrl(""); }}>등록</button><button disabled={busy} onClick={() => setAdding(false)}>취소</button></div>
      <small className="muted">claude.ai에서 대장과 대화하는 프로젝트(또는 채팅)를 열고 주소창의 주소를 붙여넣어 주세요.</small>
    </div> : <button className="link-button" disabled={busy} onClick={() => setAdding(true)}>+ 대장의 Claude 주소 등록</button>}

    <div className="wake-box"><b>코딩 에이전트 깨우기</b> <span className="pill">{WAKE_LABEL[wake.mode].split(" · ")[0]}</span>
      <p>{WAKE_LABEL[wake.mode].split(" · ")[1]}{wake.reason ? ` — 대장: ${wake.reason}` : ""}</p>
      {wake.mode !== "manual" && <>
        <details open={!wake.eventReady && wake.mode === "event"}><summary>예약 작업 설정 방법</summary>
          <ol className="setup-steps"><li>claude.ai/code/routines에서 새 예약 작업을 만들고, 커넥터에 달그락 대장간을 포함해요.</li><li>프롬프트에 아래 문장을 붙여넣어요. <button className="link-button" onClick={() => setShowPrompt(!showPrompt)}>{showPrompt ? "접기" : "문장 보기"}</button>{showPrompt && <pre className="routine-prompt">{routinePrompt(project)}</pre>}{showPrompt && <button onClick={() => navigator.clipboard?.writeText(routinePrompt(project))}>복사</button>}</li>{wake.mode === "schedule" ? <li>반복 주기를 골라요. 클라우드 예약 작업은 최소 1시간이에요.</li> : <li>트리거에 API를 추가하고, 호출 주소와 토큰을 아래에 등록해요. 토큰은 이 프로젝트 기록 안에 잠가 두고 Claude에게도 보여주지 않아요.</li>}</ol>
        </details>
        {wake.mode === "event" && <div className="wake-connect">
          <small>{wake.eventReady ? "✓ 연결됨" : "아직 연결되지 않았어요"}{wake.lastFire ? ` · 마지막 호출 ${new Date(wake.lastFire.at).toLocaleString("ko-KR")} ${wake.lastFire.ok ? "성공" : `실패${wake.lastFire.status ? ` (${wake.lastFire.status})` : ""}`}` : ""}</small>
          <input className="wide-input" aria-label="예약 작업 호출 주소" placeholder="https://api.anthropic.com/v1/claude_code/routines/trig_…/fire" value={fireUrl} onChange={(e) => setFireUrl(e.target.value)} />
          <input className="wide-input" aria-label="예약 작업 토큰" type="password" autoComplete="off" placeholder={wake.tokenSet ? "토큰 등록됨 (바꿀 때만 입력)" : "sk-ant-…"} value={token} onChange={(e) => setToken(e.target.value)} />
          <div className="task-actions"><button className="primary" disabled={busy || (!fireUrl.trim() && !token.trim())} onClick={() => { onAction({ action: "wake_connect", ...(fireUrl.trim() ? { fireUrl: fireUrl.trim() } : {}), ...(token.trim() ? { token: token.trim() } : {}) }); setFireUrl(""); setToken(""); }}>저장</button>{wake.eventReady && <button disabled={busy} onClick={() => onAction({ action: "wake_test" })}>연결 시험</button>}</div>
        </div>}
        <small className="muted">{wake.deadlineMinutes}분 안에 아무 세션도 할 일을 맡지 않으면 알려드려요.</small>
      </>}
    </div>
  </section>;
}
