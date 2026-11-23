"use client";
import { useState } from "react";
import type { OwnedPart } from "../lib/project-types";
import { PART_CARDS } from "../lib/parts/catalog";
import { normalizePartName, samePartName } from "../lib/owned-parts";
import { IconTrash } from "./icons";

// 장비(tools)는 고정된 선택지로 물을 수 있다. 멀티미터·니퍼·3D 프린터는 종류가
// 뻔하니까. 부품은 그렇지 않다. 서랍에 뭐가 있는지는 사람마다 완전히 달라서
// 목록으로 고르게 할 수 없고, 직접 적게 해야 한다.
//
// 적어둔 부품은 두 군데에서 쓰인다. 부품목록에서 "이건 이미 있으니 빼세요"로,
// 그리고 회로 검사에서 가진 부품의 전압·로직레벨을 함께 본다. 두 번째는 부품
// 카드와 연결돼야 되므로, 아는 이름을 적으면 조용히 연결한다.

// 적은 이름이 아는 부품인지 찾는다. 모델명과 다른 이름(별칭)까지 본다.
// 정확히 같은 이름을 먼저 보고, 없을 때만 비슷한 이름을 찾는다. 그러지 않으면
// 먼저 나온 카드가 비슷하다는 이유로 정확히 맞는 카드를 가로챈다.
export function matchCatalog(name: string): string | null {
  const typed = normalizePartName(name);
  if (typed.length < 2) return null;
  const namesOf = (card: (typeof PART_CARDS)[number]) => [card.model, ...card.aliases, card.id];
  const exact = PART_CARDS.find((card) => namesOf(card).some((candidate) => normalizePartName(candidate) === typed));
  if (exact) return exact.id;
  // samePartName의 모호함 기준을 그대로 쓴다. "led"처럼 짧은 별칭이 "LED 링 12구"를
  // 가로채지 않게 막는 것이 여기서도 필요하다.
  return PART_CARDS.find((card) => namesOf(card).some((candidate) => samePartName(candidate, name)))?.id ?? null;
}

const blank = () => ({ name: "", qty: 1, note: "" });

export default function OwnedPartsField({ parts, onChange, max = 120 }: { parts: OwnedPart[]; onChange: (next: OwnedPart[]) => void; max?: number }) {
  const [draft, setDraft] = useState(blank());
  const linked = matchCatalog(draft.name);
  const full = parts.length >= max;

  function add() {
    const name = draft.name.trim();
    if (!name || full) return;
    onChange([...parts, { id: crypto.randomUUID().slice(0, 8), name, qty: Math.max(1, Math.min(999, Math.round(draft.qty) || 1)), catalogId: matchCatalog(name), note: draft.note.trim() }]);
    setDraft(blank());
  }

  return <fieldset className="owned-parts">
    <legend>가지고 있는 부품 <small>(선택)</small></legend>
    <small className="muted">적어두면 부품목록에서 이미 가진 것은 빼고 보여줘요. 아는 부품이면 사양까지 같이 봐서 회로 검사에 씁니다.</small>

    {parts.length > 0 && <ul className="owned-items">{parts.map((item) => <li key={item.id}>
      <span>
        <b>{item.name}</b> <small>× {item.qty}</small>
        {item.catalogId && <small className="owned-linked" title={`부품 카드 ${item.catalogId}와 연결됨`}>사양 있음</small>}
        {item.note && <small className="owned-note">{item.note}</small>}
      </span>
      <button type="button" aria-label={`${item.name} 지우기`} onClick={() => onChange(parts.filter((p) => p.id !== item.id))}><IconTrash/></button>
    </li>)}</ul>}

    <div className="owned-form">
      <label className="owned-name">부품 이름
        <input className="profile-input" list="owned-part-suggestions" maxLength={80} placeholder="예: AHT20 온습도 센서" value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />
      </label>
      <datalist id="owned-part-suggestions">{PART_CARDS.map((card) => <option key={card.id} value={card.model} />)}</datalist>
      <label className="owned-qty">수량
        <input className="profile-input" type="number" min={1} max={999} value={draft.qty}
          onChange={(e) => setDraft({ ...draft, qty: Number(e.target.value) })} />
      </label>
      {/* 방금 친 이름에 대한 반응이라 입력칸 바로 밑에 둔다. 버튼 아래로 내리면
          스크롤 밖으로 밀려 읽히지 않는다. */}
      {draft.name.trim() && <small className={linked ? "owned-hint on" : "owned-hint"}>{linked ? "아는 부품이에요 · 사양까지 함께 봐요" : "목록에만 남아요 · 사양은 모르는 부품이에요"}</small>}
      <label className="owned-memo"><span>메모 <small>(선택)</small></span>
        <input className="profile-input" maxLength={120} placeholder="예: 서랍 둘째 칸, 값 섞여 있음" value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
      </label>
      <button type="button" disabled={!draft.name.trim() || full} onClick={add}>추가</button>
    </div>

    {full && <small className="muted">{max}개까지 적을 수 있어요.</small>}
  </fieldset>;
}
