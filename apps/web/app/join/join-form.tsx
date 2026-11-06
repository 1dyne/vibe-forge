"use client";
import { FormEvent, useState } from "react";
import GoogleNotice from "../google-notice";
import RecoveryCode from "../recovery-code";

type Done = { name: string; email: string; recoveryCode: string };

export default function JoinForm({ needsCode, google, askGoogleConsent }: { needsCode: boolean; google: boolean; askGoogleConsent: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [age14, setAge14] = useState(false);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(askGoogleConsent ? "구글로 가입하려면 아래 안내를 확인하고 동의해주세요." : "");
  const [notice, setNotice] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [saved, setSaved] = useState(false);
  const [resent, setResent] = useState("");
  const agreedAll = age14 && terms && privacy;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password !== confirm) { setError("비밀번호 확인이 일치하지 않아요."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), email: email.trim(), password, ...(needsCode ? { inviteCode: code.trim() } : {}), agreeTerms: terms, agreePrivacy: privacy, age14 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setDone(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "가입하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  function openGoogle() {
    if (!agreedAll) { setError("구글로 가입할 때도 만 14세 이상 확인과 약관·개인정보 동의가 필요해요."); return; }
    if (needsCode && !code.trim()) { setError("초대 코드를 먼저 입력해주세요."); return; }
    setError(""); setNotice(true);
  }
  function continueGoogle() {
    const params = new URLSearchParams({ intent: "signup", agree: "1" });
    if (name.trim()) params.set("name", name.trim());
    if (needsCode) params.set("invite", code.trim());
    window.location.assign(`/api/auth/google/start?${params}`);
  }
  async function resend() {
    if (!done) return;
    const response = await fetch("/api/auth/resend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: done.email }) });
    setResent(response.ok ? "인증 메일을 다시 보냈어요." : (await response.json()).error);
  }

  if (done) return <div className="join-issued">
    <p><strong>{done.name}</strong>님, 가입 신청이 됐어요. 두 가지만 하면 끝나요.</p>
    <p><b>1. 복구 코드 저장하기</b></p>
    <RecoveryCode code={done.recoveryCode} onSaved={setSaved} />
    <p><b>2. 메일함에서 인증하기</b></p>
    <p className={saved ? "" : "muted"}><b>{done.email}</b>로 인증 메일을 보냈어요. 메일의 버튼을 누르면 로그인할 수 있어요. 메일이 안 보이면 스팸함도 확인해주세요.</p>
    <div className="delete-actions"><button type="button" disabled={!saved} onClick={() => void resend()}>인증 메일 다시 받기</button><a className={`join-continue${saved ? "" : " disabled"}`} aria-disabled={!saved} href={saved ? "/login" : undefined}>로그인 화면으로</a></div>
    {resent && <p className="muted" role="status">{resent}</p>}
  </div>;

  return <>
    <form onSubmit={submit} className="join-form">
      <p>Claude와 함께 아이디어를 하드웨어로 만들어요.</p>
      {error && <p className="login-error" role="alert">{error}</p>}
      <label htmlFor="join-name">별명 <small>(다른 사람에게 보이지 않아요. 실명 대신 별명을 권해요)</small></label>
      <input id="join-name" value={name} maxLength={30} required onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
      <label htmlFor="join-email">이메일</label>
      <input id="join-email" type="email" value={email} maxLength={254} required onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <label htmlFor="join-password">비밀번호 <small>(10자 이상)</small></label>
      <input id="join-password" type="password" value={password} minLength={10} maxLength={200} required onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      <label htmlFor="join-confirm">비밀번호 확인</label>
      <input id="join-confirm" type="password" value={confirm} maxLength={200} required onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      {needsCode && <><label htmlFor="join-code">초대 코드</label><input id="join-code" value={code} maxLength={40} required onChange={(e) => setCode(e.target.value)} autoComplete="off" /></>}
      <label className="remember-session"><input type="checkbox" checked={age14} onChange={(e) => setAge14(e.target.checked)} />만 14세 이상이에요</label>
      <label className="remember-session"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /><span><a href="/terms" target="_blank">이용약관</a>에 동의해요 (필수)</span></label>
      <label className="remember-session"><input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} /><span><a href="/privacy" target="_blank">개인정보 수집·이용</a>에 동의해요 (필수)</span></label>
      <p className="muted"><small>이메일로 가입하면 내 기록이 내 비밀번호로 잠겨서 운영자도 볼 수 없어요.</small></p>
      <button type="submit" disabled={busy || !name.trim() || !email.trim() || password.length < 10 || !confirm || !agreedAll || (needsCode && !code.trim())}>{busy ? "가입하는 중…" : "이메일로 가입하기"}</button>
      {google && <><div className="or-divider"><span>또는</span></div><button type="button" className="google-button" onClick={openGoogle}>구글로 가입하기</button></>}
    </form>
    {notice && <GoogleNotice onClose={() => setNotice(false)} onEmail={() => { setNotice(false); document.getElementById("join-email")?.focus(); }} onContinue={continueGoogle} />}
  </>;
}
