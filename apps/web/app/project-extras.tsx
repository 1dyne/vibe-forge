"use client";
import { EXTRA_QUESTIONS, type ExtraAnswers, type ExtraQuestion, type ProfileWithProjectExtras } from "../lib/checklist";

// 추가 질문 한 묶음을 그린다. 내 계정(사람 것)과 프로젝트 설정(프로젝트 것) 양쪽에서 쓴다.
// 전부 선택 사항이고 고르기만 하면 된다. 이 답으로 달그락이 무엇을 달리 하는지 한 줄로 알려준다.
export function ExtraFields({ questions, answers, onChange, name }: { questions: ExtraQuestion[]; answers: ExtraAnswers; onChange: (next: ExtraAnswers) => void; name: string }) {
  const pick = (q: ExtraQuestion, value: string, checked: boolean) => {
    if (q.kind === "single") { onChange({ ...answers, [q.id]: value }); return; }
    const before = Array.isArray(answers[q.id]) ? answers[q.id] as string[] : [];
    // "없어요/해당 없어요/처음이에요"는 다른 것과 함께 고를 수 없다
    const exclusive = (v: string) => v === "none" || v === "never_tried" || v === "unsure";
    const next = !checked ? before.filter((v) => v !== value) : exclusive(value) ? [value] : [...before.filter((v) => !exclusive(v)), value];
    onChange({ ...answers, [q.id]: next });
  };
  return <>{questions.map((q) => <fieldset key={q.id} className="px-field">
    <legend>{q.question} <small>(선택)</small></legend>
    <small className="muted px-hint">{q.hint}</small>
    <div className={q.kind === "multi" ? "tool-checks" : "px-singles"}>{q.options.map((opt) => {
      const on = q.kind === "multi" ? Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt.value) : answers[q.id] === opt.value;
      return <label key={opt.value} className={q.kind === "single" ? "radio-option" : undefined}><input type={q.kind === "multi" ? "checkbox" : "radio"} name={`${name}-${q.id}`} checked={on} onChange={(e) => pick(q, opt.value, e.target.checked)} />{opt.label}</label>;
    })}</div>
  </fieldset>)}</>;
}

/** 프로젝트마다 다른 추가 질문(어디서 쓰는지, 무엇에 닿는지, 완성도, 몇 개). 프로젝트 설정 안에 넣는다. */
export default function ProjectExtras({ profile, onChange }: { profile: ProfileWithProjectExtras; onChange: (profile: ProfileWithProjectExtras) => void }) {
  const questions = EXTRA_QUESTIONS.filter((q) => q.scope === "project");
  const answers = profile.projectExtras ?? {};
  const done = questions.filter((q) => Array.isArray(answers[q.id]) ? (answers[q.id] as string[]).length > 0 : !!answers[q.id]).length;
  return <details className="px-more">
    <summary>쓰는 곳과 완성도 <small>{done}/{questions.length}</small></summary>
    <ExtraFields questions={questions} answers={answers} name="project-extra" onChange={(next) => onChange({ ...profile, projectExtras: next })} />
  </details>;
}
