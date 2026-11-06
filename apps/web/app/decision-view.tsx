"use client";
import { useState } from "react";
import type { LocalProject } from "../lib/project-types";
import { APPROACH_LABEL, TRANSPORT_LABEL, contractNeeded, staleForContract } from "../lib/agreements";
import { wakeView } from "../lib/workspaces";
import { workflowFor } from "../lib/workflow";

// The decisions made so far, in the order the chief decides them, each with
// its reason and a place to ask the chief about it.

const QUANTITY = { unanswered: "아직 정하지 않았어요", one: "1대 (시제품)", few: "2~10대", dozens: "11~50대", many: "50대 이상·판매" };
const won = (v: number | null | undefined) => v == null ? "미정" : `${v.toLocaleString("ko-KR")}원`;

export function DecisionView({ project, onAction, busy }: { project: LocalProject; onAction: (input: Record<string, unknown>) => void; busy: boolean }) {
  const w = workflowFor(project);
  const plan = project.buildPlan;
  const contract = w.contract;
  const design = w.design;
  const wake = wakeView(project);
  const stale = staleForContract(project);
  const [picked, setPicked] = useState<string[]>(design?.chosen ?? []);
  const nodes: Array<{ topic: string; label: string; answer: React.ReactNode; why?: string; extra?: React.ReactNode }> = [
    { topic: "track", label: "0. 하드웨어가 필요한가요", answer: plan ? { software: "소프트웨어만", hardware: "하드웨어", both: "하드웨어 + 소프트웨어" }[plan.track] : "아직 설계도가 없어요", why: plan?.summary },
    { topic: "io", label: "1. 무엇을 감지하고 무엇을 하나요", answer: plan?.io ? `입력: ${plan.io.inputs.join(", ") || "-"} / 출력: ${plan.io.outputs.join(", ") || "-"} / 무선: ${{ none: "없음", bluetooth: "블루투스", wifi: "와이파이", both: "둘 다" }[plan.io.wireless]}` : "미정" },
    { topic: "board", label: "2. 어떤 보드를 쓰나요", answer: plan ? plan.board.model : "미정", why: plan ? `${plan.board.why}${plan.board.alternatives ? ` · 다른 후보: ${plan.board.alternatives}` : ""}` : undefined },
    { topic: "connection", label: "3. 어떻게 연결하나요", answer: plan ? plan.connection.method : "미정", why: plan?.connection.why },
    { topic: "contract", label: "4. HW와 SW가 어떻게 주고받나요 (연결 약속)", answer: contract?.current ? `v${contract.current.version} · ${TRANSPORT_LABEL[contract.current.transport]} · ${contract.current.summary}` : contractNeeded(project) ? "아직 승인된 약속이 없어요" : "소프트웨어 연결이 필요 없어요", extra: <>
      {contract?.current && <ContractTable c={contract.current} />}
      {stale.length > 0 && <p className="notice">예전 약속 기준으로 만든 할 일이 있어요: {stale.map((t) => `${t.title} (v${t.madeFor})`).join(", ")}. 해당 달그락이 v{stale[0].current} 기준으로 다시 맞춰야 해요.</p>}
      {contract?.draft && <div className="draft-box"><b>새 약속 v{contract.draft.version} 제안 · {TRANSPORT_LABEL[contract.draft.transport]}</b><p>{contract.draft.summary}</p><ContractTable c={contract.draft} /><div className="task-actions"><button className="primary" disabled={busy} onClick={() => onAction({ action: "contract_approve" })}>이 약속으로 할게요</button><button disabled={busy} onClick={() => onAction({ action: "contract_reject" })}>다시 정리해 주세요</button></div><small className="muted">승인하면 설계 슬롯(무선·데이터 행선지)도 이 약속으로 바뀌어요.</small></div>}
    </> },
    { topic: "parts", label: "5. 부품과 비용", answer: plan ? `${plan.modules.length}개 모듈 · 합계 ${won(plan.cost.totalKRW)}${plan.cost.budgetKRW != null ? ` / 예산 ${won(plan.cost.budgetKRW)}` : ""}` : "미정", why: plan?.modules.map((m) => `${m.function}: ${m.part} (${won(m.estPriceKRW)})`).join(" · ") },
    { topic: "power", label: "6. 전력과 배터리", answer: plan?.power ? `${plan.power.source} · 평균 ${plan.power.averageMa ?? "?"}mA${plan.power.estimatedDays != null ? ` · 약 ${plan.power.estimatedDays}일` : ""}${plan.power.measured ? " (실측)" : " (데이터시트 기준, 실측 전)"}` : "아직 전력 예산이 없어요", why: plan?.power?.modes.map((m) => `${m.name} ${m.currentMa}mA × 하루 ${m.hoursPerDay}시간`).join(" · ") },
    { topic: "quantity", label: "7. 몇 대를, 어떻게 만드나요", answer: `${QUANTITY[w.profile.quantity ?? "unanswered"]}${plan ? ` · ${plan.fabrication.plan}` : ""}` },
    { topic: "wake", label: "8. 코딩 일을 어떻게 넘기나요", answer: { manual: "직접 열기", schedule: "예약 시간마다", event: "할 일이 생기면 바로" }[wake.mode], why: wake.reason || undefined },
    { topic: "design", label: "9. 디자인 방향", answer: design?.brief ? `${design.brief.keywords.join(" · ")} · ${APPROACH_LABEL[design.brief.approach]}${design.brief.approvedAt ? " (승인됨)" : " (확인 필요)"}` : design?.refs.length ? "레퍼런스를 골라 주세요" : "아직 레퍼런스가 없어요", extra: design && <>
      {design.refs.length > 0 && <div className="ref-grid">{design.refs.map((r) => <label key={r.id} className={`ref-card ${picked.includes(r.id) ? "on" : ""}`}>
        <input type="checkbox" checked={picked.includes(r.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, r.id] : picked.filter((x) => x !== r.id))} />
        {r.imageUrl && <img src={r.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}
        <b>{r.title}</b><small>가져올 점: {r.takeaways.join(" · ")}</small>{r.avoid.length > 0 && <small>피할 점: {r.avoid.join(" · ")}</small>}<a href={r.url} target="_blank" rel="noreferrer noopener">출처 ↗</a>
      </label>)}</div>}
      {design.refs.length > 0 && <button className="primary" disabled={busy || !picked.length || JSON.stringify([...picked].sort()) === JSON.stringify([...design.chosen].sort())} onClick={() => onAction({ action: "design_pick", refIds: picked })}>고른 {picked.length}개로 방향 잡기</button>}
      {design.brief && <div className="draft-box"><b>디자인 방향 · {APPROACH_LABEL[design.brief.approach]}</b><p>{design.brief.approachWhy}</p><p>비율: {design.brief.proportions}<br />재질·마감·색: {design.brief.cmf}<br />꼭 지킬 것: {design.brief.must.join(" · ") || "-"}<br />하지 말 것: {design.brief.never.join(" · ") || "-"}</p>{!design.brief.approvedAt && <button className="primary" disabled={busy} onClick={() => onAction({ action: "brief_approve" })}>이 방향으로 만들어 주세요</button>}</div>}
    </> }
  ];
  return <div className="decision-tree"><p className="muted">대장이 정한 순서대로예요. 궁금한 결정 옆의 ‘질문하기’를 누르면 대장에게 전달돼요{project.origin === "connector" ? " (Claude 채팅을 열면 대장이 먼저 답해요)" : ""}.</p>
    <ol>{nodes.map((n) => <DecisionNode key={n.topic} project={project} {...n} onAction={onAction} busy={busy} />)}</ol></div>;
}

function ContractTable({ c }: { c: NonNullable<NonNullable<LocalProject["workflow"]>["contract"]>["draft"] & object }) {
  return <table className="contract-table"><tbody>
    {c.endpoints.length > 0 && <tr><th>주소</th><td>{c.endpoints.join(", ")}</td></tr>}
    {c.payload.length > 0 && <tr><th>데이터</th><td>{c.payload.map((f) => `${f.field}(${f.type}${f.unit ? `, ${f.unit}` : ""}) 예: ${f.example}`).join(" · ")}</td></tr>}
    {c.ble && <tr><th>BLE</th><td>{c.ble.service} · {c.ble.characteristics.map((x) => `${x.name} ${x.uuid} [${x.props}]`).join(" · ")}</td></tr>}
    <tr><th>인증</th><td>{c.auth || "-"}</td></tr><tr><th>와이파이 설정</th><td>{c.provisioning || "-"}</td></tr><tr><th>끊겼을 때</th><td>{c.reconnect || "-"}</td></tr><tr><th>업데이트</th><td>{c.updates || "-"}</td></tr>
  </tbody></table>;
}

function DecisionNode({ project, topic, label, answer, why, extra, onAction, busy }: { project: LocalProject; topic: string; label: string; answer: React.ReactNode; why?: string; extra?: React.ReactNode; onAction: (input: Record<string, unknown>) => void; busy: boolean }) {
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const questions = project.tasks.filter((t) => t.topic === topic && t.assignee === "chief").slice(-3);
  return <li className="decision-node"><b>{label}</b><p className="decision-answer">{answer}</p>{why && <small className="muted">{why}</small>}{extra}
    {questions.map((q) => <div className="task-question" key={q.id}><small>내 질문: {q.plain}</small>{q.status === "completed" && q.note ? <p>↳ 대장: {q.note}</p> : <small className="muted">대장이 답을 준비하고 있어요</small>}</div>)}
    {asking ? <div className="evidence-input"><textarea aria-label={`${label} 질문`} value={text} placeholder="이 결정에서 궁금한 점을 적어주세요" onChange={(e) => setText(e.target.value)} /><div className="task-actions"><button className="primary" disabled={busy || !text.trim()} onClick={() => { onAction({ action: "decision_question", topic, label: label.replace(/^\d+\.\s*/, ""), text: text.trim() }); setText(""); setAsking(false); }}>대장에게 묻기</button><button disabled={busy} onClick={() => setAsking(false)}>취소</button></div></div> : <button className="link-button" disabled={busy} onClick={() => setAsking(true)}>질문하기</button>}
  </li>;
}
