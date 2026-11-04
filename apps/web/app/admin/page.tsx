"use client";
import { FormEvent, useEffect, useState } from "react";

type User = { id: string; name: string; webAi: boolean; createdAt: string; revokedAt: string | null; source?: "operator" | "signup" };
type Invite = { id: string; label: string; maxUses: number; used: number; expiresAt: string | null; createdAt: string; disabledAt: string | null };
type InviteState = { mode: "closed" | "invite" | "open"; joinUrl: string; invites: Invite[] };
type Issued = { name: string; connectorUrl: string; dashboardUrl: string };

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return <div><small>{label}</small><div className="copy-row"><code>{value}</code><button type="button" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? "복사됨" : "복사"}</button></div></div>;
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [webAi, setWebAi] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => fetch("/api/admin/users", { cache: "no-store" }).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); setUsers(b.users); }).catch((e) => setError(e instanceof Error ? e.message : "불러오지 못했습니다."));
  const [inviteState, setInviteState] = useState<InviteState | null>(null);
  const [inviteLabel, setInviteLabel] = useState("");
  const [inviteUses, setInviteUses] = useState(50);
  const [inviteDays, setInviteDays] = useState(14);
  const [issuedCode, setIssuedCode] = useState<{ label: string; code: string } | null>(null);
  const loadInvites = () => fetch("/api/admin/invites", { cache: "no-store" }).then(async (r) => { const b = await r.json(); if (r.ok) setInviteState(b); }).catch(() => {});
  useEffect(() => { void load(); void loadInvites(); }, []);
  async function createCode(e: FormEvent) {
    e.preventDefault(); if (!inviteLabel.trim() || busy) return; setBusy(true); setError("");
    try {
      const r = await fetch("/api/admin/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: inviteLabel.trim(), maxUses: inviteUses, days: inviteDays || null }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      setIssuedCode({ label: b.invite.label, code: b.code }); setInviteLabel(""); await loadInvites();
    } catch (err) { setError(err instanceof Error ? err.message : "만들지 못했습니다."); } finally { setBusy(false); }
  }
  async function stopCode(id: string) {
    const r = await fetch(`/api/admin/invites/${id}`, { method: "DELETE" }); const b = await r.json();
    if (!r.ok) setError(b.error); else await loadInvites();
  }
  async function create(e: FormEvent) {
    e.preventDefault(); if (!name.trim() || busy) return; setBusy(true); setError("");
    try {
      const r = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), webAi }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      setIssued({ name: b.user.name, connectorUrl: b.connectorUrl, dashboardUrl: b.dashboardUrl }); setName(""); setWebAi(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "만들지 못했습니다."); } finally { setBusy(false); }
  }
  async function patch(id: string, body: Record<string, unknown>) {
    setError("");
    const r = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const b = await r.json(); if (!r.ok) setError(b.error); else await load();
  }
  async function erase(user: User) {
    if (!confirm(`${user.name}님의 링크와 모든 프로젝트 기록을 삭제할까요? 되돌릴 수 없어요.`)) return;
    setError("");
    const r = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    const b = await r.json();
    if (!r.ok) setError(b.error); else await load();
  }
  return <main className="admin-shell">
    <header><h1>참여자 관리</h1><a href="/">← 대장간으로</a></header>
    {error && <div role="alert" className="error-banner">{error}</div>}
    <section className="admin-card">
      <h2>참여자 초대</h2>
      <form className="admin-form" onSubmit={create}>
        <input type="text" aria-label="참여자 이름" placeholder="이름 (예: 주최측 김OO)" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <label><input type="checkbox" checked={webAi} onChange={(e) => setWebAi(e.target.checked)} />웹 안의 AI 대화도 허용 <small>(내 API 비용)</small></label>
        <button className="primary" disabled={busy || !name.trim()}>링크 만들기</button>
      </form>
      {issued && <div className="issued">
        <p><strong>{issued.name}</strong>님 링크예요. 이 화면을 벗어나면 다시 볼 수 없으니 지금 전달해주세요.</p>
        <CopyRow label="① Claude 커넥터 주소 — claude.ai 설정 → 커넥터 → 커스텀 커넥터 추가" value={issued.connectorUrl} />
        <CopyRow label="② 내 대시보드 링크 — 휴대폰·PC에서 열면 바로 로그인돼요" value={issued.dashboardUrl} />
      </div>}
    </section>
    <section className="admin-card">
      <h2>가입 코드</h2>
      <p className="muted">가입 방식: <b>{inviteState?.mode === "open" ? "누구나 가입" : inviteState?.mode === "invite" ? "초대 코드로 가입" : "닫힘 (위의 링크 만들기만 가능)"}</b> · Railway 변수 <code>SIGNUP_MODE</code>(closed / invite / open)로 바꿔요.{inviteState && inviteState.mode !== "closed" && <> 가입 주소: <code>{inviteState.joinUrl}</code></>}</p>
      <form className="admin-form" onSubmit={createCode}>
        <input type="text" aria-label="코드 이름" placeholder="코드 이름 (예: 11월 강연)" value={inviteLabel} maxLength={60} onChange={(e) => setInviteLabel(e.target.value)} />
        <label>사용 횟수 <input type="number" min={1} max={1000} value={inviteUses} onChange={(e) => setInviteUses(Number(e.target.value))} /></label>
        <label>기간(일) <input type="number" min={1} max={365} value={inviteDays} onChange={(e) => setInviteDays(Number(e.target.value))} /></label>
        <button className="primary" disabled={busy || !inviteLabel.trim()}>코드 만들기</button>
      </form>
      {issuedCode && <div className="issued"><p><strong>{issuedCode.label}</strong> 코드예요. 다시 볼 수 없으니 지금 전달해주세요.</p><CopyRow label="초대 코드" value={issuedCode.code} /></div>}
      {!!inviteState?.invites.length && <table className="user-table"><thead><tr><th>이름</th><th>사용</th><th>만료</th><th></th></tr></thead><tbody>
        {inviteState.invites.map((i) => <tr key={i.id}><td className={i.disabledAt ? "revoked" : ""}>{i.label}</td><td>{i.used}/{i.maxUses}</td><td>{i.expiresAt ? new Date(i.expiresAt).toLocaleDateString("ko-KR") : "없음"}</td><td>{i.disabledAt ? <small>중지됨</small> : <button onClick={() => void stopCode(i.id)}>중지</button>}</td></tr>)}
      </tbody></table>}
    </section>
    <section className="admin-card">
      <h2>참여자에게 보낼 안내</h2>
      <ol className="admin-steps">
        <li>claude.ai → 설정 → 커넥터 → <b>커스텀 커넥터 추가</b>에서 ① 주소를 붙여넣고 이름을 “달그락 대장간”으로 저장해요.</li>
        <li>새 대화에서 + 버튼 → 커넥터 목록에서 달그락 대장간을 켜요.</li>
        <li>“달그락 대장간으로 ○○ 만들고 싶어. 프로젝트로 시작해줘”라고 말해요.</li>
        <li>② 링크로 대시보드를 열어두면 Claude가 정리한 설계·회로·할 일이 자동으로 쌓여요. 회로와 3D 승인은 대시보드에서 직접 눌러요.</li>
      </ol>
    </section>
    <section className="admin-card">
      <h2>참여자 {users.filter((u) => !u.revokedAt).length}명</h2>
      <p className="muted">참여자의 프로젝트는 각자의 링크로만 열리게 암호화돼 있어 여기서도, 서버에서도 볼 수 없어요. 링크를 잃어버린 참여자의 기록은 복구할 수 없고, 삭제만 할 수 있어요.</p>
      <table className="user-table"><thead><tr><th>이름</th><th>웹 AI</th><th>만든 날</th><th></th></tr></thead><tbody>
        {users.map((u) => <tr key={u.id}>
          <td className={u.revokedAt ? "revoked" : ""}>{u.name}{u.source === "signup" && <small> · 직접 가입</small>}</td>
          <td><label><input type="checkbox" checked={u.webAi} disabled={!!u.revokedAt} onChange={(e) => void patch(u.id, { webAi: e.target.checked })} /> 허용</label></td>
          <td>{new Date(u.createdAt).toLocaleDateString("ko-KR")}</td>
          <td>{u.revokedAt ? <small>중지됨</small> : <button onClick={() => { if (confirm(`${u.name}님의 커넥터와 대시보드 링크를 중지할까요? 되돌릴 수 없어요.`)) void patch(u.id, { revoke: true }); }}>링크 중지</button>} <button onClick={() => void erase(u)}>기록 삭제</button></td>
        </tr>)}
        {!users.length && <tr><td colSpan={4} className="muted">아직 초대한 참여자가 없어요.</td></tr>}
      </tbody></table>
    </section>
  </main>;
}
