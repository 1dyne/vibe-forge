"use client";
import { useEffect, useState } from "react";

type Me = { kind: "user"; name: string; connectorUrl: string; dashboardUrl: string; createdAt: string; consent: { termsVersion: string; privacyVersion: string; agreedAt: string } | null };

function Copy({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="copy-button" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>{done ? "복사됨" : "복사"}</button>;
}

// A participant's own account: their links, a new link if one leaked, a copy
// of their records, and leaving with everything erased.
export default function AccountPanel({ onClose }: { onClose: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  useEffect(() => { fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((b) => b.kind === "user" ? setMe(b) : setError("운영자 계정에는 개인 링크가 없어요.")).catch(() => setError("계정 정보를 불러오지 못했어요.")); }, []);

  async function rotate() {
    if (!confirm("새 링크를 만들까요? 예전 커넥터 주소와 대시보드 링크는 바로 막히고, claude.ai 커넥터 설정의 주소도 새로 바꿔야 해요.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "rotate_link" }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      setMe((current) => current && { ...current, connectorUrl: b.connectorUrl, dashboardUrl: b.dashboardUrl });
      setNotice("새 링크를 만들었어요. 지금 저장하고, claude.ai → 설정 → 커넥터에서 달그락 대장간 주소를 새 커넥터 주소로 바꿔주세요.");
    } catch (err) { setError(err instanceof Error ? err.message : "링크를 바꾸지 못했어요."); } finally { setBusy(false); }
  }
  async function leave() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/me", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: confirmText }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      window.location.replace("/login");
    } catch (err) { setError(err instanceof Error ? err.message : "탈퇴하지 못했어요."); setBusy(false); }
  }

  return <div className="modal-backdrop" onClick={onClose}>
    <section className="profile-modal connect-modal" role="dialog" aria-modal="true" aria-label="내 계정" onClick={(e) => e.stopPropagation()}>
      <header><h2>내 계정{me ? ` · ${me.name}` : ""}</h2><button aria-label="닫기" onClick={onClose}>×</button></header>
      {error && <p className="login-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {me && <>
        <p>아래 두 주소가 내 열쇠예요. 내 기록은 이 열쇠로만 열리게 암호화돼 있어서 운영자도 볼 수 없고, <b>잃어버리면 되찾을 수 없어요.</b></p>
        <h3>내 링크</h3>
        <small>Claude 커넥터 주소</small><div className="copy-row"><code>{me.connectorUrl}</code><Copy value={me.connectorUrl} /></div>
        <small>대시보드 링크</small><div className="copy-row"><code>{me.dashboardUrl}</code><Copy value={me.dashboardUrl} /></div>
        <h3>링크가 노출된 것 같아요</h3>
        <p>새 링크를 만들면 예전 링크는 바로 막혀요. 기록은 새 열쇠로 다시 암호화돼 그대로 남아요.</p>
        <button disabled={busy} onClick={() => void rotate()}>새 링크 만들기</button>
        <h3>내 기록 내려받기</h3>
        <p>모든 프로젝트와 제작 프로필을 JSON 파일 하나로 받아요.</p>
        <a className="button-link" href="/api/me/export" download>내 기록 내려받기 ↓</a>
        <h3>탈퇴</h3>
        <p>계정, 모든 프로젝트, 제작 프로필이 바로 지워지고 되돌릴 수 없어요. Claude 대화는 내 Claude 계정에 그대로 남아요.</p>
        <div className="copy-row"><input aria-label="확인 문구" placeholder="‘탈퇴’라고 입력" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /><button className="danger" disabled={busy || confirmText !== "탈퇴"} onClick={() => void leave()}>탈퇴하고 모두 삭제</button></div>
        <p className="muted"><small>가입 {new Date(me.createdAt).toLocaleDateString("ko-KR")}{me.consent ? ` · 약관 ${me.consent.termsVersion} · 개인정보 처리방침 ${me.consent.privacyVersion} 동의` : ""} · <a href="/privacy" target="_blank">개인정보 처리방침</a></small></p>
      </>}
    </section>
  </div>;
}
