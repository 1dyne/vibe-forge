"use client";
import { useState } from "react";

export function DeleteEntry({ id, email }: { id: string; email: string }) {
  const [gone, setGone] = useState(false);
  if (gone) return <span style={{ fontSize: 12, color: "#888" }}>삭제됨</span>;
  return (
    <button type="button" style={{ fontSize: 12, padding: "3px 8px" }} onClick={async () => {
      if (!confirm(`${email} 신청과 도깨비불을 지울까요? 되돌릴 수 없어요.`)) return;
      const res = await fetch("/api/admin/find/entry", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      if (res.ok) setGone(true);
    }}>삭제</button>
  );
}

export function ClearEvents() {
  const [done, setDone] = useState<number | null>(null);
  return (
    <button type="button" style={{ fontSize: 12 }} onClick={async () => {
      if (!confirm("지금까지 쌓인 이벤트(지표)를 모두 지울까요? 오픈 전 테스트 기록 정리용이에요.")) return;
      const res = await fetch("/api/admin/find/events", { method: "DELETE" });
      if (res.ok) setDone((await res.json()).cleared);
    }}>{done === null ? "지표 초기화(오픈 전 테스트 기록 정리)" : `이벤트 ${done}개 지움 — 새로고침하세요`}</button>
  );
}
