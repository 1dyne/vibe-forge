"use client";
import { useEffect, useState } from "react";
import { parseMeetupLetter } from "../lib/meetup";

// ── MEETUP: 2026-11-28 밋업 시연 전용 (lib/meetup.ts 참고). 밋업이 끝나면 지운다 ──
// '완성 🎉' 뒤에 온 대장 달그락의 편지를 채팅 안에서 카드로 보여 준다.
// 줄글로 두면 화면 공유에서 읽기 어려워서, 아이디어마다 칸을 나눠 한눈에 보이게 한다.
// '크게 보기'를 누르면 화면 전체에 펼친다 (발표용).

const WHO: Array<{ test: RegExp; label: string; bg: string }> = [
  { test: /전자회로|EE/, label: "전자회로 EE", bg: "#cfe3ff" },
  { test: /소프트웨어|SW/, label: "소프트웨어 SW", bg: "#e3d6ff" },
  { test: /기구설계|ME/, label: "기구설계 ME", bg: "#ffe0b8" },
  { test: /제품 디자인|디자인 달그락|\bID\b/, label: "제품 디자인 ID", bg: "#ffd3e2" },
  { test: /대장 달그락/, label: "대장", bg: "#c9ebe4" }
];
const clean = (s: string) => s.replace(/\*\*/g, "").trim();

export default function MeetupLetter({ text }: { text: string }) {
  const [big, setBig] = useState(false);
  const letter = parseMeetupLetter(text);
  useEffect(() => {
    if (!big) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBig(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [big]);

  const body = (
    <div className="ml-body">
      <header><span className="ml-kicker">🎉 완성</span><h3>대장 달그락의 편지</h3></header>
      {letter.intro.map((p, i) => <p key={"i" + i} className="ml-intro">{clean(p)}</p>)}
      {letter.ideas.length > 0 && <div className="ml-grid">
        {letter.ideas.map((idea, i) => {
          const who = WHO.filter((w) => w.test.test(idea.design));
          return (
            <section key={i} className="ml-idea">
              <div className="ml-head"><b>{i + 1}</b><strong>{clean(idea.title)}</strong></div>
              {idea.design && <div className="ml-row"><span className="ml-label design">설계 더하기</span><div>{who.length > 0 && <p className="ml-who">{who.map((w) => <i key={w.label} style={{ background: w.bg }}>{w.label}</i>)}</p>}<p>{clean(idea.design)}</p></div></div>}
              {idea.tryIt && <div className="ml-row"><span className="ml-label try">해 볼 것</span><div><p>{clean(idea.tryIt)}</p></div></div>}
              {idea.extra.map((x, j) => <p key={j} className="ml-extra">{clean(x)}</p>)}
            </section>
          );
        })}
      </div>}
      {letter.outro.map((p, i) => <p key={"o" + i} className={/^\(.*\)$/.test(p.trim()) ? "ml-note" : "ml-outro"}>{clean(p)}</p>)}
    </div>
  );

  return (
    <div className="meetup-letter">
      <style>{`
        .meetup-letter{margin-top:6px;border:2px solid var(--ink,#232323);border-radius:18px;background:#fffdf6;box-shadow:4px 4px 0 var(--ink,#232323);padding:18px 20px 16px;color:#232323}
        .meetup-letter header,.ml-full header{display:flex;align-items:center;gap:10px;margin:0 0 10px}
        .ml-kicker{border:1.5px solid #232323;border-radius:999px;background:#ff8a5c;padding:2px 10px;font-weight:800;font-size:.8em;white-space:nowrap}
        .ml-body h3{margin:0;font-size:1.45em;line-height:1.2}
        .ml-body{font-size:16px;line-height:1.6}
        .ml-intro{margin:0 0 8px;font-size:1.05em}
        .ml-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin:14px 0}
        .ml-idea{border:1.5px solid #232323;border-radius:14px;background:#fff;padding:12px 14px}
        .ml-head{display:flex;gap:9px;align-items:flex-start;margin-bottom:9px}
        .ml-head b{flex:none;width:1.75em;height:1.75em;border-radius:50%;background:#232323;color:#fff;display:grid;place-items:center;font-size:.9em}
        .ml-head strong{font-size:1.08em;line-height:1.4}
        .ml-row{display:grid;grid-template-columns:5.4em 1fr;gap:8px;align-items:start;margin-top:7px}
        .ml-row p{margin:0}
        .ml-label{border-radius:8px;padding:2px 0;text-align:center;font-weight:800;font-size:.78em;border:1.5px solid #232323;white-space:nowrap}
        .ml-label.design{background:#94d2c9}.ml-label.try{background:#ffe9a8}
        .ml-who{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 4px!important}
        .ml-who i{font-style:normal;font-weight:700;font-size:.8em;border:1.5px solid #232323;border-radius:999px;padding:0 8px}
        .ml-extra{margin:7px 0 0;color:#4d483f}
        .ml-outro{margin:8px 0 0;font-weight:700}
        .ml-note{margin:8px 0 0;color:#6f6a61;font-size:.82em}
        .ml-open{margin-top:12px;border:1.5px solid #232323;border-radius:999px;background:#fff;padding:5px 14px;font-weight:700;cursor:pointer;box-shadow:2px 2px 0 #232323}
        .ml-full{position:fixed;inset:0;z-index:9000;background:#f6f1e7;overflow:auto;padding:4vh 5vw 6vh;color:#232323}
        .ml-full .ml-body{font-size:clamp(18px,1.55vw,26px);max-width:1500px;margin:0 auto}
        .ml-full .ml-grid{grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px}
        .ml-full .ml-idea{padding:18px 20px;box-shadow:3px 3px 0 #232323}
        .ml-close{position:fixed;top:14px;right:18px;border:2px solid #232323;border-radius:999px;background:#fff;padding:6px 16px;font-weight:800;font-size:16px;cursor:pointer;box-shadow:2px 2px 0 #232323;z-index:9001}
      `}</style>
      {body}
      <button type="button" className="ml-open" onClick={() => setBig(true)}>⛶ 크게 보기</button>
      {big && <div className="ml-full" role="dialog" aria-label="대장 달그락의 편지"><button type="button" className="ml-close" onClick={() => setBig(false)}>닫기 ✕</button>{body}</div>}
    </div>
  );
}
