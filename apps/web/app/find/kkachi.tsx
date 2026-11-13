"use client";
import { useCallback, useEffect, useState } from "react";
import { track } from "./track";

// 까치: 반가운 소식을 물어오는 새 (우리 민속). 마을·대장간 왼쪽 위에서 대장간과 마을 업데이트를 알려주고,
// 누르면 대장장이 다인에게 고장 신고를 보내거나 메일을 쓸 수 있다.
export const MAKER_EMAIL = "1dyne.official@gmail.com";
type Notice = { id: number; title: string; body: string; kind: string; publishedAt: string };
type Reply = { id: string; asked: string; reply: string };
const SEEN_KEY = "find_notice_seen";
const readSeen = () => { try { return Number(localStorage.getItem(SEEN_KEY) ?? 0); } catch { return 0; } };

export default function Kkachi({ where, onTutorial }: { where: "village" | "forge"; onTutorial?: () => void }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [seen, setSeen] = useState(0);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => {
    fetch("/api/find/me", { cache: "no-store" }).then((r) => r.json()).then((j) => { setNotices(j.notices ?? []); setReplies(j.replies ?? []); }).catch(() => undefined);
  }, []);
  useEffect(() => {
    setSeen(readSeen()); load();
    const t = setInterval(load, 90_000); // 굴뚝 연기처럼 가끔 확인 (서버 부담 적게)
    return () => clearInterval(t);
  }, [load]);
  const unread = replies.length > 0 || notices.some((n) => n.id > seen);
  function openSheet() {
    setOpen(true);
    const top = notices.reduce((m, n) => Math.max(m, n.id), seen);
    try { localStorage.setItem(SEEN_KEY, String(top)); } catch { /* 무시 */ }
    setSeen(top);
    track("notice_seen", { via: "kkachi", where });
  }
  return (
    <>
      <button type="button" className={`kkachi ${unread ? "has-news" : ""}`} onClick={openSheet} aria-label={unread ? "까치: 새 소식 있음" : "까치: 소식과 다인에게 보내기"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/find/kkachi.png" alt="" width={40} height={40} />
        {unread && <i aria-hidden />}
      </button>
      {open && <KkachiSheet notices={notices} replies={replies} where={where} onTutorial={onTutorial} onReplySeen={(id) => setReplies((r) => r.filter((x) => x.id !== id))} onClose={() => setOpen(false)} />}
    </>
  );
}

const KIND = (k: string) => (k === "alley" || k === "event" ? "마을 소식" : "대장간 소식");

function KkachiSheet({ notices, replies, where, onTutorial, onReplySeen, onClose }: { notices: Notice[]; replies: Reply[]; where: string; onTutorial?: () => void; onReplySeen: (id: string) => void; onClose: () => void }) {
  const [mode, setMode] = useState<"news" | "bug">("news");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  async function sendBug() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/find/mail", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "bug", body: body.trim(), screen: `${where}:${location.pathname}`.slice(0, 120) }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setMsg("못 보냈어. 잠시 뒤 다시 해줘."); return; }
    setBody(""); setMode("news"); setMsg("다인에게 전했어! 답이 오면 까치가 물어다 줄게.");
    track("mail_sent", { kind: "bug", via: "kkachi" });
  }
  async function seenReply(id: string) {
    await fetch("/api/find/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replyIds: [id] }) }).catch(() => undefined);
    onReplySeen(id); track("mail_done_seen");
  }
  async function copyMail() { try { await navigator.clipboard.writeText(MAKER_EMAIL); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* 직접 선택해서 복사 */ } }
  return (
    <div className="overlay kkachi-overlay" role="dialog" aria-label="까치가 물어온 소식" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet tall kkachi-sheet">
        <div className="display" style={{ fontSize: 22 }}>까치가 물어온 소식</div>
        {mode === "news" ? (
          <>
            {replies.map((r) => (
              <div key={r.id} className="note kk-reply">
                <div className="tiny muted">대장장이 다인의 답장 · “{r.asked}…”</div>
                <span className="body">{r.reply}</span>
                <button className="link" type="button" onClick={() => seenReply(r.id)}>고마워</button>
              </div>
            ))}
            {notices.length === 0 ? <div className="small muted">아직 새 소식이 없어. 대장간이나 마을이 바뀌면 까치가 먼저 알려줄게.</div> : (
              <div className="kk-list">
                {notices.map((n) => (
                  <div key={n.id} className="kk-item">
                    <small>{KIND(n.kind)} · {n.publishedAt.slice(5, 10).replace("-", ".")}</small>
                    <b>{n.title}</b>
                    <span>{n.body}</span>
                  </div>
                ))}
              </div>
            )}
            {msg && <div className="small" role="status">{msg}</div>}
            <div className="kk-maker">
              <div className="tiny muted">대장장이 다인에게</div>
              <div className="two">
                <button className="btn btn-ghost" type="button" onClick={() => { setMode("bug"); setMsg(""); }}>고장 신고</button>
                <a className="btn btn-ghost" href={`mailto:${MAKER_EMAIL}?subject=${encodeURIComponent("[달그락] ")}`} onClick={() => track("mail_sent", { kind: "email", via: "kkachi" })} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>메일 쓰기</a>
              </div>
              <div className="kk-email"><span>{MAKER_EMAIL}</span><button type="button" className="link" onClick={copyMail}>{copied ? "복사했어" : "주소 복사"}</button></div>
            </div>
            {onTutorial && <button className="link" type="button" onClick={() => { onClose(); onTutorial(); }}>{where === "forge" ? "대장간 안내 다시 보기" : "마을 안내 다시 보기"}</button>}
          </>
        ) : (
          <form className="lantern-form" onSubmit={(e) => { e.preventDefault(); if (body.trim().length >= 2) sendBug(); }}>
            <label htmlFor="kk-bug">어디서 뭐가 이상했어?</label>
            <textarea id="kk-bug" rows={5} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="예: 대장간에서 작업대를 눌렀는데 아무것도 안 떠" />
            <div className="tiny muted">지금 보고 있던 화면과 기기 종류가 같이 가. 이름이나 연락처는 안 받아. 답이 오면 까치가 물어다 줘.</div>
            {msg && <div className="error" role="alert">{msg}</div>}
            <div className="two">
              <button className="btn btn-ghost" type="button" onClick={() => setMode("news")}>뒤로</button>
              <button className="btn btn-fire" type="submit" disabled={busy || body.trim().length < 2}>{busy ? "보내는 중…" : "다인에게 보내기"}</button>
            </div>
          </form>
        )}
        <button className="link" type="button" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
