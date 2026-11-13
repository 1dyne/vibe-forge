"use client";
import { useState } from "react";

// 이 기기에 남은 달그락 기록(이름, 내 대장간 열쇠, 안내 본 표시, 연습 기록 등)을 지우고 처음 온 사람처럼 시작한다.
const PREFIXES = ["find_", "forge_tut", "village_tut", "dalgeurak_practice", "bench_", "qa_"];

export default function ResetDevice() {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function reset() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/find/reset", { method: "POST" }).catch(() => null);
    try {
      for (const store of [localStorage, sessionStorage]) {
        for (const k of Object.keys(store)) if (PREFIXES.some((p) => k.startsWith(p))) store.removeItem(k);
      }
    } catch { /* 저장소가 막혀 있으면 쿠키만 지운다 */ }
    if (!res?.ok) { setBusy(false); setMsg("지우지 못했어. 잠시 뒤 다시 해줘."); return; }
    window.location.href = "/find";
  }
  return (
    <section className="screen">
      <h1>이 기기에서 처음부터</h1>
      <p className="body">이 기기에 남은 이름, 내 대장간 열쇠, 안내를 본 표시, 손 기술 연습 기록을 지우고 처음 온 사람처럼 다시 시작해.</p>
      <div className="note small">
        <b>알아둘 것</b>
        <span>지금 대장간은 지워지지 않고 마을에 그대로 남아. 다만 이 기기에서는 다시 &lsquo;내 대장간&rsquo;으로 들어갈 수 없게 돼. 같은 메일로 다시 남기면 새 대장간에서도 마을 문이 열려.</span>
      </div>
      <label className="check"><input id="reset-sure" type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /><span>알겠어, 처음부터 할래</span></label>
      {msg && <p className="error" role="alert">{msg}</p>}
      <button className="btn btn-fire" type="button" disabled={!sure || busy} onClick={reset}>{busy ? "지우는 중…" : "처음부터 다시 시작"}</button>
      <a className="link" href="/find">그만두기</a>
    </section>
  );
}
