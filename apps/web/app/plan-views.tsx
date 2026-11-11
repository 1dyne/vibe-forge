"use client";
import { useState } from "react";
import type { LocalProject } from "../lib/project-types";
import { uploadGuideFor } from "../lib/firmware-guide";
import { findCard } from "../lib/parts/catalog";
import { FIELD_LABEL, RESTORABLE } from "../lib/history";

// 전원·테스트·안전·설계 기록 (명세서 2차 v0.1 §7·§8·§10·§11)
type Act = (input: Record<string, unknown>) => void;

export function PowerView({ project }: { project: LocalProject }) {
  const pw = project.power!, r = pw.result;
  const sums = pw.modes.map((m) => m.loads.reduce((a, l) => a + l.currentMa, 0));
  const max = Math.max(1, ...sums);
  return <div className="plan-view">
    <div className="artifact-title"><span className="pill">전원</span><h3>배터리로 얼마나 가나요</h3></div>
    <p className="power-big">{r.hours != null ? <>약 <b>{r.hours}</b>시간</> : pw.source.kind === "battery" ? "전지 용량을 알면 시간이 나와요" : "USB·어댑터 전원"}{r.estimated && <span className="pill unknown">추정</span>}</p>
    <p className="muted">{{ usb: "USB", battery: "전지", adapter: "어댑터" }[pw.source.kind]} {pw.source.part ?? ""} {pw.source.voltage}V{pw.source.capacityMah ? ` · ${pw.source.capacityMah}mAh` : ""} · 평균 {r.avgCurrentMa}mA · 가장 많이 쓸 때 {r.peakCurrentMa}mA · 효율 {Math.round(pw.regulatorEfficiency * 100)}% · 실사용 {Math.round(pw.derating * 100)}%</p>
    {pw.modes.map((m, i) => <div className="power-mode" key={m.name}>
      <div className="row"><b>{m.name}</b><span>{m.dutyPct}% 시간 · {sums[i]}mA</span></div>
      <div className="bar"><i style={{ width: `${(sums[i] / max) * 100}%` }} /></div>
      <small>{m.loads.map((l) => `${l.ref} ${l.currentMa}mA${l.basis === "assumed" ? "(가정)" : l.basis === "measured" ? "(실측)" : ""}`).join(" · ")}</small>
    </div>)}
    {r.railWarnings.length > 0 && <div className="housing-risks"><h4>주의</h4><ul>{r.railWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
    <p className="muted">시간 = 용량 × 실사용 비율 ÷ 평균 전류. 실제로는 온도·전지 상태에 따라 달라요. 실측값을 알려 주면 다시 계산해요.</p>
  </div>;
}

export function TestView({ project, onAction, busy }: { project: LocalProject; onAction: Act; busy: boolean }) {
  const plan = project.testPlan!;
  const boardId = (project.build?.blueprint.components ?? []).find((c) => findCard(c.catalogId)?.type === "board")?.catalogId;
  const guide = uploadGuideFor(boardId);
  const [text, setText] = useState<Record<string, string>>({});
  return <div className="plan-view">
    <div className="artifact-title"><span className="pill">테스트</span><h3>업로드하고 확인하기</h3></div>
    {guide ? <details className="upload-guide" open={!plan.cases.some((c) => c.result)}><summary>📤 {guide.boardName}에 펌웨어 올리는 법</summary>
      <p className="muted">아두이노 IDE가 처음이면 <a href={`/find/setup?board=${boardId ?? ""}&back=/`} target="_blank" rel="noreferrer">설치부터 LED 깜빡이기까지 따라 하기 ↗</a></p>
      <ol><li>Arduino IDE를 설치하고 열어요.</li>{guide.managerUrl && <li>환경설정 → 추가 보드 관리자 URL에 <code>{guide.managerUrl}</code> 를 넣어요.</li>}<li>보드 매니저에서 <b>{guide.package}</b>를 설치해요.</li><li>{guide.select}</li><li>포트: {guide.port}</li><li>업로드(→) 버튼을 누르고, 끝나면 시리얼 모니터를 열어요.</li></ol>
      <h5>잘 안 되면</h5><ul>{guide.errors.map((e) => <li key={e.symptom}><b>{e.symptom}</b> — {e.fix}</li>)}</ul></details>
      : <p className="notice">이 보드의 업로드 안내는 아직 없어요. 판매처 문서를 따라 주세요.</p>}
    {plan.cases.map((c) => <article className="test-case" key={c.id}>
      <header><b>{c.stage}단계 · {c.title}</b>{c.result && <span className={`pill ${c.result.status === "pass" ? "pass" : c.result.status === "fail" ? "fail" : "unknown"}`}>{{ pass: "기대대로", fail: "다름", unknown: "모름" }[c.result.status]}</span>}</header>
      <p><b>준비</b> {c.setup}</p><p><b>할 일</b> {c.do}</p>
      <p><b>기대</b> {[c.expect.serial?.length ? `시리얼에 “${c.expect.serial.join("”, “")}”` : "", c.expect.observe ?? "", c.expect.measure ? `${c.expect.measure.what} ${c.expect.measure.min}~${c.expect.measure.max}${c.expect.measure.unit}` : ""].filter(Boolean).join(" · ")}</p>
      {c.result && <p className="muted">보낸 결과: {c.result.evidence}</p>}
      <div className="evidence-input"><textarea aria-label={`${c.title} 결과`} placeholder="시리얼 모니터에 찍힌 줄이나 본 것을 붙여 넣어 주세요" value={text[c.id] ?? ""} onChange={(e) => setText({ ...text, [c.id]: e.target.value })} />
        <div className="row-btns">{(["pass", "fail", "unknown"] as const).map((st) => <button key={st} disabled={busy || !(text[c.id] ?? "").trim()} onClick={() => { onAction({ action: "test_result", caseId: c.id, status: st, evidence: text[c.id] }); setText({ ...text, [c.id]: "" }); }}>{{ pass: "기대대로 돼요", fail: "달라요", unknown: "모르겠어요" }[st]}</button>)}</div></div>
    </article>)}
    <p className="muted">결과를 보내도 자동으로 통과 처리되지 않아요. HW 달그락이 로그를 보고 함께 판단해요.</p>
  </div>;
}

export function SafetyView({ project, onAction, busy }: { project: LocalProject; onAction: Act; busy: boolean }) {
  const s = project.safety!;
  const left = s.items.filter((i) => i.status === "risk" && !i.ackAt).length;
  return <div className="plan-view">
    <div className="artifact-title"><span className="pill">안전</span><h3>만들기 전에 확인할 것</h3></div>
    {left > 0 ? <p className="notice danger-notice">확인할 위험 {left}개. 모두 ‘확인했어요’를 눌러야 대장간에 들어갈 수 있어요.</p> : <p className="notice">위험 항목을 모두 확인했어요.</p>}
    <ul className="safety-list">{s.items.map((i) => <li key={i.id} className={i.status}>
      <span className={`pill ${i.status === "ok" ? "pass" : i.status === "risk" ? "fail" : "unknown"}`}>{{ ok: "괜찮음", risk: "위험", unknown: "확인 필요" }[i.status]}</span>
      <span><b>{i.topic}</b> {i.text}{i.required && <small> · 필수</small>}</span>
      {i.status === "risk" && (i.ackAt ? <small className="acked">✓ 확인함</small> : <button disabled={busy} onClick={() => onAction({ action: "safety_ack", itemId: i.id })}>확인했어요</button>)}
    </li>)}</ul>
  </div>;
}

export function HistoryList({ project, onAction, busy }: { project: LocalProject; onAction: Act; busy: boolean }) {
  const h = [...(project.history ?? [])].reverse();
  const [open, setOpen] = useState<string | null>(null);
  if (!h.length) return null;
  return <section className="history-list"><h4>설계 기록</h4><p className="muted">바꾸기 전 버전이 남아 있어요. 설계도·조립·하우징·전원·테스트·안전은 되돌릴 수 있어요.</p>
    <ul>{h.map((x) => <li key={x.id}>
      <div><span className="pill">{FIELD_LABEL[x.field]}</span> {x.summary} <small>{new Date(x.at).toLocaleString("ko-KR")}</small></div>
      <div className="row-btns"><button onClick={() => setOpen(open === x.id ? null : x.id)}>{open === x.id ? "닫기" : "보기"}</button>{RESTORABLE.includes(x.field) && <button disabled={busy} onClick={() => { if (confirm(`${FIELD_LABEL[x.field]}를 이 버전으로 되돌릴까요? 지금 버전도 기록에 남아요.`)) onAction({ action: "restore_version", snapshotId: x.id }); }}>이 버전으로 되돌리기</button>}</div>
      {open === x.id && <pre className="file-source">{JSON.stringify(JSON.parse(x.snapshot), null, 2).slice(0, 4000)}</pre>}
    </li>)}</ul></section>;
}
