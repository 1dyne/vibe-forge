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

export default function StatusPanel({ project, board, items, newMarks, shortNames, busy, onRoom, onOpenItem, onAction, onBoard, onClose }: {
  project: LocalProject; board: BoardView; items: WorkbenchItem[]; newMarks: string[]; shortNames: boolean; busy: boolean;
  onRoom: (room: AgentId) => void;
  onOpenItem: (id: string) => void;
  onAction: (input: Record<string, unknown>) => void;
  /** 현황판에서 사람이 직접 하는 일(지금 하는 일 적기 등) */
  onBoard: (body: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [now, setNow] = useState(board.real.now?.text ?? "");
  const [editingNow, setEditingNow] = useState(false);
  const mine = board.cards.filter((card) => card.active && card.turn === "person");
  const open = board.cards.filter((card) => card.turn !== "done");
  const pending = board.real.deliveries.filter((d) => d.status !== "arrived");
  return <aside className="artifact-panel status-panel" id="workbench-panel" data-tour="workbench" aria-label="현황판">
    <header className="artifact-header"><div><h2>현황판</h2></div><div className="workbench-header-actions"><button className="icon-button" onClick={onClose} aria-label="현황판 접기">×</button></div></header>
    <div className="status-scroll">
      <section className="status-block">
        <h3>지금 할 일</h3>
        {board.nextForPerson
          ? <button className="next-card" onClick={() => onRoom(board.nextForPerson!.room)}><small>{agentName(board.nextForPerson.room, shortNames)} 방</small><strong>{board.nextForPerson.title}</strong><span>{board.nextForPerson.ask}</span><em>방으로 가기 →</em></button>
          : <p className="status-empty">{board.cards.length ? (open.length ? "지금은 달그락들이 일하는 중이에요. 내 차례가 오면 여기에 떠요." : "모든 작업 카드가 끝났어요.") : "대장 달그락과 설계를 마치면, 달그락마다 방이 열리고 내가 할 일이 여기에 떠요."}</p>}
        {mine.length > 1 && <ul className="status-list">{mine.slice(1).map((card) => <li key={card.id}><button onClick={() => onRoom(card.owner)}><span className={"agent-dot dot-" + card.owner} />{card.title}<small>{agentName(card.owner, shortNames)} 방</small></button></li>)}</ul>}
      </section>

      {board.rooms.length > 0 && <section className="status-block">
        <h3>방 <small>{board.progress.done}/{board.progress.total} 완료</small></h3>
        <ul className="status-list rooms-list">{board.rooms.map((room) => <li key={room.room}><button onClick={() => onRoom(room.room)}>
          <span className={"agent-dot dot-" + room.room} />{agentName(room.room, shortNames)}
          <small>{[room.working && `작업 ${room.working}`, room.waiting && `대기 ${room.waiting}`, room.blocked && `막힘 ${room.blocked}`, room.done && `완료 ${room.done}`].filter(Boolean).join(" · ") || "카드 없음"}</small>
          {room.myTurn > 0 && <em className="turn-badge" aria-label={`내 차례 ${room.myTurn}개`}>{room.myTurn}</em>}
        </button></li>)}</ul>
        <ul className="card-list">{open.map((card) => <li key={card.id} className={"turn-" + card.turn + (card.active ? "" : " held")}>
          <span className={"agent-dot dot-" + card.owner} /><b>{card.title}</b>
          <small>{card.heldBy.length ? "앞 작업을 기다리는 중" : card.turn === "waiting" ? `${card.waiting?.what ?? "기다리는 중"}${card.waiting?.expectedAt ? ` · ${day(card.waiting.expectedAt)} 예정` : ""}${card.overdue ? " · 예정일 지남" : ""}` : card.turn === "blocked" ? `막힘 · ${card.note ?? ""}` : TURN[card.turn]}</small>
        </li>)}</ul>
      </section>}

      <section className="status-block">
        <h3>현실에서</h3>
        {editingNow
          ? <form className="now-form" onSubmit={(e) => { e.preventDefault(); void onBoard({ action: "now", text: now.trim() || null }).then(() => setEditingNow(false)); }}><input autoFocus value={now} maxLength={200} placeholder="예: 납땜 3단계 하는 중" onChange={(e) => setNow(e.target.value)} /><button disabled={busy}>저장</button></form>
          : <button className="now-line" onClick={() => { setNow(board.real.now?.text ?? ""); setEditingNow(true); }}>{board.real.now ? <>지금: <b>{board.real.now.text}</b></> : "지금 하고 있는 일 적어두기"}<small>달그락들이 보고 맞춰요</small></button>}
        {board.real.availability && <p className="status-note">여건: {board.real.availability.text}</p>}
        {pending.length > 0 && <ul className="card-list">{pending.map((d) => { const late = board.overdue.some((o) => o.kind === "delivery" && o.label === d.label); return <li key={d.label} className={late ? "turn-blocked" : "turn-waiting"}><b>{d.label}</b><small>{DELIVERY[d.status]}{d.expectedAt ? ` · ${day(d.expectedAt)} 도착 예정` : " · 도착일 모름"}{late ? " · 예정일 지남" : ""}{d.note ? ` · ${d.note}` : ""}</small>
          <button className="mini" disabled={busy} onClick={() => void onBoard({ action: "delivery", label: d.label, ...(d.ref ? { ref: d.ref } : {}), status: "arrived" })}>도착했어요</button></li>; })}</ul>}
        {!pending.length && !board.real.availability && <p className="status-empty">주문·배송·출력처럼 기다려야 하는 일은 달그락에게 말하면 여기에 남아요.</p>}
      </section>

      <section className="status-block status-progress"><h3>진행 단계</h3><ProgressPanel project={project} onAction={onAction} busy={busy} /></section>

      <section className="status-block">
        <h3>결과물 <small>{items.length}</small></h3>
        {items.length ? <ul className="status-list">{items.map((item) => <li key={item.id}><button onClick={() => onOpenItem(item.id)}>{item.label}{newMarks.includes(item.id) && <em className="new-dot" role="img" aria-label="새로 온 것" />}<small>{item.filename.split(".").pop()}</small></button></li>)}</ul>
          : <p className="status-empty">설계도·회로·3D·문서가 만들어지면 여기에 쌓여요.</p>}
      </section>
    </div>
  </aside>;
}
