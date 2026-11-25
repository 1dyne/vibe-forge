"use client";
import type { LocalProject } from "../lib/project-types";
import { costText, revisionOf, type RevisionProposal } from "../lib/revision";
import { agentName } from "../lib/workflow";

// 수정안: 승인된 설계를 고치자는 달그락의 제안. 무엇이 바뀌고, 이미 한 일 가운데
// 무엇을 다시 해야 하는지를 먼저 보여주고, 사람이 승인해야 적용된다.

const STATUS: Record<RevisionProposal["status"], string> = { proposed: "승인을 기다려요", approved: "승인했어요", rejected: "거절했어요", superseded: "새 수정안으로 바뀌었어요" };
const day = (iso: string) => iso.slice(0, 10).replace(/-/g, ".");

function Lost({ proposal }: { proposal: RevisionProposal }) {
  const inv = proposal.impact.invalidated;
  const lines = [
    ...inv.purchases,
    ...inv.assemblySteps.map((step) => `조립 ${step}`),
    ...inv.reprint.map((region) => `하우징 「${region}」 다시 만들기`),
    ...inv.tests.map((test) => `테스트 ${test}`),
    ...(inv.firmware ? ["보드에 올린 코드 다시 올리기"] : [])
  ];
  if (!lines.length) return null;
  return <div className="rv-block rv-lost"><h4>이미 한 일 가운데 다시 해야 하는 것</h4><ul>{lines.map((line, index) => <li key={index}>{line}</li>)}</ul></div>;
}

function Card({ proposal, shortNames, busy, onDecide }: { proposal: RevisionProposal; shortNames: boolean; busy: boolean; onDecide?: (proposalId: string, decision: "approve" | "reject") => void }) {
  const impact = proposal.impact;
  return <article className={`rv-card rv-${proposal.status}`}>
    <header><small>{agentName(proposal.by, shortNames)} · {day(proposal.createdAt)}</small><strong>{proposal.title}</strong></header>
    <p className="rv-reason"><b>왜 고치나요</b>{proposal.reason}</p>
    {impact.changes.length > 0 && <div className="rv-block"><h4>바뀌는 것</h4><ul>{impact.changes.map((line, index) => <li key={index}>{line}</li>)}</ul></div>}
    {impact.wiring.length > 0 && <details className="rv-block"><summary>선 {impact.wiring.length}곳 자세히 보기</summary><ul>{impact.wiring.map((line, index) => <li key={index}>{line}</li>)}</ul></details>}
    <Lost proposal={proposal} />
    {impact.redo.length > 0 && <div className="rv-block rv-redo"><h4>{proposal.status === "approved" ? "다시 할 일 (할 일 목록에 넣었어요)" : "승인하면 내가 다시 할 일"}</h4><ol>{impact.redo.map((task) => <li key={task.title}><b>{task.title}</b><span>{task.plain}</span></li>)}</ol></div>}
    <p className="rv-cost"><b>비용</b>{costText(impact) || "달라지지 않아요"}</p>
    {onDecide && proposal.status === "proposed" && <footer>
      <button className="rv-approve" disabled={busy} onClick={() => onDecide(proposal.id, "approve")}>이대로 고치기</button>
      <button className="rv-reject" disabled={busy} onClick={() => onDecide(proposal.id, "reject")}>지금 설계 그대로 두기</button>
      <small>승인해야 설계가 바뀌어요. 달그락은 대신 승인할 수 없어요.</small>
    </footer>}
    {proposal.status !== "proposed" && <p className="rv-status">{STATUS[proposal.status]}{proposal.decidedAt ? ` · ${day(proposal.decidedAt)}` : ""}</p>}
  </article>;
}

export default function RevisionView({ project, busy, onDecide, shortNames = false }: {
  project: Pick<LocalProject, "revision">;
  busy: boolean;
  /** 사람의 결정. /api/projects/<id>/revision 으로 POST {action, proposalId} 를 보낸다 */
  onDecide: (proposalId: string, decision: "approve" | "reject") => void;
  shortNames?: boolean;
}) {
  const proposals = revisionOf(project).proposals;
  const pending = proposals.filter((p) => p.status === "proposed").reverse();
  const past = proposals.filter((p) => p.status !== "proposed").reverse();
  if (!proposals.length) return <div className="rv-view"><p className="rv-empty">아직 수정안이 없어요. 만들다가 안 맞는 곳이 생기면 달그락에게 말해 주세요. 무엇이 바뀌고 무엇을 다시 해야 하는지 정리해서 여기에 올려요.</p></div>;
  return <div className="rv-view">
    {pending.length > 0
      ? <><h3 className="rv-heading">승인을 기다리는 수정안 <em>{pending.length}</em></h3>{pending.map((proposal) => <Card key={proposal.id} proposal={proposal} shortNames={shortNames} busy={busy} onDecide={onDecide} />)}</>
      : <p className="rv-empty">지금 기다리는 수정안은 없어요.</p>}
    {past.length > 0 && <details className="rv-history"><summary>지난 수정안 {past.length}개</summary>{past.map((proposal) => <Card key={proposal.id} proposal={proposal} shortNames={shortNames} busy={busy} />)}</details>}
  </div>;
}
