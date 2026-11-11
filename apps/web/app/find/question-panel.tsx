"use client";
import { useEffect, useState } from "react";
import type { Question } from "../../lib/find/question";
import { track } from "./track";

/** 화덕 도깨비의 질문: 하루 한 번, 장작 하나를 더 골라 도깨비불을 키운다 (주인만) */
export function useQuestion(enabled: boolean) {
  const [q, setQ] = useState<Question | null>(null);
  useEffect(() => {
    if (!enabled) return;
    fetch("/api/find/question").then((r) => (r.ok ? r.json() : null)).then((j) => setQ(j?.question ?? null)).catch(() => undefined);
  }, [enabled]);
  return [q, setQ] as const;
}

const STAGE = ["불씨", "타오름", "활활"];

export function QuestionSheet({ q, onDone, onClose }: { q: Question; onDone: (msg: string) => void; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [grown, setGrown] = useState<{ sentence: string; stageUp: number | null } | null>(null);
  async function pick(id: string) {
    setBusy(id); setErr("");
    const res = await fetch("/api/find/question", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fireId: q.fireId, chipId: id }) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    if (!res?.ok) { setErr(json.error ?? "답하지 못했어."); return; }
    setGrown({ sentence: json.fire.sentence, stageUp: json.stageUp });
    track("dokkaebi_question", { chip: id, stageUp: String(Boolean(json.stageUp)) });
  }
  return (
    <div className="overlay" role="dialog" aria-label="도깨비의 질문" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet question-sheet">
        <div className="tiny muted">화덕 도깨비의 오늘 질문 · {q.fireName}</div>
        {!grown ? (
          <>
            <div className="display" style={{ fontSize: 21 }}>{q.ask}</div>
            <div className="small body">하나 고르면 이 도깨비불의 설계 한 줄에 장작이 하나 더 들어가. 질문은 하루에 하나야.</div>
            <div className="phrases">{q.options.map((o) => <button key={o.id} type="button" className="chip" disabled={Boolean(busy)} onClick={() => pick(o.id)}>{busy === o.id ? "넣는 중…" : o.label}</button>)}</div>
            {err && <div className="error" role="status">{err}</div>}
            <button className="link" type="button" onClick={onClose}>내일 할게</button>
          </>
        ) : (
          <>
            <div className="display" style={{ fontSize: 21 }}>불이 한 뼘 자랐어</div>
            <div className="note"><div className="tiny muted">새 설계 한 줄</div><div className="sentence" style={{ fontSize: 15 }}>{grown.sentence}</div></div>
            {grown.stageUp && <div className="small"><b>대장간이 ‘{STAGE[grown.stageUp - 1]}’ 단계가 됐어!</b> 마을에 있는 네 집도 같이 커졌어.</div>}
            <button className="btn btn-fire" type="button" onClick={() => onDone(grown.stageUp ? `대장간이 ‘${STAGE[grown.stageUp - 1]}’ 단계가 됐어!` : "장작을 하나 더 넣었어. 내일 또 물어볼게.")}>좋아</button>
          </>
        )}
      </div>
    </div>
  );
}
