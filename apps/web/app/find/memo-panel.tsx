"use client";
import { useEffect, useState } from "react";
import type { MemoRecord } from "../../lib/find/memo";
import { track } from "./track";

const MEMO_MAX = 300;

/** 작업실 메모: 도깨비불마다 글·링크를 남기고, 한 번에 내보낸다. 주인만 본다. */
export function MemoSheet({ fires, initialFire, onCount, onClose }: { fires: Array<{ id: string; name: string; sentence: string }>; initialFire?: string; onCount: (n: number) => void; onClose: () => void }) {
  const [memos, setMemos] = useState<MemoRecord[] | null>(null);
  const [fireId, setFireId] = useState(initialFire ?? fires[0]?.id ?? "");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/find/memo").then((r) => r.json()).then((j) => { setMemos(j.memos ?? []); onCount((j.memos ?? []).length); }).catch(() => setMemos([]));
  }, [onCount]);

  const fire = fires.find((f) => f.id === fireId);
  const list = (memos ?? []).filter((m) => m.fireId === fireId);

  async function add() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/find/memo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fireId, body, url: url || undefined }) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) { setMsg(json.error ?? "남기지 못했어."); return; }
    const next = [json.memo as MemoRecord, ...(memos ?? [])];
    setMemos(next); onCount(next.length); setBody(""); setUrl("");
    track("memo_added", { link: String(Boolean(url)) });
  }
  async function remove(id: string) {
    const res = await fetch("/api/find/memo", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
    if (!res?.ok) { setMsg("지우지 못했어."); return; }
    const next = (memos ?? []).filter((m) => m.id !== id);
    setMemos(next); onCount(next.length);
  }
  async function exportAll() {
    const res = await fetch("/api/find/memo?export=1").catch(() => null);
    if (!res?.ok) { setMsg("내보내지 못했어."); return; }
    const md = await res.text();
    setExported(md);
    try { await navigator.clipboard.writeText(md); setMsg("작업실 메모 전부를 복사했어. 메모장이나 AI 대화창에 붙여 넣으면 돼."); } catch { setMsg("아래 글을 길게 눌러 복사해줘."); }
    track("memo_exported", { count: String((memos ?? []).length) });
  }

  return (
    <div className="overlay" role="dialog" aria-label="작업실 메모" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet tall memo-sheet">
        <div className="display" style={{ fontSize: 22 }}>작업실 메모</div>
        <div className="small body">도깨비불마다 떠오른 생각, 찾아본 부품, 참고할 링크를 적어둬. 너만 볼 수 있어. 메모를 남길수록 설계도 판에 쪽지가 붙어.</div>
        {fires.length > 1 && (
          <div className="phrases" role="tablist" aria-label="도깨비불 고르기">
            {fires.map((f) => <button key={f.id} type="button" role="tab" aria-selected={f.id === fireId} className={`chip ${f.id === fireId ? "on" : ""}`} onClick={() => setFireId(f.id)}>{f.name}</button>)}
          </div>
        )}
        {fire && <div className="note"><div className="tiny muted">{fire.name} · 설계 한 줄</div><div className="sentence" style={{ fontSize: 15 }}>{fire.sentence}</div></div>}
        <form className="lantern-form" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <label htmlFor="memo-body">새 메모 <span className="tiny muted">({body.length}/{MEMO_MAX})</span></label>
          <textarea id="memo-body" rows={3} maxLength={MEMO_MAX} placeholder="예: 무게 센서는 컵 아래에 두면 될 듯 / 건전지로 한 달은 가야 함" value={body} onChange={(e) => setBody(e.target.value)} />
          <label htmlFor="memo-url">참고 링크 <span className="tiny muted">(선택)</span></label>
          <input id="memo-url" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn btn-fire" type="submit" disabled={busy || !body.trim() || !fireId}>{busy ? "남기는 중…" : "메모 남기기"}</button>
        </form>
        {memos === null ? <div className="small muted">메모를 불러오는 중…</div> : list.length === 0 ? <div className="small muted">아직 이 도깨비불에 남긴 메모가 없어.</div> : (
          <div className="memo-list">
            {list.map((m) => (
              <div key={m.id} className="memo-row">
                <div className="lantern-text"><span>{m.body}</span>{m.url && <a href={m.url} target="_blank" rel="noopener noreferrer nofollow">{m.url.replace(/^https?:\/\//, "").slice(0, 40)}</a>}<small>{m.createdAt.slice(0, 10)}</small></div>
                <button type="button" className="link" style={{ fontSize: 13 }} onClick={() => remove(m.id)}>지우기</button>
              </div>
            ))}
          </div>
        )}
        <div className="note">
          <b className="small">한 번에 내보내기</b>
          <span className="small body">모든 도깨비불의 처음 쓴 문장, 설계 한 줄, 고른 장작, 만들 물건 구성, 메모를 한 문서로 모아줘. 달그락 대장간이 열리면 이 문서로 바로 만들기 시작할 수 있어.</span>
          <div className="two">
            <button className="btn btn-ghost" type="button" onClick={exportAll}>복사하기</button>
            <a className="btn btn-ghost" href="/api/find/memo?export=1" download="dalgrak-memo.md" onClick={() => track("memo_downloaded")} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>파일로 받기</a>
          </div>
          {exported && <textarea className="memo-export" readOnly rows={6} value={exported} aria-label="내보낸 메모" />}
        </div>
        {msg && <div className="small" role="status">{msg}</div>}
        <button className="link" type="button" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
