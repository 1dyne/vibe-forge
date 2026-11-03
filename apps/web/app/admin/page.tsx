"use client";
import { FormEvent, useEffect, useState } from "react";

type User = { id: string; name: string; webAi: boolean; createdAt: string; revokedAt: string | null };
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
  useEffect(() => { void load(); }, []);
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
      <table className="user-table"><thead><tr><th>이름</th><th>웹 AI</th><th>만든 날</th><th></th></tr></thead><tbody>
        {users.map((u) => <tr key={u.id}>
          <td className={u.revokedAt ? "revoked" : ""}>{u.name}</td>
          <td><label><input type="checkbox" checked={u.webAi} disabled={!!u.revokedAt} onChange={(e) => void patch(u.id, { webAi: e.target.checked })} /> 허용</label></td>
          <td>{new Date(u.createdAt).toLocaleDateString("ko-KR")}</td>
          <td>{u.revokedAt ? <small>중지됨</small> : <button onClick={() => { if (confirm(`${u.name}님의 커넥터와 대시보드 링크를 중지할까요? 되돌릴 수 없어요.`)) void patch(u.id, { revoke: true }); }}>링크 중지</button>} <button onClick={() => void erase(u)}>기록 삭제</button></td>
        </tr>)}
        {!users.length && <tr><td colSpan={4} className="muted">아직 초대한 참여자가 없어요.</td></tr>}
      </tbody></table>
    </section>
  </main>;
}
