"use client";
import { useEffect, useRef, useState } from "react";
import { NAMELESS, NAME_MAX, nicknameProblem } from "../../lib/find/nickname";
import Dokkaebi from "./dokkaebi";

// 첫 만남 (스토리보드: 손 클로즈업 눈 깜빡 → 줌아웃 → 전신 + 손 흔들며 인사 → 대사 → 이름 묻기)
const LINES = ["안녕, 나는 달그락. 도깨비불이야.", "너만의 도깨비불도 찾아줄게.", "도깨비가 되면 말이지, 상상만 하던 것도 뚝딱! 만들 수 있거든.", "인간, 이름이 뭐야?"];
type Stage = "close" | "zoom" | "hello" | "talk" | "name";

export default function Opening({ onDone }: { onDone: (name: string) => void }) {
  const [stage, setStage] = useState<Stage>("close");
  const [closed, setClosed] = useState(false);
  const [lines, setLines] = useState(0);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setStage("talk"); setLines(LINES.length); return; }
    // 깜빡 두 번 → 줌아웃 → 인사
    later(700, () => setClosed(true)); later(850, () => setClosed(false));
    later(1350, () => setClosed(true)); later(1500, () => setClosed(false));
    later(1900, () => setStage("zoom"));
    later(2900, () => setStage("hello"));
    later(4300, () => setStage("talk"));
    return () => timers.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (stage !== "talk") return;
    if (lines >= LINES.length) { later(500, () => setStage("name")); return; }
    later(lines === 0 ? 150 : 1100, () => setLines((n) => n + 1));
  }, [stage, lines]);

  function skipAhead() {
    if (stage === "close" || stage === "zoom" || stage === "hello") {
      timers.current.forEach(clearTimeout); timers.current = [];
      setStage("talk"); setLines(LINES.length);
    } else if (stage === "talk") {
      setLines(LINES.length);
    }
  }

  function submit(skip = false) {
    if (skip) return onDone(NAMELESS);
    const p = nicknameProblem(name);
    if (p) return setProblem(p);
    onDone(name.trim() || NAMELESS);
  }

  return (
    <section className="screen opening" onClick={stage === "name" ? undefined : skipAhead}>
      <div className={`op-stage st-${stage}`}>
        {(stage === "close" || stage === "zoom") ? (
          <div className="op-face" aria-hidden>
            <img src="/find/sprites/blink-open.webp" alt="" className={closed ? "gone" : ""} />
            <img src="/find/sprites/blink-closed.webp" alt="" className={closed ? "" : "gone"} />
          </div>
        ) : (
          <div className="op-body">
            {stage === "hello" && <div className="op-hi">안녕 나는 달그락.</div>}
            <div className="op-wave"><Dokkaebi motion="idle" fire={40} width={stage === "hello" ? 170 : 120} /></div>
          </div>
        )}
      </div>
      {(stage === "talk" || stage === "name") && (
        <div className="op-talk" aria-live="polite">
          {LINES.slice(0, lines).map((l) => <div key={l} className="op-line">{l}</div>)}
        </div>
      )}
      {stage === "name" && (
        <form className="op-name" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label htmlFor="nick" className="sr-only">이름</label>
          <input id="nick" autoFocus maxLength={NAME_MAX} placeholder="이름 또는 별명" value={name} onChange={(e) => { setName(e.target.value); setProblem(null); }} />
          {problem && <p className="error" role="alert">{problem}</p>}
          <p className="fine-left">다른 사람에게 보이는 이름이야. 실명 말고 별명도 좋아.</p>
          <button className="btn" type="submit" disabled={!name.trim()}>이게 내 이름이야</button>
          <button className="link" type="button" onClick={() => submit(true)}>건너뛰기 (이름 없는 도깨비로 할래)</button>
        </form>
      )}
      {stage !== "name" && <div className="op-skip">화면을 누르면 넘어가</div>}
    </section>
  );
}
