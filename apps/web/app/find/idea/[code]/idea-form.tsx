"use client";
import { useEffect, useState, type FormEvent } from "react";

// ── MEETUP: 2026-11-28 밋업 시연 전용 (lib/meetup-inbox.ts 참고). 밋업이 끝나면 지운다 ──
export default function IdeaForm({ code }: { code: string }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    try { setName(localStorage.getItem("meetup_name") ?? ""); } catch { /* 무시 */ }
    let stop = false;
    const check = () => fetch(`/api/find/meetup-idea?code=${code}`, { cache: "no-store" }).then((r) => r.json()).then((b) => { if (!stop) setOpen(!!b.open); }).catch(() => {});
    void check();
    const timer = setInterval(check, 15000);
    return () => { stop = true; clearInterval(timer); };
  }, [code]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const idea = text.trim();
    if (idea.length < 2 || busy) return;
    setBusy(true); setError("");
    try {
      try { localStorage.setItem("meetup_name", name.trim()); } catch { /* 무시 */ }
      const r = await fetch("/api/find/meetup-idea", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, text: idea, name: name.trim() }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "보내지 못했어요. 다시 눌러 주세요.");
      setSent((s) => [idea, ...s]); setText(""); setOpen(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "보내지 못했어요."); }
    finally { setBusy(false); }
  }

  return (
    <main className="idea-page">
      <style>{`
        .idea-page{min-height:100dvh;background:#f6f1e7;color:#232323;padding:26px 16px 60px;font-size:17px;line-height:1.6}
        .idea-page .card{max-width:520px;margin:0 auto;border:2px solid #232323;border-radius:18px;background:#fffdf6;box-shadow:4px 4px 0 #232323;padding:20px}
        .idea-page h1{margin:0 0 6px;font-size:1.5em;line-height:1.25}
        .idea-page p{margin:0 0 12px}
        .idea-page label{display:block;font-weight:700;margin:12px 0 4px}
        .idea-page input,.idea-page textarea{width:100%;box-sizing:border-box;border:2px solid #232323;border-radius:12px;padding:10px 12px;font:inherit;background:#fff}
        .idea-page textarea{min-height:110px;resize:vertical}
        .idea-page button{margin-top:14px;width:100%;border:2px solid #232323;border-radius:999px;background:#ff8a5c;font:inherit;font-weight:800;padding:11px;box-shadow:3px 3px 0 #232323}
        .idea-page button:disabled{opacity:.55}
        .idea-page .err{color:#b3261e;font-weight:700;margin-top:10px}
        .idea-page .wait{background:#ffe9a8;border:1.5px solid #232323;border-radius:10px;padding:6px 10px;font-size:.9em}
        .idea-page ul{margin:16px 0 0;padding:0;list-style:none}
        .idea-page li{border:1.5px solid #232323;border-radius:12px;background:#fff;padding:8px 12px;margin-top:8px}
        .idea-page small{color:#6f6a61}
      `}</style>
      <div className="card">
        <h1>사만다에 더하고 싶은 것</h1>
        <p>떠오른 아이디어를 한 줄로 보내 주세요. 발표 화면의 대장 달그락이 받아 적고, 다 만든 뒤 편지로 답해요.</p>
        {open === false && <p className="wait">아직 발표 화면이 열리지 않았어요. 열리면 바로 보낼 수 있어요.</p>}
        <form onSubmit={submit}>
          <label htmlFor="idea-name">이름 또는 별명 <small>(안 적어도 돼요)</small></label>
          <input id="idea-name" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="예: 다인" autoComplete="nickname" />
          <label htmlFor="idea-text">아이디어</label>
          <textarea id="idea-text" value={text} maxLength={140} onChange={(e) => setText(e.target.value)} placeholder="예: 배터리로 들고 다닐 수 있으면 좋겠어요" />
          <small>{text.trim().length} / 140</small>
          <button type="submit" disabled={busy || text.trim().length < 2}>{busy ? "보내는 중…" : "보내기"}</button>
        </form>
        {error && <p className="err" role="alert">{error}</p>}
        {sent.length > 0 && <ul aria-label="보낸 아이디어">{sent.map((s, i) => <li key={i}>✓ {s}</li>)}</ul>}
      </div>
    </main>
  );
}
