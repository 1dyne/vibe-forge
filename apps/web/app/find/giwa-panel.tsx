"use client";
import { useEffect, useState } from "react";
import type { Giwa } from "../../lib/find/giwa";
import { track } from "./track";

const GIWA_MAX = 20;

/** 본관 기와: 옛 절집 중창 때 기와에 이름과 소원을 적어 올리던 풍습처럼, 대장간마다 한 장 (무료) */
export default function GiwaBoard({ hasForge }: { hasForge: boolean }) {
  const [data, setData] = useState<{ list: Giwa[]; total: number; mine: { wish: string } | null; canCarve: boolean } | null>(null);
  const [wish, setWish] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => fetch("/api/find/giwa").then((r) => r.json()).then(setData).catch(() => setData({ list: [], total: 0, mine: null, canCarve: false }));
  useEffect(() => { load(); }, []);
  async function carve() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/find/giwa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wish }) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) { setMsg(json.error ?? "새기지 못했어."); return; }
    setWish(""); setMsg("기와를 새겼어! 본관 지붕을 올릴 때 이 기와도 같이 올라가."); track("giwa_carved"); load();
  }
  return (
    <div className="notes" id="giwa">
      <div className="tiny muted">본관 기와 — 대장간마다 한 장, 이름과 한 줄 기원을 새겨 올려 {data ? `(지금 ${data.total}장)` : ""}</div>
      {data?.canCarve && (
        <form className="lantern-form" onSubmit={(e) => { e.preventDefault(); carve(); }}>
          <label htmlFor="giwa-wish">기원 한 줄 <span className="tiny muted">({wish.length}/{GIWA_MAX})</span></label>
          <input id="giwa-wish" maxLength={GIWA_MAX} placeholder="첫 발명품 꼭 완성하기" value={wish} onChange={(e) => setWish(e.target.value)} />
          <div className="tiny muted">대장간 이름이 같이 새겨져. 한 번 새기면 못 바꿔. 연락처는 적지 말아줘.</div>
          <button className="btn btn-fire" type="submit" disabled={busy || !wish.trim()}>{busy ? "새기는 중…" : "기와 새기기 (무료)"}</button>
        </form>
      )}
      {data?.mine && <div className="small">내 기와: “{data.mine.wish}”</div>}
      {!hasForge && <div className="small muted">내 도깨비불을 찾아 대장간을 지으면 기와 한 장을 새길 수 있어.</div>}
      {msg && <div className="small" role="status">{msg}</div>}
      {data && data.list.length > 0 && (
        <div className="giwa-list">{data.list.map((g) => <span key={g.forgeId} className="giwa"><span>{g.wish}</span><small>{g.nickname}</small></span>)}</div>
      )}
    </div>
  );
}
