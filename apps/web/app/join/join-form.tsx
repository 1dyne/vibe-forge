"use client";
import { FormEvent, useState } from "react";

type Issued = { name: string; connectorUrl: string; dashboardUrl: string };

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="join-copy"><small>{label}</small><div className="copy-row"><code>{value}</code><button type="button" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? "복사됨" : "복사"}</button></div></div>;
}

export default function JoinForm({ needsCode }: { needsCode: boolean }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [age14, setAge14] = useState(false);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<Issued | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), ...(needsCode ? { inviteCode: code.trim() } : {}), agreeTerms: terms, agreePrivacy: privacy, age14 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setIssued(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "가입하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (issued) return <div className="join-issued">
    <p><strong>{issued.name}</strong>님, 환영해요! 아래 두 주소가 <b>비밀번호이자 열쇠</b>예요.</p>
    <p className="login-error" role="note">지금 꼭 저장해두세요. 내 기록은 이 주소로만 열리게 암호화돼 있어서, <b>잃어버리면 운영자도 되찾아 줄 수 없어요.</b> 다른 사람에게 보여주지 마세요.</p>
    <CopyRow label="① Claude 커넥터 주소 — claude.ai 설정 → 커넥터 → 커스텀 커넥터 추가" value={issued.connectorUrl} />
    <CopyRow label="② 내 대시보드 링크 — 북마크해두면 다음부터 바로 들어와요" value={issued.dashboardUrl} />
    <label className="remember-session"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />두 주소를 안전한 곳(비밀번호 관리자, 나에게 보낸 메모 등)에 저장했어요</label>
    <a className={`join-continue${saved ? "" : " disabled"}`} aria-disabled={!saved} href={saved ? "/" : undefined}>내 대장간으로 들어가기</a>
  </div>;

  return <form onSubmit={submit} className="join-form">
    <p>Claude와 함께 아이디어를 하드웨어로 만들어요. 이메일이나 전화번호는 받지 않아요.</p>
    {error && <p className="login-error" role="alert">{error}</p>}
    <label htmlFor="join-name">별명 <small>(실명 대신 별명을 권해요)</small></label>
    <input id="join-name" value={name} maxLength={30} required onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
    {needsCode && <><label htmlFor="join-code">초대 코드</label><input id="join-code" value={code} maxLength={40} required onChange={(e) => setCode(e.target.value)} autoComplete="off" /></>}
    <label className="remember-session"><input type="checkbox" checked={age14} onChange={(e) => setAge14(e.target.checked)} />만 14세 이상이에요</label>
    <label className="remember-session"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /><span><a href="/terms" target="_blank">이용약관</a>에 동의해요 (필수)</span></label>
    <label className="remember-session"><input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} /><span><a href="/privacy" target="_blank">개인정보 수집·이용</a>에 동의해요 (필수)</span></label>
    <button type="submit" disabled={busy || !name.trim() || !age14 || !terms || !privacy || (needsCode && !code.trim())}>{busy ? "만드는 중…" : "가입하고 내 링크 받기"}</button>
  </form>;
}
