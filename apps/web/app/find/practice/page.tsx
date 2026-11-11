import type { Metadata } from "next";
import { KITS } from "../../../lib/bench/kits";
import PracticeDone from "./practice-done";
import "../fonts";

export const metadata: Metadata = { title: "미리 만들어보기 · 달그락 대장간", description: "부품을 사기 전에 3D 작업대에서 납땜을 먼저 연습해 봐요." };

export default function PracticeIndex() {
  return (
    <main className="find">
      <header className="top"><a className="brand" href="/find">달그락 대장간</a><div className="step">미리 만들어보기</div></header>
      <section className="screen">
        <h1>손으로 하기 전에<br />화면에서 먼저</h1>
        <p className="lead">부품을 사기 전에 3D 작업대에서 납땜 순서를 익혀 봐요. 실수하기 쉬운 곳도 미리 보여 줄게요.</p>
        <div className="practice-list">
          {KITS.map((k) => (
            <a key={k.id} className={`practice-kit ${k.draft ? "soon" : ""}`} href={k.draft ? undefined : `/find/practice/${k.id}`} aria-disabled={k.draft || undefined}>
              <div className="pk-top"><b>{k.title}</b><span>{k.draft ? "준비 중" : `약 ${k.minutes}분 · ${k.level}`}</span></div>
              <p>{k.subtitle}</p>
              <PracticeDone kitId={k.id} />
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
