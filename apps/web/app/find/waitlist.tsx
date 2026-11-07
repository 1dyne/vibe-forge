"use client";
import { useState } from "react";
import { track } from "./track";

type Standing = { code: string; position: number; total: number; referrals: number; fuel?: number; alreadyJoined: boolean; fireName: string | null };

// 대장간 오픈 대기 신청: 손가락 5단계 + 소개 + 이메일. 결과 화면 직후·대장간 설계도·(나중에) 본관에서 같이 쓴다.
export default function ForgeSignup({ fire, forgeId, refCode, couponText, onRestart }: { fire: { id: string; name: string } | null; forgeId?: string | null; refCode: string | null; couponText: string | null; onRestart?: () => void }) {
  const [email, setEmail] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [standing, setStanding] = useState<Standing | null>(null);
  const [copied, setCopied] = useState(false);
  const steps: Array<[string, string]> = [["아이디어", "도깨비불 찾기 완료"], ["부품", "실제로 살 수 있는 부품 추천"], ["회로", "회로도와 연결 순서"], ["하우징", "케이스 설계와 대안"], ["조립", "레고 설명서처럼 단계별로"]];

  async function join() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/find/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, fireId: fire?.id ?? null, privacyConsent: privacy, marketingConsent: marketing, ref: refCode, website: honeypot }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "신청하지 못했어.");
      setStanding(body.standing);
      track("waitlist_join", { referred: Boolean(refCode) });
      if (refCode && !body.standing.alreadyJoined) track("referral_join");
    } catch (e) {
      setError(e instanceof Error ? e.message : "신청하지 못했어.");
    } finally {
      setBusy(false);
    }
  }
  const invite = typeof window === "undefined" || !standing ? "" : `${window.location.origin}${forgeId ? `/f/${forgeId}` : fire ? `/f/${fire.id}` : "/find"}?ref=${standing.code}`;

  return (
    <section className="screen">
      <h2>불은 찾았어.<br />이제 몸을 만들어줄 차례야.</h2>
      {steps.map(([t, d], i) => (
        <div key={t} className={`finger-step ${i === 0 ? "on" : ""}`}>
          <div className="dot">{i + 1}</div>
          <div style={{ flex: 1 }}><div className="step-title" style={i ? { color: "var(--muted)" } : undefined}>{t}</div><div className="muted tiny">{d}</div></div>
          <div className="tiny" style={i ? { color: "#8C8F98" } : { fontWeight: 700 }}>{i ? "오픈하면 켜져" : "불 켜짐"}</div>
        </div>
      ))}
      <div className="pitch">
        <div className="display" style={{ fontSize: 22, lineHeight: 1.4 }}>말하면, 회로도부터 조립까지.<br />하드웨어 올인원 대장간.</div>
        <div className="muted tiny" style={{ lineHeight: 1.6 }}>이미 구독 중인 AI에 커넥터로 연결해서 추가 비용 없이 써요. 부품 불량으로 바꾸는 부품값만 해도 서러우니까.</div>
      </div>
      {standing ? (
        <>
          <div className="queue">
            <div className="muted small">{standing.alreadyJoined ? "이미 줄 서 있어! 대장간 대기 순번" : "대장간 대기 순번"}</div>
            <b>#{standing.position}</b>
            <div className="muted tiny">{standing.fireName ?? "네 도깨비불"} 자리 맡아둘게 · 받은 장작 {standing.fuel ?? 0}개</div>
          </div>
          <div className="note">
            <div className="display" style={{ fontSize: 18 }}>장작을 받으면 순번이 앞당겨져</div>
            <div className="small body">친구가 네 대장간에 놀러 와서 장작을 하나 넣을 때마다 순번이 한 칸씩 앞당겨져. 아래 링크를 보내봐.{couponText ? ` 그리고 ${couponText}` : ""}</div>
            <button className="btn btn-ghost" type="button" onClick={async () => { try { await navigator.clipboard.writeText(invite); setCopied(true); track("invite_copy"); } catch { /* 직접 복사 */ } }}>{copied ? "복사했어!" : "초대 링크 복사"}</button>
            <div className="tiny muted" style={{ wordBreak: "break-all" }}>{invite}</div>
          </div>
        </>
      ) : (
        <form className="join" onSubmit={(e) => { e.preventDefault(); if (privacy) join(); }}>
          <label htmlFor="email">오픈하면 네 도깨비불의 설계도 첫 장을 보내줄게</label>
          <input id="email" type="email" required autoComplete="email" placeholder="이메일 주소" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden name="website" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          <label className="check"><input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} required /><span><b>[필수]</b> 개인정보 수집·이용 동의</span></label>
          <p className="fine">수집 항목: 이메일, 네 도깨비불(처음 적은 문장·고른 장작·화력) · 목적: 대장간 오픈 알림과 설계도 첫 장 발송, 추천 순번 계산 · 보관: 오픈 안내 후 6개월 또는 삭제 요청 시까지</p>
          <label className="check"><input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} /><span><b>[선택]</b> 오픈 이후 새 소식·이벤트 받기</span></label>
          {refCode && <p className="fine">초대 코드 {refCode}로 줄 서는 중</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" type="submit" disabled={busy || !privacy || !email}>{busy ? "줄 서는 중…" : "오픈 알림 받기"}</button>
        </form>
      )}
      {onRestart && <button className="link" type="button" onClick={onRestart}>처음부터 다시</button>}
    </section>
  );
}
