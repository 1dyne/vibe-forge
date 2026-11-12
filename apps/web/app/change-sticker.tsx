"use client";
import { useState } from "react";
import type { Provisional } from "../lib/provisional";

// '바뀔 수 있어요' 스티커. 노란 테이프처럼 살짝 기울여 붙이고, 누르면 이유가 펼쳐진다.
export function ChangeSticker({ reasons, compact = false }: { reasons: Provisional[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!reasons.length) return null;
  return <div className={`change-sticker ${compact ? "compact" : ""} ${open ? "open" : ""}`}>
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} title={reasons.map((r) => r.detail).join("\n")}>
      <span className="ic" aria-hidden>🔧</span><b>바뀔 수 있어요</b><span className="tags">{reasons.map((r) => r.label).join(" · ")}</span>
    </button>
    {open && <ul>{reasons.map((r) => <li key={r.key}><b>{r.label}</b> {r.detail}</li>)}</ul>}
  </div>;
}
