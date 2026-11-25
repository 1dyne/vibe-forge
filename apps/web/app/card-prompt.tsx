"use client";
import { useState, type FormEvent } from "react";
import type { CardAnswer, WorkCard } from "../lib/board";

// 달그락이 사람에게 차례를 넘길 때의 세 가지 모양.
//   요청: 사실을 적는 칸(폼)   질문: 뜻을 고르는 보기   제안: 무엇이 달라지는지 적힌 길 가운데 고르기
// 답하면 그 달그락에게 돌아가고, 자동 진행이 켜져 있으면 바로 이어서 일한다.
const KIND = { request: "요청", question: "질문", proposal: "제안" } as const;
type Values = NonNullable<CardAnswer["values"]>;

export default function CardPrompt({ card, busy, onAnswer }: {
  card: Pick<WorkCard, "id" | "title" | "ask" | "prompt">;
  busy: boolean;
  onAnswer: (body: { cardId: string; values?: Values; choice?: string; note?: string }) => Promise<unknown> | void;
}) {
  const prompt = card.prompt;
  const [values, setValues] = useState<Values>({});
  const [choice, setChoice] = useState<string>(prompt?.kind === "proposal" ? prompt.recommend?.id ?? "" : "");
  const [note, setNote] = useState("");
  const set = (id: string, value: Values[string] | undefined) => setValues((v) => { const next = { ...v }; if (value === undefined || value === "") delete next[id]; else next[id] = value; return next; });
  const submit = (e: FormEvent) => { e.preventDefault(); void onAnswer({ cardId: card.id, ...(prompt?.kind === "request" ? { values } : {}), ...(choice ? { choice } : {}), ...(note.trim() ? { note: note.trim() } : {}) }); };

  // 모양이 없는 넘김(예전 카드, 단순 확인)은 한 줄 답과 '했어요'로 받는다.
  if (!prompt) return <form className="cp cp-plain" onSubmit={submit}>
    <input value={note} maxLength={600} placeholder="알려줄 것이 있으면 적어주세요 (없으면 비워 둬도 돼요)" onChange={(e) => setNote(e.target.value)} aria-label={`${card.title}에 대한 답`} />
    <button className="cp-send" disabled={busy}>했어요 · 달그락에게 넘기기</button>
  </form>;

  return <form className={`cp cp-${prompt.kind}`} onSubmit={submit}>
    <span className="cp-kind">{KIND[prompt.kind]}</span>
    {prompt.kind === "request" && <div className="cp-fields">{prompt.fields.map((f) => <label key={f.id} className="cp-field">
      <span>{f.label}{f.required === false && <small> (선택)</small>}</span>
      {f.kind === "number" && <span className="cp-number"><input type="number" inputMode="decimal" step="any" value={typeof values[f.id] === "number" ? String(values[f.id]) : ""} onChange={(e) => set(f.id, e.target.value === "" ? undefined : Number(e.target.value))} />{f.unit && <em>{f.unit}</em>}</span>}
      {f.kind === "text" && <input type="text" maxLength={400} value={typeof values[f.id] === "string" ? values[f.id] as string : ""} onChange={(e) => set(f.id, e.target.value)} />}
      {f.kind === "date" && <input type="date" value={typeof values[f.id] === "string" ? values[f.id] as string : ""} onChange={(e) => set(f.id, e.target.value)} />}
      {f.kind === "yes_no" && <span className="cp-choices">{([["예", true], ["아니요", false]] as const).map(([label, v]) => <button type="button" key={label} className={values[f.id] === v ? "on" : ""} aria-pressed={values[f.id] === v} onClick={() => set(f.id, v)}>{label}</button>)}</span>}
      {f.kind === "choice" && <span className="cp-choices">{f.options!.map((o) => <button type="button" key={o} className={values[f.id] === o ? "on" : ""} aria-pressed={values[f.id] === o} onClick={() => set(f.id, o)}>{o}</button>)}</span>}
      {f.kind === "multi" && <span className="cp-choices">{f.options!.map((o) => { const now = Array.isArray(values[f.id]) ? values[f.id] as string[] : []; const on = now.includes(o); return <button type="button" key={o} className={on ? "on" : ""} aria-pressed={on} onClick={() => set(f.id, on ? now.filter((x) => x !== o) : [...now, o])}>{o}</button>; })}</span>}
      {f.hint && <small className="cp-hint">{f.hint}</small>}
    </label>)}</div>}
    {prompt.kind !== "request" && <div className="cp-options" role="radiogroup" aria-label={card.title}>{prompt.options.map((o) => { const recommended = prompt.kind === "proposal" && prompt.recommend?.id === o.id; return <button type="button" key={o.id} role="radio" aria-checked={choice === o.id} className={"cp-option" + (choice === o.id ? " on" : "")} onClick={() => setChoice(o.id)}>
      <b>{o.label}{recommended && <em>달그락의 추천</em>}</b>
      {o.effect && <span>{o.effect}</span>}
      {recommended && prompt.kind === "proposal" && prompt.recommend && <small>추천하는 까닭: {prompt.recommend.why}</small>}
    </button>; })}</div>}
    <div className="cp-foot">
      <input value={note} maxLength={600} placeholder={prompt.kind === "request" ? "모르는 칸이 있으면 여기에 모른다고 적어주세요" : prompt.kind === "question" ? "다른 생각이 있으면 적어주세요" : "덧붙일 말 (선택)"} onChange={(e) => setNote(e.target.value)} aria-label="덧붙일 말" />
      <button className="cp-send" disabled={busy}>{prompt.kind === "request" ? "알려주기" : prompt.kind === "question" ? "이렇게 할게요" : "이 길로 가기"}</button>
    </div>
  </form>;
}
