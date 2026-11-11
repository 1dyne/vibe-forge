"use client";
import { useState } from "react";
import type { LanternGroup, LanternRecord, PublicLantern } from "../../lib/find/lantern";
import { track } from "./track";

const TARGET_MAX = 12, WISH_MAX = 30;
/** "엄마를 위해" / "콩이를 위해" / "동생을 위해": 받침에 따라 을·를 */
function forWhom(t: string | null) {
  if (!t) return "누군가를 위해";
  const c = t.charCodeAt(t.length - 1);
  const batchim = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return `${t}${batchim ? "을" : "를"} 위해`;
}

async function patch(id: string, action: "done" | "remove" | "make" | "unmake") {
  const res = await fetch("/api/find/lantern", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action }) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

/** 소원 줄 하나: 같은 소원을 빈 도깨비들, 만들어볼게, 같이 고민할 사람 연결 */
export function RopeSheet({ group: initial, hasForge, onClose }: { group: LanternGroup; hasForge: boolean; onClose: () => void }) {
  const [group, setGroup] = useState(initial);
  const [msg, setMsg] = useState("");
  const lit = group.lanterns.filter((l) => l.status === "lit");
  const done = group.lanterns.filter((l) => l.status === "done");
  const open = group.lanterns.filter((l) => l.forgeId && !l.mine);
  async function make(l: PublicLantern) {
    if (!hasForge) { setMsg("너만의 도깨비불부터 찾아야 솜씨 도깨비가 될 수 있어."); return; }
    const { ok, json } = await patch(l.id, l.iMake ? "unmake" : "make");
    if (!ok) { setMsg(json.error ?? json.message ?? "바꾸지 못했어."); return; }
    const g = (json.groups as LanternGroup[]).find((x) => x.key === group.key);
    if (g) setGroup(g);
    track(l.iMake ? "lantern_unmake" : "lantern_make");
  }
  return (
    <div className="overlay" role="dialog" aria-label="소원 줄" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet tall lantern-sheet">
        <div className="tiny muted">소원 줄</div>
        <div className="display" style={{ fontSize: 21 }}>{group.label}</div>
        <div className="small">같은 소원을 빈 도깨비 <b>{group.count}</b>명{group.done ? ` · 이뤄진 소원 ${group.done}개` : ""}</div>
        <div className="lantern-list">
          {lit.map((l) => (
            <div key={l.id} className="lantern-row">
              <i className={l.makers ? "taken" : ""} aria-hidden />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{forWhom(l.target)}</b>
                <span>{l.wish}</span>
                <small>{l.forgeId ? <a href={`/f/${l.forgeId}`}>{l.nickname}의 대장간</a> : l.nickname}{l.fireName ? ` · ${l.fireName}` : ""}{l.makers ? ` · 솜씨 도깨비 ${l.makers}명이 만들어보는 중` : ""}</small>
              </div>
              {!l.mine && <button type="button" className={`chip ${l.iMake ? "on" : ""}`} onClick={() => make(l)}>{l.iMake ? "만드는 중" : "만들어볼게"}</button>}
            </div>
          ))}
          {done.length > 0 && <div className="tiny muted" style={{ marginTop: 8 }}>이뤄져서 호수에 띄운 소원</div>}
          {done.map((l) => <div key={l.id} className="lantern-row done"><i aria-hidden /><div style={{ flex: 1 }}><b>{forWhom(l.target)}</b><span>{l.wish}</span></div></div>)}
        </div>
        {open.length > 0 && (
          <div className="note">
            <b className="small">같이 고민해볼 도깨비</b>
            <span className="small body">구상안을 공개해둔 도깨비들이야. 대장간에 들러서 어떻게 만들고 있는지 구경해봐.</span>
            <div className="phrases">{open.slice(0, 8).map((l) => <a key={l.id} className="chip" href={`/f/${l.forgeId}`}>{l.nickname}</a>)}</div>
          </div>
        )}
        {msg && <div className="error" role="status">{msg}</div>}
        <a className="btn btn-ghost" href={hasForge ? "/find/home#lantern" : "/find"} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>{hasForge ? "나도 등불 걸러 가기" : "내 도깨비불 찾고 등불 걸기"}</a>
        <button className="link" type="button" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}

/** 내 대장간: 내 등불 목록과 새 등불 걸기 */
export function MyLanterns({ initial, allowance, fires, onClose }: { initial: LanternRecord[]; allowance: number; fires: Array<{ id: string; name: string }>; onClose: () => void }) {
  const [list, setList] = useState(initial);
  const [form, setForm] = useState({ fireId: fires[0]?.id ?? "", target: "", wish: "", hideTarget: false, private: false, shareCard: true });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const left = allowance - list.length;
  async function hang() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/find/lantern", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) { setMsg(json.error ?? json.message ?? "걸지 못했어."); return; }
    setList([json.lantern, ...list]); setForm({ ...form, target: "", wish: "" });
    setMsg("등불을 걸었어! 마을 호수 위 소원 줄에 매달렸어.");
    track("lantern_hung", { private: String(form.private), share: String(form.shareCard), hide: String(form.hideTarget) });
  }
  async function act(l: LanternRecord, action: "done" | "remove") {
    const { ok, json } = await patch(l.id, action);
    if (!ok) { setMsg(json.error ?? "바꾸지 못했어."); return; }
    setList(action === "remove" ? list.filter((x) => x.id !== l.id) : list.map((x) => (x.id === l.id ? { ...x, status: "done" } : x)));
    track(action === "done" ? "lantern_done" : "lantern_removed");
  }
  return (
    <div className="overlay" role="dialog" aria-label="소원 등불" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet tall lantern-sheet">
        <div className="display" style={{ fontSize: 22 }}>소원 등불</div>
        <div className="small body">만들어주고 싶은 사람에게 등불을 걸어봐. 같은 소원을 빈 도깨비들과 한 줄에 꿰이고, 솜씨 도깨비가 “만들어볼게” 하고 받아갈 수도 있어.</div>
        {list.length > 0 && (
          <div className="lantern-list">
            {list.map((l) => (
              <div key={l.id} className={`lantern-row ${l.status === "done" ? "done" : ""}`}>
                <i aria-hidden />
                <div style={{ flex: 1, minWidth: 0 }}><b>{forWhom(l.target)}</b><span>{l.wish}</span><small>{l.private ? "나만 보기" : l.hideTarget ? "대상 이름 가림" : "전체 공개"}{l.shareCard ? " · 구상안 함께 공개" : ""}{l.status === "done" ? " · 이뤄져서 호수에 띄움" : ""}</small></div>
                {l.status === "lit" && <button type="button" className="chip" onClick={() => act(l, "done")}>이뤄졌어</button>}
                <button type="button" className="link" style={{ fontSize: 12 }} onClick={() => act(l, "remove")}>내리기</button>
              </div>
            ))}
          </div>
        )}
        {left > 0 ? (
          <form className="lantern-form" onSubmit={(e) => { e.preventDefault(); hang(); }}>
            <div className="tiny muted">걸 수 있는 등불 {left}개 남음 (도깨비불을 새로 찾을 때마다 하나 더)</div>
            <label htmlFor="ln-fire">어떤 도깨비불로?</label>
            <select id="ln-fire" value={form.fireId} onChange={(e) => setForm({ ...form, fireId: e.target.value })}>{fires.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            <label htmlFor="ln-target">누구를 위해 <span className="tiny muted">({form.target.length}/{TARGET_MAX})</span></label>
            <input id="ln-target" maxLength={TARGET_MAX} placeholder="엄마, 콩이, 나 …" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
            <label htmlFor="ln-wish">기원 한 줄 <span className="tiny muted">({form.wish.length}/{WISH_MAX})</span></label>
            <input id="ln-wish" maxLength={WISH_MAX} placeholder="약 먹을 시간을 안 잊으셨으면" value={form.wish} onChange={(e) => setForm({ ...form, wish: e.target.value })} />
            <div className="tiny muted">실명·연락처는 적지 말아줘. 처음 쓴 아이디어 문장은 어디에도 보이지 않아.</div>
            <div className="phrases" role="radiogroup" aria-label="공개 범위">
              <button type="button" className={`chip ${!form.private && !form.hideTarget ? "on" : ""}`} onClick={() => setForm({ ...form, private: false, hideTarget: false })}>전체 공개</button>
              <button type="button" className={`chip ${!form.private && form.hideTarget ? "on" : ""}`} onClick={() => setForm({ ...form, private: false, hideTarget: true })}>대상 이름 가리기</button>
              <button type="button" className={`chip ${form.private ? "on" : ""}`} onClick={() => setForm({ ...form, private: true })}>나만 보기</button>
            </div>
            {!form.private && (
              <label className="decor-toggle">
                <input type="checkbox" checked={form.shareCard} onChange={(e) => setForm({ ...form, shareCard: e.target.checked })} />
                <span><b className="small">구상안도 함께 공개</b><br /><span className="tiny muted">같은 소원을 빈 도깨비들이 네 대장간에 들러 도깨비불 카드를 볼 수 있어. 같이 고민할 사람을 만나는 길이야.</span></span>
              </label>
            )}
            <button className="btn btn-fire" type="submit" disabled={busy || !form.target.trim() || !form.wish.trim() || !form.fireId}>{busy ? "거는 중…" : "등불 걸기"}</button>
          </form>
        ) : <div className="note small">등불을 다 걸었어. 새 도깨비불을 찾으면 하나 더 걸 수 있어.</div>}
        {msg && <div className="small" role="status">{msg}</div>}
        <a className="btn btn-ghost" href="/find/village" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>마을 소원 줄 보러 가기</a>
        <button className="link" type="button" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
