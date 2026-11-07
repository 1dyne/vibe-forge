"use client";
import { useEffect, useState } from "react";
import { track } from "./track";

type Me = { forge: { id: string } | null; replies: Array<{ id: string; asked: string; reply: string }>; notices: Array<{ id: number; title: string; body: string }> };

/** 다음 접속 때 달그락이 한 번 알려주는 말풍선: 우체통 답장, 광장의 새 소식 */
export default function VillageNews() {
  const [reply, setReply] = useState<Me["replies"][number] | null>(null);
  const [notice, setNotice] = useState<Me["notices"][number] | null>(null);
  useEffect(() => {
    fetch("/api/find/me", { cache: "no-store" }).then((r) => r.json()).then((me: Me) => {
      if (me.replies[0]) setReply(me.replies[0]);
      let seen = 0;
      try { seen = Number(localStorage.getItem("find_notice_seen") ?? 0); } catch { /* 저장소 없음 */ }
      const fresh = me.notices.find((n) => n.id > seen);
      if (fresh) setNotice(fresh);
    }).catch(() => undefined);
  }, []);
  if (reply) return (
    <div className="news" role="status">
      <b>네가 우체통에 넣은 거, 고쳐놨어!</b>
      <span className="muted tiny">“{reply.asked}…”</span>
      <span>{reply.reply}</span>
      <button className="link" type="button" onClick={() => { fetch("/api/find/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ replyIds: [reply.id] }) }).catch(() => undefined); track("mail_done_seen"); setReply(null); }}>고마워</button>
    </div>
  );
  if (notice) return (
    <div className="news" role="status">
      <b>광장에 새 소식 붙었어!</b>
      <span className="display" style={{ fontSize: 16 }}>{notice.title}</span>
      <span>{notice.body}</span>
      <button className="link" type="button" onClick={() => { try { localStorage.setItem("find_notice_seen", String(notice.id)); } catch { /* 무시 */ } track("notice_seen"); setNotice(null); }}>알았어</button>
    </div>
  );
  return null;
}
