"use client";
import { useEffect, useState } from "react";

// Opens a dashboard link of the form /u#<token>. The token is read in the
// browser and posted once, so it never appears in a URL the server logs.
export default function LinkSignIn() {
  const [error, setError] = useState("");
  useEffect(() => {
    const token = window.location.hash.slice(1);
    const search = new URLSearchParams(window.location.search);
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) { setError("링크에 열쇠 부분(# 뒤)이 없어요. 받은 링크 전체를 다시 열어주세요."); return; }
    fetch("/api/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, p: search.get("p") ?? undefined, open: search.get("open") ?? undefined }) })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        window.location.replace(body.next);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "링크를 열지 못했어요."));
  }, []);
  return <main className="login-shell"><section className="login-card">
    <img src="/characters/thinking_1.png" alt="" width="85" height="85" style={{ objectFit: "contain" }} />
    <h1>달그락 대장간</h1>
    {error ? <><p className="login-error" role="alert">{error}</p><p className="login-links"><a href="/login">로그인 화면으로</a></p></> : <p>내 대장간을 여는 중…</p>}
  </section></main>;
}
