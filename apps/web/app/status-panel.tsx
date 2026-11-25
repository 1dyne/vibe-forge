"use client";
import { useState } from "react";
import type { BoardView, CardTurn } from "../lib/board";
import type { AgentId, LocalProject } from "../lib/project-types";
import type { WorkbenchItem } from "../lib/workbench";
import { agentName } from "../lib/workflow";
import ProgressPanel from "./progress-panel";

// 오른쪽 패널: 이 프로젝트가 지금 어디에 있는지. Claude Code의 오른쪽 패널(환경·결과물)
// 자리다. 대화는 방마다 따로지만 여기는 하나라서, 어느 방에 있든 같은 것을 본다.
// 결과물을 누르면 같은 자리에 그 파일이 열린다.

const TURN: Record<CardTurn, string> = { agent: "달그락 작업 중", person: "내 차례", waiting: "기다리는 중", blocked: "막힘", done: "완료" };
const DELIVERY = { ordered: "주문함", delayed: "지연", arrived: "도착", problem: "문제" } as const;
const day = (iso: string) => iso.slice(5, 10).replace("-", "/");

export default function StatusPanel({ mode, project, board, items, newMarks, shortNames, busy, onRoom, onOpenItem, onAction, onBoard, onProjectSettings, onDevConnect, onClose }: {
  /** status = 작업대, files = 파일 모아보기 */
  mode: "status" | "files";
  project: LocalProject; board: BoardView; items: WorkbenchItem[]; newMarks: string[]; shortNames: boolean; busy: boolean;
  onRoom: (room: AgentId) => void;
  onOpenItem: (id: string) => void;
  onAction: (input: Record<string, unknown>) => void;
  /** 작업대에서 사람이 직접 하는 일(지금 하는 일 적기 등) */
  onBoard: (body: Record<string, unknown>) => Promise<void>;
  onProjectSettings: () => void;
  onDevConnect: () => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(board.real.now?.text ?? "");
  const [editingNow, setEditingNow] = useState(false);
  const mine = board.cards.filter((card) => card.active && card.turn === "person");
  const open = board.cards.filter((card) => card.turn !== "done");
  const pending = board.real.deliveries.filter((d) => d.status !== "arrived");
  const files = <ul className="status-list">{items.map((item) => <li key={item.id}><button onClick={() => onOpenItem(item.id)}>{item.label}{newMarks.includes(item.id) && <em className="new-dot" role="img" aria-label="새로 온 것" />}<small>{item.filename.split(".").pop()}</small></button></li>)}</ul>;

  if (mode === "files") return <aside className="artifact-panel status-panel" id="workbench-panel" aria-label="파일">
    <header className="artifact-header"><div><h2>파일 <span className="artifact-count">{items.length}</span></h2></div><div className="workbench-header-actions"><button className="icon-button" onClick={onClose} aria-label="닫기">×</button></div></header>
    <div className="status-scroll">{items.length ? files : <p className="status-empty">아직 만들어진 파일이 없어요.</p>}</div>
  </aside>;

  // 글을 줄인다: 비어 있는 칸은 아예 보이지 않고, 자세한 목록은 접어 둔다.
  return <aside className="artifact-panel status-panel" id="workbench-panel" data-tour="workbench" aria-label="작업대">
    <header className="artifact-header"><div><h2>작업대</h2></div><div className="workbench-header-actions"><details className="gear-menu"><summary aria-label="이 프로젝트의 설정" title="이 프로젝트의 설정">⚙</summary><div><button onClick={onProjectSettings}>프로젝트 설정<small>목적 · 기한 · 예산</small></button><button onClick={onDevConnect}>앱·코드 만들기 연결<small>쓰는 도구와 명세서</small></button></div></details><button className="icon-button" onClick={onClose} aria-label="작업대 접기">×</button></div></header>
    <div className="status-scroll">
      {board.nextForPerson && <section className="status-block">
        <h3>지금 할 일</h3>
        <button className="next-card" onClick={() => onRoom(board.nextForPerson!.room)}><small>{agentName(board.nextForPerson.room, shortNames)}</small><strong>{board.nextForPerson.title}</strong><span>{board.nextForPerson.ask}</span></button>
        {mine.length > 1 && <ul className="status-list">{mine.slice(1).map((card) => <li key={card.id}><button onClick={() => onRoom(card.owner)}><span className={"agent-dot dot-" + card.owner} />{card.title}</button></li>)}</ul>}
      </section>}

      {board.rooms.length > 0 && <section className="status-block">
        <h3>달그락들 <small>{board.progress.done}/{board.progress.total}</small></h3>
        <ul className="status-list rooms-list">{board.rooms.map((room) => { const state = room.myTurn ? "내 차례" : room.blocked ? "막힘" : room.working ? "작업 중" : room.waiting ? "기다리는 중" : "끝남"; return <li key={room.room}><button onClick={() => onRoom(room.room)}>
          <span className={"agent-dot dot-" + room.room} />{agentName(room.room, shortNames)}<small>{state}</small>
          {room.myTurn > 0 && <em className="turn-badge" aria-label={`내 차례 ${room.myTurn}개`}>{room.myTurn}</em>}
        </button></li>; })}</ul>
        {open.length > 0 && <details className="status-details"><summary>일 목록 {open.length}</summary><ul className="card-list">{open.map((card) => <li key={card.id} className={"turn-" + card.turn + (card.active ? "" : " held")}>
          <span className={"agent-dot dot-" + card.owner} /><b>{card.title}</b>
          <small>{card.heldBy.length ? "앞 일을 기다림" : card.turn === "waiting" ? `${card.waiting?.what ?? "기다림"}${card.waiting?.expectedAt ? ` · ${day(card.waiting.expectedAt)}` : ""}${card.overdue ? " · 예정일 지남" : ""}` : card.turn === "blocked" ? `막힘 · ${card.note ?? ""}` : TURN[card.turn]}</small>
        </li>)}</ul></details>}
      </section>}

      {(pending.length > 0 || board.real.now || board.real.availability || board.cards.length > 0) && <section className="status-block">
        <h3>기다리는 것</h3>
        {pending.length > 0 && <ul className="card-list">{pending.map((d) => { const late = board.overdue.some((o) => o.kind === "delivery" && o.label === d.label); return <li key={d.label} className={late ? "turn-blocked" : "turn-waiting"}><b>{d.label}</b>
          <button className="mini" disabled={busy} onClick={() => void onBoard({ action: "delivery", label: d.label, ...(d.ref ? { ref: d.ref } : {}), status: "arrived" })}>도착했어요</button>
          <small>{DELIVERY[d.status]}{d.expectedAt ? ` · ${day(d.expectedAt)}` : ""}{late ? " · 예정일 지남" : ""}</small></li>; })}</ul>}
        {editingNow
          ? <form className="now-form" onSubmit={(e) => { e.preventDefault(); void onBoard({ action: "now", text: now.trim() || null }).then(() => setEditingNow(false)); }}><input autoFocus value={now} maxLength={200} placeholder="예: 납땜 3단계 하는 중" onChange={(e) => setNow(e.target.value)} /><button disabled={busy}>저장</button></form>
          : <button className="now-line" onClick={() => { setNow(board.real.now?.text ?? ""); setEditingNow(true); }}>{board.real.now ? <>지금 <b>{board.real.now.text}</b></> : "지금 하는 일 적기"}</button>}
      </section>}

      <section className="status-block"><details className="status-details" open={!board.cards.length}><summary>진행 단계</summary><div className="status-progress"><ProgressPanel project={project} onAction={onAction} busy={busy} /></div></details></section>

      {items.length > 0 && <section className="status-block"><h3>파일 <small>{items.length}</small></h3>{files}</section>}
    </div>
  </aside>;
}
