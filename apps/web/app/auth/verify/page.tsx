"use client";
import { useEffect, useState } from "react";

// Opens /auth/verify#<token> from the sign-up email. The token stays in the
// fragment, so it never reaches the server's access log.
export default function VerifyPage() {
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (r) => { const b = await r.json(); setState(r.ok ? { ok: true, text: `${b.email} 인증이 끝났어요. 이제 로그인할 수 있어요.` } : { ok: false, text: b.error }); })
      .catch(() => setState({ ok: false, text: "인증하지 못했어요. 잠시 후 다시 시도해주세요." }));
  }, []);
  return <main className="login-shell"><section className="login-card">
    <img src="/characters/idle.png" alt="" width="85" height="85" style={{ objectFit: "contain" }} />
    <h1>이메일 인증</h1>
    {!state ? <p>확인하는 중…</p> : <p className={state.ok ? "" : "login-error"} role="status">{state.text}</p>}
    <p className="login-links"><a href="/login">로그인하기</a></p>
  </section></main>;
}
