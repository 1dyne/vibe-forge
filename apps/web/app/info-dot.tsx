"use client";
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { noteFor, splitLearnText } from "../lib/learn";

// 학습 모드의 작은 회색 i. 설명이 있는 자리에만 붙고, 눌러야 열린다.
// 학습 모드가 꺼져 있으면 아무것도 그리지 않는다(글이 평소처럼 보인다).
// 부모가 <LearnModeContext.Provider value={profile.learningMode === true}>로 감싼다.
export const LearnModeContext = createContext(false);
export const useLearnMode = () => useContext(LearnModeContext);

type Props = { term: string; title?: undefined; body?: undefined } | { term?: undefined; title: string; body: ReactNode };

export function InfoDot(props: Props) {
  const enabled = useLearnMode();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const id = useId();
  const note = props.term ? noteFor(props.term) : null;
  const title = props.term ? note?.term : props.title;

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  if (!enabled || !title || (props.term && !note)) return null;
  return <span className="ld-wrap" ref={wrap}>
    <button type="button" className="ld-dot" aria-label={`${title} 설명 보기`} aria-expanded={open} aria-controls={id} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}>i</button>
    {open && <span className="ld-pop" id={id} role="note">
      <strong>{title}</strong>
      {note ? <>
        <span>{note.oneLine}</span>
        <span><b>왜 중요한가요</b>{note.why}</span>
        <span><b>다음에 직접 정하려면</b>{note.decide}</span>
      </> : <span>{props.body}</span>}
    </span>}
  </span>;
}

/** 글 속에서 설명이 있는 낱말이 처음 나온 자리 뒤에 i를 붙인다. 학습 모드가 꺼져 있으면 글 그대로다. */
export function LearnText({ text }: { text: string }) {
  const enabled = useLearnMode();
  if (!enabled) return <>{text}</>;
  return <>{splitLearnText(text).map((part, index) => part.note ? <span key={index}>{part.text}<InfoDot term={part.note.term} /></span> : <span key={index}>{part.text}</span>)}</>;
}
