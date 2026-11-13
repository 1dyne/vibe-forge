"use client";
import { useEffect, useRef, useState } from "react";
import { NAMELESS, NAME_MAX, nicknameProblem } from "../../lib/find/nickname";
import Dokkaebi from "./dokkaebi";

// 첫 만남: 달그락은 한 자리에 서 있고, 검은 말풍선 속 대사만 바뀐다. 마지막에 이름 칸이 달그락 아래 비워둔 자리에 나타난다(달그락은 움직이지 않음).
// 처음 온 사람이 "여기가 뭘 해주는 곳인지"를 이름 묻기 전에 알 수 있게: 무엇을(하드웨어) · 어떻게(AI와 부품→설계→제작) · 지금 할 수 있는 것(도깨비불 피우기)
const LINES = [
  "안녕, 나는 달그락. 도깨비불이야.",
  "만들고 싶은 물건이 있어?",
  "달그락 대장간은 아이디어를\n실제 하드웨어로 만들 수 있도록,",
  "AI와 함께 부품 선정부터\n설계·제작까지 도와주는 대장간이야.",
  "근데 대장간은 아직 짓고 있는 중…!",
  "그동안 네 아이디어로 도깨비불부터 피워 두자.",
  "문이 열리면 그 불을 들고 와서\n바로 만들기 시작하는 거야.",
  "인간, 이름이 뭐야?"
];
// 긴 줄은 읽을 시간을 더 준다
const holdMs = (text: string) => Math.max(1600, 900 + text.length * 70);

export default function Opening({ onDone }: { onDone: (name: string) => void }) {
  const [line, setLine] = useState(0);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = line >= LINES.length - 1;

  useEffect(() => {
    if (last) return;
    timer.current = setTimeout(() => setLine((n) => n + 1), holdMs(LINES[line]));
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
