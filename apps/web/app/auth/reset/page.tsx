"use client";
import { FormEvent, useEffect, useState } from "react";
import RecoveryCode from "../../recovery-code";

export default function ResetPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [abandon, setAbandon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ recoveryCode: string; keptRecords: boolean } | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setToken(window.location.hash.slice(1)); window.history.replaceState(null, "", window.location.pathname); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    if (password !== confirm) { setError("비밀번호 확인이 일치하지 않아요."); return; }
    if (abandon && !confirm_abandon()) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/auth/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(abandon ? { token, password, abandon: true } : { token, password, recoveryCode: code }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      setDone(b);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }
  const confirm_abandon = () => window.confirm("복구 코드 없이 진행하면 지금까지의 프로젝트와 기록이 모두 지워지고 되돌릴 수 없어요. 계속할까요?");

  return <main className="login-shell"><section className="login-card join-card">
    <img src="/characters/idle.png" alt="" width="85" height="85" style={{ objectFit: "contain" }} />
    <h1>비밀번호 다시 만들기</h1>
    {done ? <div className="join-issued">
      <p>{done.keptRecords ? "새 비밀번호로 바꿨어요. 내 기록은 그대로 있어요." : "새 비밀번호로 바꿨어요. 예전 기록은 지워졌고 새로 시작해요."}</p>
      <p>복구 코드도 새로 만들었어요. 예전 복구 코드는 이제 쓸 수 없어요.</p>
      <RecoveryCode code={done.recoveryCode} onSaved={setSaved} />
      <a className={`join-continue${saved ? "" : " disabled"}`} aria-disabled={!saved} href={saved ? "/login" : undefined}>로그인하기</a>
    </div> : !token ? <p className="login-error">링크가 올바르지 않아요. 메일의 버튼을 다시 눌러주세요.</p> : <form className="join-form" onSubmit={submit}>
      {error && <p className="login-error" role="alert">{error}</p>}
      <label htmlFor="new-password">새 비밀번호 <small>(10자 이상)</small></label>
      <input id="new-password" type="password" value={password} minLength={10} required onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      <label htmlFor="new-confirm">새 비밀번호 확인</label>
      <input id="new-confirm" type="password" value={confirm} required onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      {!abandon && <><label htmlFor="recovery">복구 코드 <small>(가입할 때 받은 XXXX-XXXX-… 코드)</small></label>
        <input id="recovery" value={code} required onChange={(e) => setCode(e.target.value)} autoComplete="off" /></>}
      <label className="remember-session"><input type="checkbox" checked={abandon} onChange={(e) => setAbandon(e.target.checked)} /><span>복구 코드가 없어요. <b>지금까지의 기록을 지우고</b> 새로 시작할게요.</span></label>
      {abandon && <p className="danger-notice">내 기록은 비밀번호나 복구 코드로만 열리게 잠겨 있어서, 둘 다 없으면 운영자도 되살릴 수 없어요. 계정은 되찾지만 프로젝트는 모두 지워져요.</p>}
      <button disabled={busy || password.length < 10 || !confirm || (!abandon && !code.trim())}>{busy ? "바꾸는 중…" : "비밀번호 바꾸기"}</button>
    </form>}
  </section></main>;
}
