"use client";
import { useState } from "react";

type AuthorizeRequest = { client_id: string; redirect_uri: string; code_challenge: string; state: string };

// Pulls the token out of a pasted dashboard link (/u#token or /u/token) or a bare token.
function tokenFrom(text: string): string {
  const value = text.trim();
  const match = value.match(/#([A-Za-z0-9_-]{20,100})$/) ?? value.match(/\/u\/([A-Za-z0-9_-]{20,100})/) ?? value.match(/^([A-Za-z0-9_-]{20,100})$/);
  return match?.[1] ?? "";
}

export default function Consent({ signedInAs, clientName, redirectHost, request }: { signedInAs: string | null; clientName: string; redirectHost: string; request: AuthorizeRequest }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    const token = tokenFrom(link);
    if (!token) { setError("대시보드 링크 전체를 붙여넣어주세요. (…/u#로 시작하는 주소)"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      window.location.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "로그인하지 못했어요."); setBusy(false); }
  }
  async function decide(decision: "allow" | "deny") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/oauth/authorize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...request, decision }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      window.location.assign(body.redirect);
    } catch (err) { setError(err instanceof Error ? err.message : "처리하지 못했어요."); setBusy(false); }
  }

  if (!signedInAs) return <div className="join-form">
    <p>연결하려면 먼저 내 대장간에 로그인해주세요. 가입할 때 받은 <b>대시보드 링크</b>를 붙여넣으면 돼요.</p>
    <label htmlFor="link">내 대시보드 링크</label>
    <input id="link" value={link} autoComplete="off" onChange={(e) => setLink(e.target.value)} placeholder="https://…/u#…" />
    {error && <p className="login-error" role="alert">{error}</p>}
    <button disabled={busy || !link.trim()} onClick={() => void signIn()}>로그인</button>
    <p className="login-links">아직 계정이 없나요? <a href="/join" target="_blank">가입하기</a></p>
  </div>;

  return <div className="join-form">
    <p><b>{signedInAs}</b>님의 달그락 대장간에 아래 앱을 연결할까요?</p>
    <div className="consent-box">
      <p><b>{clientName}</b> <small>(앱이 스스로 밝힌 이름)</small></p>
      <p>허용하면 <b>{redirectHost}</b>(으)로 돌아가요. 이 주소가 claude.ai나 내 컴퓨터(localhost)가 아니면 허용하지 마세요.</p>
      <ul><li>내 프로젝트를 읽고, 설계·회로·할 일을 기록해요.</li><li>회로·3D 승인과 삭제는 할 수 없어요. 그건 여기 대시보드에서 내가 해요.</li><li>내 계정 → 연결된 앱에서 언제든 끊을 수 있어요.</li></ul>
    </div>
    {error && <p className="login-error" role="alert">{error}</p>}
    <div className="delete-actions"><button disabled={busy} onClick={() => void decide("deny")}>거부</button><button className="primary" disabled={busy} onClick={() => void decide("allow")}>허용</button></div>
  </div>;
}
