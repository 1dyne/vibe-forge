"use client";
import { useMemo, useState, type FormEvent } from "react";
import type { LocalProject } from "../lib/project-types";
import { buildLadder, verifyOf, viewLadder, type Rung, type RungResult, type RungStatus } from "../lib/verify-ladder";

// 검증 사다리: 아래 칸부터 한 칸씩. 지금 할 칸만 펼쳐서 방법과 입력란을 보여준다.
// 판정은 서버가 하고(출처 있는 기준이 있을 때만), 여기서는 넣은 값과 결과를 그대로 보여준다.

type Body = { rungId: string; value?: number | null; yes?: boolean | null; text?: string | null; skip?: string | null };
const STATUS: Record<RungStatus, string> = { locked: "잠김", current: "지금", todo: "대기", pass: "통과", fail: "범위 밖", unknown: "모름", skipped: "건너뜀", unavailable: "멀티미터 필요" };
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "출처"; } };

function shown(rung: Rung, result: RungResult): string {
  if (result.skipped) return `건너뜀 · ${result.skipped}`;
  const parts: string[] = [];
  if (result.value != null) parts.push(`${result.value}${rung.input.kind === "number" ? rung.input.unit : ""}`);
  if (result.yes != null) parts.push(result.yes ? "예" : "아니오");
  if (result.text) parts.push(result.text);
  return parts.join(" · ");
}

function Expected({ rung }: { rung: Rung }) {
  const range = rung.expectedRange;
  if (!range) return <p className="vf-expect vf-noref"><b>정상 범위</b> 확인 필요 · 출처가 있는 기준이 없어요. 본 값을 그대로 알려주시면 달그락과 함께 볼게요.</p>;
  const source = range.kind === "answer" ? null : range.sourceUrl
    ? <a href={range.sourceUrl} target="_blank" rel="noreferrer noopener">{range.sourceNote ?? host(range.sourceUrl)}</a>
    : range.sourceNote ? <span>{range.sourceNote}</span> : null;
  return <p className="vf-expect"><b>{range.kind === "number" ? "정상 범위" : "이러면 정상"}</b> {range.kind === "number" ? `${range.min ?? ""}${range.min != null && range.max != null ? " ~ " : range.min != null ? " 이상" : ""}${range.max ?? ""}${range.min == null && range.max != null ? " 이하" : ""} ${range.unit}` : range.expect}{source && <small> · 출처 {source}</small>}</p>;
}

function RungForm({ rung, busy, onSubmit }: { rung: Rung; busy: boolean; onSubmit: (body: Body) => Promise<void> | void }) {
  const [value, setValue] = useState("");
  const [text, setText] = useState("");
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState("");
  const send = (body: Omit<Body, "rungId">) => void onSubmit({ rungId: rung.id, ...body });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (rung.input.kind === "number") { const n = Number(value.replace(",", ".")); if (value.trim() && Number.isFinite(n)) send({ value: n }); }
    else if (text.trim()) send({ text: text.trim() });
  };
  if (skipping) return <form className="vf-form" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) send({ skip: reason.trim() }); }}>
    <label className="vf-label" htmlFor={`vf-skip-${rung.id}`}>건너뛰는 이유를 적어주세요. 건너뛴 칸은 통과로 세지 않고, 나중에 문제가 생기면 여기부터 다시 봐요.</label>
    <div className="vf-row"><input id={`vf-skip-${rung.id}`} value={reason} maxLength={300} placeholder="예: 멀티미터를 빌리는 날 다시 잴게요" onChange={(e) => setReason(e.target.value)} /><button className="vf-primary" disabled={busy || !reason.trim()}>건너뛰기</button></div>
    <button type="button" className="vf-link" onClick={() => setSkipping(false)}>돌아가기</button>
  </form>;
  return <form className="vf-form" onSubmit={submit}>
    {rung.input.kind === "number" && <>
      <label className="vf-label" htmlFor={`vf-in-${rung.id}`}>잰 값을 넣어주세요</label>
      <div className="vf-row"><input id={`vf-in-${rung.id}`} inputMode="decimal" value={value} placeholder="예: 4.98" onChange={(e) => setValue(e.target.value)} /><span className="vf-unit">{rung.input.unit}</span><button className="vf-primary" disabled={busy || !value.trim() || !Number.isFinite(Number(value.replace(",", ".")))}>보내기</button></div>
    </>}
    {(rung.input.kind === "yes_no" || rung.input.kind === "observe") && <>
      <p className="vf-label">{rung.input.question}</p>
      <div className="vf-row"><button type="button" className="vf-primary" disabled={busy} onClick={() => send({ yes: true })}>예, 그래요</button><button type="button" className="vf-secondary" disabled={busy} onClick={() => send({ yes: false })}>아니요, 달라요</button></div>
    </>}
    {(rung.input.kind === "serial_line" || rung.input.kind === "photo") && <>
      <label className="vf-label" htmlFor={`vf-in-${rung.id}`}>{rung.input.kind === "serial_line" ? "시리얼 모니터에 찍힌 줄을 그대로 붙여넣어 주세요" : `사진은 달그락과의 대화에 올리고, 여기에는 보인 것을 한 줄로 적어주세요 (${rung.input.what})`}</label>
      <div className="vf-row"><textarea id={`vf-in-${rung.id}`} rows={2} value={text} maxLength={600} placeholder={rung.input.kind === "serial_line" ? "예: I2C device found at address 0x3C" : "예: 빨간 선이 5V, 검은 선이 GND에 꽂혀 있어요"} onChange={(e) => setText(e.target.value)} /><button className="vf-primary" disabled={busy || !text.trim()}>보내기</button></div>
    </>}
    <button type="button" className="vf-link" onClick={() => setSkipping(true)}>지금은 확인할 수 없어요</button>
  </form>;
}

export default function VerifyView({ project, busy, onSubmit }: {
  project: LocalProject; busy: boolean;
  /** /api/projects/<id>/verify 로 POST 하고, 돌아온 project를 화면에 반영한다 */
  onSubmit: (body: Body) => Promise<void> | void;
}) {
  const view = useMemo(() => viewLadder(buildLadder(project), verifyOf(project)), [project]);
  const [opened, setOpened] = useState<string | null>(null);
  const [retry, setRetry] = useState<string | null>(null);
  if (!view.counts.total) return <div className="vf-wrap"><p className="vf-empty">{view.notes[0] ?? "회로를 제출하면 확인 순서가 여기에 만들어져요."}</p></div>;
  const settled = view.counts.pass + view.counts.skipped + view.counts.unavailable;
  return <div className="vf-wrap">
    <header className="vf-head">
      <strong>통과 {view.counts.pass} / {view.counts.total}</strong>
      <span>{[view.counts.fail && `범위 밖 ${view.counts.fail}`, view.counts.unknown && `모름 ${view.counts.unknown}`, view.counts.skipped && `건너뜀 ${view.counts.skipped}`, view.counts.unavailable && `멀티미터 필요 ${view.counts.unavailable}`].filter(Boolean).join(" · ") || (settled === view.counts.total ? "모든 칸을 지났어요" : "아래 칸부터 한 칸씩 올라가요")}</span>
      <div className="vf-bar" aria-hidden="true"><i style={{ width: `${Math.round((view.counts.pass / view.counts.total) * 100)}%` }} /></div>
    </header>
    {view.notes.map((note, index) => <p key={index} className="vf-note">{note}</p>)}
    {view.stages.map((stage) => <section key={stage.id} className={`vf-stage${stage.locked ? " vf-locked" : ""}${stage.done ? " vf-done" : ""}`}>
      <h4>{stage.title}{stage.locked && <small>앞 단계를 마치면 열려요</small>}{stage.done && <small>지남</small>}</h4>
      {!stage.locked && <p className="vf-intro">{stage.intro}</p>}
      <ol className="vf-rungs">{stage.rungs.map((rung, index) => {
        const isCurrent = view.current?.id === rung.id;
        const open = !stage.locked && (opened === rung.id || (opened == null && isCurrent));
        const canAnswer = !stage.locked && (rung.status === "current" || rung.status === "todo" || retry === rung.id);
        const firstOfGroup = rung.group && stage.rungs[index - 1]?.group !== rung.group;
        return <li key={rung.id} className={`vf-rung vf-${rung.status}${isCurrent ? " vf-now" : ""}`}>
          {firstOfGroup && <p className="vf-group">{rung.group}</p>}
          <button type="button" className="vf-rung-head" aria-expanded={open} disabled={stage.locked} onClick={() => setOpened(open ? "" : rung.id)}>
            <span className="vf-pill">{isCurrent && rung.status !== "current" ? `${STATUS[rung.status]} · 다시` : STATUS[rung.status]}</span>
            <span className="vf-title">{rung.title}</span>
          </button>
          {rung.result && !open && <p className="vf-got">{shown(rung, rung.result)}</p>}
          {open && <div className="vf-body">
            <p className="vf-why">{rung.why}</p>
            {rung.unavailable
              ? <p className="vf-expect vf-noref">이 확인은 멀티미터가 있어야 할 수 있어요. 메이커스페이스에서 빌려 잴 수 있으면 그때 값을 알려주세요.</p>
              : <>
                <ol className="vf-how">{rung.how.map((step, i) => <li key={i}>{step}</li>)}</ol>
                {rung.meterMode && <p className="vf-meter"><span><b>멀티미터</b> {rung.meterMode}</span><span><b>리드를 댈 곳</b> {rung.probePoints}</span></p>}
                {rung.usingAlternative && <p className="vf-expect vf-noref">멀티미터가 없어서 눈으로 하는 확인으로 바꿨어요. 숫자로 확인한 것은 아니에요.</p>}
                <Expected rung={rung} />
              </>}
            {rung.result && <div className={`vf-result vf-${rung.status}`}>
              <b>{rung.result.skipped ? "건너뜀" : rung.result.verdict === "pass" ? "통과" : rung.result.verdict === "fail" ? "범위 밖" : "모름"}</b>
              <span>{shown(rung, rung.result)}</span>
              <p>{rung.result.skipped ? "통과로 세지 않았어요. 나중에 문제가 생기면 이 칸부터 다시 봐요." : rung.result.verdict === "pass" ? rung.ifPass : rung.result.verdict === "fail" ? rung.ifFail : "기준이 없어 판정하지 않았어요. 이 값을 달그락에게 알려주면 함께 볼게요."}</p>
              {retry !== rung.id && <button type="button" className="vf-link" onClick={() => setRetry(rung.id)}>{rung.result.verdict === "pass" ? "다시 재기" : "고친 뒤 다시 재기"}</button>}
            </div>}
            {canAnswer && !rung.unavailable && <RungForm key={`${rung.id}:${rung.result?.at ?? ""}`} rung={rung} busy={busy} onSubmit={async (body) => { await onSubmit(body); setRetry(null); setOpened(null); }} />}
          </div>}
        </li>;
      })}</ol>
    </section>)}
  </div>;
}
