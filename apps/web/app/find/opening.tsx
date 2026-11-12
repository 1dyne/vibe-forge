"use client";
import { useEffect, useRef, useState } from "react";
import { NAMELESS, NAME_MAX, nicknameProblem } from "../../lib/find/nickname";
import Dokkaebi from "./dokkaebi";

// 첫 만남: 달그락은 한 자리에 서 있고, 검은 말풍선 속 대사만 바뀐다. 마지막에 이름 칸이 달그락 아래 비워둔 자리에 나타난다(달그락은 움직이지 않음).
const LINES = ["안녕 나는 달그락.", "도깨비불이야.", "너만의 도깨비불도 찾아줄게.", "도깨비가 되면 상상만 하던 것도 뚝딱! 만들 수 있거든.", "인간, 이름이 뭐야?"];

export default function Opening({ onDone }: { onDone: (name: string) => void }) {
  const [line, setLine] = useState(0);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = line >= LINES.length - 1;

  useEffect(() => {
    if (last) return;
    timer.current = setTimeout(() => setLine((n) => n + 1), line === 0 ? 1800 : 1600);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [line, last]);

  function next() { if (!last) setLine((n) => n + 1); }
  function submit(skip = false) {
    if (skip) return onDone(NAMELESS);
    const p = nicknameProblem(name);
    if (p) return setProblem(p);
    onDone(name.trim() || NAMELESS);
  }

  return (
    <section className="screen opening" onClick={last ? undefined : next}>
      <div className="op-stage">
        <div className="op-body">
          <div className="op-hi" key={line} aria-live="polite">{LINES[line]}</div>
          <Dokkaebi motion="idle" fire={40} width={170} />
        </div>
      </div>
      {/* 이름 칸 자리는 처음부터 잡아둔다: 나타나도 위의 달그락이 밀리지 않게 */}
      <div className="op-slot">
        {last ? (
          <form className="op-name" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <label htmlFor="nick" className="sr-only">이름</label>
            <input id="nick" autoFocus maxLength={NAME_MAX} placeholder="이름 또는 별명" value={name} onChange={(e) => { setName(e.target.value); setProblem(null); }} />
            {problem && <p className="error" role="alert">{problem}</p>}
            <button className="btn" type="submit" disabled={!name.trim()}>이게 내 이름이야</button>
            <button className="link" type="button" onClick={() => submit(true)}>건너뛰기 (이름 없는 도깨비로 할래)</button>
          </form>
        ) : <div className="op-skip">화면을 누르면 넘어가</div>}
      </div>
    </section>
  );
}
