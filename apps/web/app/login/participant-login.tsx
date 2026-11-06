"use client";
import { FormEvent, useState } from "react";

export default function ParticipantLogin({ next, google, unlock, canJoin }: { next: string; google: boolean; unlock: boolean; canJoin: boolean }) {
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unverified, setUnverified] = useState(false);
  const [info, setInfo] = useState("");

  async function post(url: string, body: unknown) {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error), { code: data.code });
    return data;
  }
  async function login(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setInfo(""); setUnverified(false);
    try {
      const data = await post(unlock ? "/api/auth/unlock" : "/api/auth/login", unlock ? { password, next } : { email: email.trim(), password, remember, next });
      window.location.assign(data.next ?? "/");
    } catch (err) {
      const e = err as Error & { code?: string };
      setError(e.message); setUnverified(e.code === "unverified"); setBusy(false);
    }
  }
  async function forgot(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setInfo("");
    try {
      await post("/api/auth/forgot", { email: email.trim() });
      setInfo("가입된 이메일이면 비밀번호를 다시 만드는 메일을 보냈어요. 메일함(스팸함 포함)을 확인해주세요.");
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function resend() {
    try { await post("/api/auth/resend", { email: email.trim() }); setInfo("인증 메일을 다시 보냈어요."); setError(""); setUnverified(false); }
    catch (err) { setError((err as Error).message); }
  }

  if (unlock) return <form className="join-form" onSubmit={login}>
    <p>구글로 확인됐어요. 이 계정은 기록이 비밀번호로 잠겨 있어서, 내 비밀번호를 한 번 더 입력해주세요.</p>
    {error && <p className="login-error" role="alert">{error}</p>}
    <label htmlFor="unlock-password">비밀번호</label>
    <input id="unlock-password" type="password" value={password} autoFocus required onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
    <button disabled={busy || !password}>{busy ? "여는 중…" : "내 대장간 열기"}</button>
  </form>;

  if (mode === "forgot") return <form className="join-form" onSubmit={forgot}>
    <p>가입한 이메일을 넣으면 비밀번호를 다시 만드는 링크를 보내드려요. 내 기록을 그대로 열려면 가입할 때 받은 <b>복구 코드</b>가 필요해요.</p>
    {error && <p className="login-error" role="alert">{error}</p>}
    {info && <p className="notice" role="status">{info}</p>}
    <label htmlFor="forgot-email">이메일</label>
    <input id="forgot-email" type="email" value={email} required onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
    <button disabled={busy || !email.trim()}>{busy ? "보내는 중…" : "메일 받기"}</button>
    <button type="button" className="link-button" onClick={() => { setMode("login"); setInfo(""); setError(""); }}>← 로그인으로</button>
  </form>;

  return <form className="join-form" onSubmit={login}>
    {error && <p className="login-error" role="alert">{error}</p>}
    {unverified && <button type="button" onClick={() => void resend()}>인증 메일 다시 받기</button>}
    {info && <p className="notice" role="status">{info}</p>}
    <label htmlFor="login-email">이메일</label>
    <input id="login-email" type="email" value={email} required onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
    <label htmlFor="login-password">비밀번호</label>
    <input id="login-password" type="password" value={password} required onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
    <label className="remember-session"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />로그인 유지 <small>30일 · 내 기기에서만</small></label>
    <button disabled={busy || !email.trim() || !password}>{busy ? "로그인하는 중…" : "로그인"}</button>
    <button type="button" className="link-button" onClick={() => { setMode("forgot"); setError(""); }}>비밀번호를 잊었어요</button>
    {google && <><div className="or-divider"><span>또는</span></div><a className="google-button" href={`/api/auth/google/start?intent=login&next=${encodeURIComponent(next)}`}>구글로 로그인</a></>}
    {canJoin && <p className="login-links">처음이라면 <a href="/join">가입하기</a></p>}
    <p className="muted">개인 링크로 쓰던 계정이면, 처음 받은 개인 링크를 다시 열면 로그인돼요. 내 계정에서 이메일과 비밀번호를 만들어 두면 다음부터 여기서 로그인할 수 있어요.</p>
  </form>;
}
