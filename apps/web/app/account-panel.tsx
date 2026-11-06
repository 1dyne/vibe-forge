"use client";
import { FormEvent, useEffect, useState } from "react";
import RecoveryCode from "./recovery-code";

type Connection = { id: string; clientName: string; createdAt: string; lastUsedAt: string };
type Me = {
  kind: "user"; name: string; auth: "password" | "google" | "link"; email: string | null; emailVerified: boolean;
  lock: "password" | "server" | "link"; passwordSet: boolean; connectorUrl: string; legacyConnectorUrl?: string; dashboardUrl?: string;
  createdAt: string; consent: { termsVersion: string; privacyVersion: string; agreedAt: string } | null; googleConsent: { version: string; agreedAt: string } | null;
};

function Copy({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="copy-button" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>{done ? "복사됨" : "복사"}</button>;
}

const LOCK_TEXT: Record<Me["lock"], string> = {
  password: "내 기록은 내 비밀번호로 잠겨 있어요. 운영자를 포함해 누구도 열어볼 수 없어요.",
  server: "구글로 가입해서 기록을 여는 열쇠를 서버가 보관하고 있어요. 운영자는 정책에 따라 열람하지 않지만, 기술적으로 열 수 없는 구조는 아니에요. 아래에서 비밀번호를 설정하면 이메일 가입과 같은 잠금으로 바꿀 수 있어요.",
  link: "예전 방식(개인 링크) 계정이에요. 링크를 잃으면 기록을 되찾을 수 없으니, 아래에서 이메일·비밀번호로 바꾸는 걸 권해요."
};

async function post(body: unknown) {
  const r = await fetch("/api/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const b = await r.json(); if (!r.ok) throw new Error(b.error);
  return b;
}

// A participant's own account: how they sign in, how their records are
// locked, connected apps, a copy of their records, and leaving.
export default function AccountPanel({ onClose }: { onClose: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [resetText, setResetText] = useState("");
  const [newName, setNewName] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [recovery, setRecovery] = useState("");
  const [form, setForm] = useState({ email: "", password: "", confirm: "", current: "", next: "", recoveryPassword: "" });
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value })) });

  const load = () => fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((b) => b.kind === "user" ? setMe(b) : setError("운영자 계정에는 개인 설정이 없어요.")).catch(() => setError("계정 정보를 불러오지 못했어요."));
  const loadConnections = () => fetch("/api/me/connections", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((b) => b && setConnections(b.connections)).catch(() => {});
  useEffect(() => { void load(); void loadConnections(); }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : "처리하지 못했어요."); } finally { setBusy(false); }
  }
  const setPassword = (event: FormEvent) => { event.preventDefault(); if (form.password !== form.confirm) { setError("비밀번호 확인이 일치하지 않아요."); return; } void run(async () => {
    const b = await post({ action: "set_password", password: form.password, ...(me?.email ? {} : { email: form.email.trim() }) });
    setRecovery(b.recoveryCode);
    setNotice(b.verificationSent ? `비밀번호를 설정했어요. ${form.email.trim()}로 인증 메일을 보냈어요. 다음 로그인부터는 이메일과 비밀번호로 들어와요.` : "비밀번호를 설정했어요. 이제 내 기록은 내 비밀번호로 잠겨요. 다음에 구글로 로그인하면 비밀번호를 한 번 더 물어봐요.");
    setForm((f) => ({ ...f, password: "", confirm: "" })); await load(); await loadConnections();
  }); };
  const changePassword = (event: FormEvent) => { event.preventDefault(); if (form.next !== form.confirm) { setError("새 비밀번호 확인이 일치하지 않아요."); return; } void run(async () => {
    await post({ action: "change_password", current: form.current, next: form.next });
    setNotice("비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해야 해요."); setForm((f) => ({ ...f, current: "", next: "", confirm: "" }));
  }); };
  const newRecovery = (event: FormEvent) => { event.preventDefault(); void run(async () => {
    const b = await post({ action: "new_recovery", password: form.recoveryPassword });
    setRecovery(b.recoveryCode); setNotice("복구 코드를 새로 만들었어요. 예전 코드는 이제 쓸 수 없어요."); setForm((f) => ({ ...f, recoveryPassword: "" }));
  }); };
  const rotate = () => { if (!confirm("새 링크를 만들까요? 예전 링크와 연결된 앱이 바로 끊겨요.")) return; void run(async () => {
    const b = await post({ action: "rotate_link" });
    setMe((m) => m && { ...m, legacyConnectorUrl: b.legacyConnectorUrl, dashboardUrl: b.dashboardUrl }); setConnections([]);
    setNotice("새 링크를 만들었어요. 지금 저장하고, 커넥터는 다시 ‘연결’해 허용해주세요.");
  }); };
  const disconnect = (id: string) => void run(async () => {
    const r = await fetch("/api/me/connections", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    if (!r.ok) throw new Error((await r.json()).error); await loadConnections();
  });
  const rename = (event: FormEvent) => { event.preventDefault(); void run(async () => {
    const b = await post({ action: "rename", name: newName.trim() });
    setMe((m) => m && { ...m, name: b.name }); setNewName(""); setNotice("별명을 바꿨어요.");
  }); };
  const resetRecords = () => void run(async () => {
    const b = await post({ action: "reset_records", confirm: resetText });
    setResetText("");
    setNotice(`프로젝트 ${b.removedProjects}개와 제작 프로필을 지웠어요. 화면을 새로고침하면 새로 시작할 수 있어요.`);
  });
  const leave = () => void run(async () => {
    const r = await fetch("/api/me", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: confirmText }) });
    if (!r.ok) throw new Error((await r.json()).error); window.location.replace("/login");
  });

  return <div className="modal-backdrop" onClick={onClose}>
    <section className="profile-modal connect-modal account-modal" role="dialog" aria-modal="true" aria-label="내 계정" onClick={(e) => e.stopPropagation()}>
      <header><h2>내 계정{me ? ` · ${me.name}` : ""}</h2><button aria-label="닫기" onClick={onClose}>×</button></header>
      {error && <p className="login-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {recovery && <RecoveryCode code={recovery} onSaved={(saved) => { if (saved) setTimeout(() => setRecovery(""), 600); }} />}
      {me && <>
        <h3>로그인과 기록 잠금</h3>
        <p>{me.email ? <><b>{me.email}</b> · {me.auth === "google" ? "구글 로그인" : "이메일 로그인"}{me.email && !me.emailVerified && " · 인증 대기"}</> : "개인 링크로 로그인"}</p>
        <p className={me.lock === "password" ? "lock-good" : "lock-warn"}>{LOCK_TEXT[me.lock]}</p>

        {!me.passwordSet && <form className="account-form" onSubmit={setPassword}>
          <h3>{me.lock === "server" ? "비밀번호 설정해서 잠금 강화하기" : "이메일·비밀번호로 바꾸기"}</h3>
          {!me.email && <><label htmlFor="acc-email">이메일</label><input id="acc-email" type="email" required autoComplete="email" {...field("email")} /></>}
          <label htmlFor="acc-password">비밀번호 <small>(10자 이상)</small></label><input id="acc-password" type="password" minLength={10} required autoComplete="new-password" {...field("password")} />
          <label htmlFor="acc-confirm">비밀번호 확인</label><input id="acc-confirm" type="password" required autoComplete="new-password" {...field("confirm")} />
          <p className="muted"><small>{me.lock === "server" ? "설정하면 서버가 보관하던 열쇠를 지우고, 내 비밀번호와 복구 코드로만 기록이 열려요. 구글 로그인은 계속 쓸 수 있고, 로그인할 때 비밀번호를 한 번 더 물어봐요." : "바꾸면 개인 링크는 더 이상 쓸 수 없고, 이메일과 비밀번호로 로그인해요. 기록은 그대로 남아요."}</small></p>
          <button disabled={busy}>설정하기</button>
        </form>}

        {me.passwordSet && <>
          <form className="account-form" onSubmit={changePassword}>
            <h3>비밀번호 바꾸기</h3>
            <label htmlFor="acc-current">지금 비밀번호</label><input id="acc-current" type="password" required autoComplete="current-password" {...field("current")} />
            <label htmlFor="acc-next">새 비밀번호 <small>(10자 이상)</small></label><input id="acc-next" type="password" minLength={10} required autoComplete="new-password" {...field("next")} />
            <label htmlFor="acc-next-confirm">새 비밀번호 확인</label><input id="acc-next-confirm" type="password" required autoComplete="new-password" {...field("confirm")} />
            <button disabled={busy}>바꾸기</button>
          </form>
          <form className="account-form" onSubmit={newRecovery}>
            <h3>복구 코드 새로 만들기</h3>
            <p className="muted"><small>복구 코드를 잃어버렸거나 노출됐다면 새로 만들어요. 예전 코드는 바로 못 쓰게 돼요.</small></p>
            <label htmlFor="acc-recovery-password">비밀번호</label><input id="acc-recovery-password" type="password" required autoComplete="current-password" {...field("recoveryPassword")} />
            <button disabled={busy}>새 복구 코드 받기</button>
          </form>
        </>}

        <h3>Claude 커넥터 주소</h3>
        <p className="muted"><small>claude.ai → 설정 → 커넥터 → 커스텀 커넥터 추가 → 연결 → 허용. 모두에게 같은 주소라 보여도 괜찮아요.</small></p>
        <div className="copy-row"><code>{me.connectorUrl}</code><Copy value={me.connectorUrl} /></div>

        <h3>연결된 앱</h3>
        {connections.length ? <ul className="connection-list">{connections.map((c) => <li key={c.id}><span><b>{c.clientName}</b> <small>· 연결 {new Date(c.createdAt).toLocaleDateString("ko-KR")} · 마지막 사용 {new Date(c.lastUsedAt).toLocaleString("ko-KR")}</small></span><button disabled={busy} onClick={() => disconnect(c.id)}>연결 끊기</button></li>)}</ul> : <p className="muted">아직 연결한 앱이 없어요.</p>}

        {me.dashboardUrl && <details>
          <summary>예전 개인 링크</summary>
          <small>대시보드 링크 (비밀)</small><div className="copy-row"><code>{me.dashboardUrl}</code><Copy value={me.dashboardUrl} /></div>
          {me.legacyConnectorUrl && <><small>로그인을 못 쓰는 도구용 커넥터 주소 (비밀 · 접속 기록에 남을 수 있음)</small><div className="copy-row"><code>{me.legacyConnectorUrl}</code><Copy value={me.legacyConnectorUrl} /></div></>}
          <button disabled={busy} onClick={rotate}>링크가 노출된 것 같아요 · 새 링크 만들기</button>
        </details>}

        <form className="account-form" onSubmit={rename}>
          <h3>별명 바꾸기</h3>
          <div className="copy-row"><input aria-label="새 별명" placeholder={me.name} maxLength={30} value={newName} onChange={(e) => setNewName(e.target.value)} /><button disabled={busy || !newName.trim()}>바꾸기</button></div>
        </form>

        <h3>기록 모두 지우고 새로 시작</h3>
        <p>모든 프로젝트(설계·회로·파일·대화 요약)와 제작 프로필이 지워지고 되돌릴 수 없어요. 계정, 로그인, Claude 커넥터 연결은 그대로 남아요. Claude 앱에 남은 대화와 Claude 프로젝트 지침은 Claude에서 직접 지워주세요.</p>
        <div className="copy-row"><input aria-label="초기화 확인 문구" placeholder="‘초기화’라고 입력" value={resetText} onChange={(e) => setResetText(e.target.value)} /><button className="danger" disabled={busy || resetText !== "초기화"} onClick={resetRecords}>모두 지우기</button></div>

        <h3>내 기록 내려받기</h3>
        <p>모든 프로젝트와 제작 프로필을 JSON 파일 하나로 받아요.</p>
        <a className="button-link" href="/api/me/export" download>내 기록 내려받기 ↓</a>
        <h3>탈퇴</h3>
        <p>계정, 모든 프로젝트, 제작 프로필이 바로 지워지고 되돌릴 수 없어요. Claude 대화는 내 Claude 계정에 그대로 남아요.</p>
        <div className="copy-row"><input aria-label="확인 문구" placeholder="‘탈퇴’라고 입력" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /><button className="danger" disabled={busy || confirmText !== "탈퇴"} onClick={leave}>탈퇴하고 모두 삭제</button></div>
        <p className="muted"><small>가입 {new Date(me.createdAt).toLocaleDateString("ko-KR")}{me.consent ? ` · 약관 ${me.consent.termsVersion} · 개인정보 처리방침 ${me.consent.privacyVersion} 동의` : ""}{me.googleConsent ? ` · 구글 가입 안내 ${me.googleConsent.version} 동의` : ""} · <a href="/privacy" target="_blank">개인정보 처리방침</a></small></p>
      </>}
    </section>
  </div>;
}
