"use client";
import { useState } from "react";
import { fireLabel, type ReactKind } from "../../lib/find/chips";
import type { FireCard } from "../../lib/find/card";
import { GRADE_CLASS } from "../../lib/find/card";
import { NAMELESS } from "../../lib/find/nickname";
import { PARTS_NOTE } from "../../lib/find/parts";
import Dokkaebi from "./dokkaebi";

const STAT_COLOR: Record<string, string> = { 형태: "var(--cat-form)", 반응: "var(--cat-react)", 감지: "var(--cat-sense)", 누구: "var(--cat-who)" };

/** 도깨비불 트레이딩 카드. 누르면 뒤집혀서 설계 정보(어림)를 보여준다. */
export default function FireCardView({ name, owner, peak, kind, card }: { name: string; owner?: string; peak: number; kind: ReactKind; card: FireCard }) {
  const [flipped, setFlipped] = useState(false);
  const stars = "★".repeat(card.build.difficulty) + "☆".repeat(5 - card.build.difficulty);
  return (
    <div className={`fcard grade-${GRADE_CLASS[card.grade] ?? "common"}${flipped ? " flipped" : ""}`}
      role="button" tabIndex={0} aria-pressed={flipped} aria-label={flipped ? "카드 앞면 보기" : "카드 뒤집어서 설계 정보 보기"}
      onClick={() => setFlipped((f) => !f)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFlipped((f) => !f); } }}>
      <div className="fcard-inner">
        <div className="fcard-face front">
          <div className="holo" />
          <div className="fcard-top">
            <span className={`attr attr-${card.attr.kind}`}><i />{card.attr.label}</span>
            <span className="grade">{card.grade}</span>
          </div>
          <div className="art"><Dokkaebi motion="blaze" fire={peak} width={180} kind={kind} /></div>
          {owner && owner !== NAMELESS && <div className="owner"><b>{owner}</b>의 도깨비불</div>}
          <div className="fname">{name}</div>
          <div className="fsub">화력 <b>{peak}</b> · {fireLabel(peak)}</div>
          {(card.rarityLine || card.peakLine) && (
            <div className="rare-line">{card.rarityLine}{card.rarityLine && card.peakLine && <br />}{card.peakLine && <b>{card.peakLine}</b>}</div>
          )}
          <div className="stats">
            {card.stats.map((s) => (
              <div key={s.cat} className="stat"><span>{s.cat}</span><div className="sbar"><i style={{ width: `${Math.max(6, (s.value / 3) * 100)}%`, background: STAT_COLOR[s.cat] }} /></div><b>{s.value}</b></div>
            ))}
          </div>
          <div className="traits">
            <div className="trait"><small>특기</small>{card.specialty}</div>
            <div className="trait"><small>약점</small>{card.weakness}</div>
          </div>
          <div className="flip-hint">카드를 누르면 뒤집혀서 설계 정보 ↻</div>
        </div>
        <div className="fcard-face back">
          <div className="back-title">이렇게 만들 수 있어</div>
          <div className="brow"><span>난이도</span><span className="stars" aria-label={`5점 중 ${card.build.difficulty}점`}>{stars}</span></div>
          <div className="brow"><span>예상 제작 시간</span><b>{card.build.time}</b></div>
          <div className="brow"><span>부품 수</span><b>{card.build.partsRange}</b></div>
          <div className="brow last"><span>이런 것들이 모이면 돼</span></div>
          <div className="roles" onClick={(e) => e.stopPropagation()}>
            {card.build.parts.map((p) => typeof p === "string" ? (
              <div key={p} className="prole plain">{p}</div>
            ) : (
              <details key={p.key} className="prole">
                <summary><b>{p.role}</b><span> — {p.does}</span></summary>
                <div className="prole-parts">
                  <small>준비할 것</small>
                  {p.parts.map((x) => <div key={x.name}>{x.name} <span className="muted">· {x.spec}</span></div>)}
                </div>
              </details>
            ))}
          </div>
          {card.build.basis && (
            <div className="basis">
              {card.build.basis.image ? <img src={card.build.basis.image} alt="" /> : <div className="basis-ph" />}
              <div><span className="muted">기준</span> <b>{card.build.basis.title}</b><br /><span className="muted">{card.build.basis.source} · 일치율 {card.build.basis.match}%</span></div>
            </div>
          )}
          <div className="bnote">고른 장작으로 어림한 거야. {PARTS_NOTE}</div>
          <div className="flip-hint">다시 누르면 앞면 ↻</div>
        </div>
      </div>
    </div>
  );
}

export function Roast({ head, body, kind }: { head: string; body: string; kind: ReactKind }) {
  return (
    <div className="roast">
      <div className="roast-dk"><Dokkaebi motion="idle" fire={40} width={58} kind={kind} /></div>
      <div className="roast-bubble"><b>{head}</b><br />{body}</div>
    </div>
  );
}
