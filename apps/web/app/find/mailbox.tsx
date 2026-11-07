"use client";
import { useState } from "react";
import { track } from "./track";

const KINDS = [
  { id: "feature", label: "이런 기능 있었으면" },
  { id: "bug", label: "이상해요" },
  { id: "decor", label: "골목·집 꾸미기 아이디어" },
  { id: "chat", label: "그냥 한마디" }
] as const;

/** 모든 화면 구석의 작은 달그락 우체통. 글은 다인만 본다(공개 게시판 아님). */
export default function Mailbox({ screen }: { screen: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="mailbox-fab" aria-label="달그락 우체통" onClick={() => setOpen(true)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 11a5 5 0 0 1 10 0v8H4z" /><path d="M9 6h7a4 4 0 0 1 4 4v9h-6" /><path d="M14 4v5h3" /></svg>
      </button>
      {open && <MailSheet screen={screen} onClose={() => setOpen(false)} />}
    </>
  );
}

export function MailSheet({ screen, onClose }: { screen: string; onClose: () => void }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("feature");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { hasForge: boolean }>(null);
  const [error, setError] = useState("");
  async function send() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/find/mail", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, body, screen }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "편지를 못 넣었어.");
      setDone({ hasForge: json.hasForge }); track("mail_sent", { kind });
    } catch (e) { setError(e instanceof Error ? e.message : "편지를 못 넣었어."); } finally { setBusy(false); }
  }
  return (
    <div className="overlay" role="dialog" aria-label="달그락 우체통" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="display" style={{ fontSize: 21 }}>달그락 우체통</div>
        {done ? (
          <>
            <p className="body" style={{ margin: 0 }}>잘 받았어! 다인이 직접 읽어.{done.hasForge ? " 반영되면 네 대장간에 들를 때 내가 알려줄게." : ""}</p>
            <button className="btn" type="button" onClick={onClose}>닫기</button>
          </>
        ) : (
          <>
            <p className="muted small" style={{ margin: 0 }}>다인만 보는 비밀 편지함이야. 이름이나 연락처는 안 받아.</p>
            <div className="chips">{KINDS.map((k) => <button key={k.id} type="button" className={`chip${kind === k.id ? " fresh" : ""}`} onClick={() => setKind(k.id)}>{k.label}</button>)}</div>
            <textarea rows={5} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="편하게 적어줘" aria-label="편지 내용" />
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn" type="button" disabled={busy || body.trim().length < 2} onClick={send}>{busy ? "넣는 중…" : "우체통에 넣기"}</button>
            <button className="link" type="button" onClick={onClose}>닫기</button>
          </>
        )}
      </div>
    </div>
  );
}
