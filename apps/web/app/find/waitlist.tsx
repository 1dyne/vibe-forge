"use client";
import { useState } from "react";
import { track } from "./track";

type Standing = { code: string; position: number; total: number; referrals: number; fuel?: number; alreadyJoined: boolean; fireName: string | null };

// 대장간 오픈 대기 신청: 손가락 5단계 + 소개 + 이메일. 결과 화면 직후·대장간 설계도·(나중에) 본관에서 같이 쓴다.
// 대장간이 있는 사람이 이메일을 남기면 달그락 마을 문이 열린다 (enterVillage: 문 앞 화면에서 쓸 때는 바로 들어가는 버튼을 크게)
export default function ForgeSignup({ fire, forgeId, refCode, couponText, onRestart, enterVillage, explain = false }: { explain?: boolean; fire: { id: string; name: string } | null; forgeId?: string | null; refCode: string | null; couponText: string | null; onRestart?: () => void; enterVillage?: boolean }) {
  const [email, setEmail] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [standing, setStanding] = useState<Standing | null>(null);
  const [copied, setCopied] = useState(false);

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
      {explain ? <Explainer /> : <h2 style={{ fontSize: 20 }}>대장간이 열리면 알려줄게</h2>}
      {standing ? (
        <>
          <div className="queue">
            <div className="muted small">{standing.alreadyJoined ? "이미 줄 서 있어! 대장간 대기 순번" : "대장간 대기 순번"}</div>
            <b>#{standing.position}</b>
            <div className="muted tiny">{standing.fireName ?? "네 도깨비불"} 자리 맡아둘게 · 받은 장작 {standing.fuel ?? 0}개</div>
          </div>
          {forgeId && (
            <div className="note village-open">
              <div className="display" style={{ fontSize: 18 }}>달그락 마을 문이 열렸어</div>
              <div className="small body">다른 도깨비들이 구상 중인 것들을 구경하고, 네 대장간도 꾸며봐.</div>
              <a className={`btn ${enterVillage ? "btn-fire" : "btn-ghost"}`} href={`/find/village?house=${forgeId}`} onClick={() => track("village_open_enter")} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>마을로 들어가기</a>
            </div>
          )}
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

/** 달그락 대장간이 뭔지 글 대신 넘겨보는 카드 (도깨비불을 받은 직후 한 번) */
const CARDS: Array<{ title: string; body: string; art: "flow" | "two" | "bench" | "bell" | "team" }> = [
  { title: "정해진 키트가 아니라, 내 아이디어로", body: "달그락 대장간은 남이 만든 예제를 따라 하는 곳이 아니야. 방금 찾은 네 도깨비불, 그 아이디어 하나로 시작해.", art: "flow" },
  { title: "달그락들이 같이 설계해", body: "부품 고르기, 회로, 케이스까지 달그락들이 네 아이디어에 맞춰 같이 설계해줘. 모르는 건 물어보면 쉽게 풀어서 알려줘.", art: "team" },
  { title: "내 아이디어 전용 설명서", body: "설계가 끝나면 네 아이디어만을 위한 설명서와 3D 회로도가 나와. 개발이 처음이어도 화면 속 작업대에서 한 단계씩 같이 따라 하면 돼.", art: "bench" },
  { title: "편한 방법으로", body: "구독 중인 AI가 있으면 커넥터로 연결해서 대화하고, 달그락에서는 설계도를 받아봐. 없으면 웹에서 바로 달그락들과 이야기하면 돼.", art: "two" },
  { title: "열리면 알려줄게", body: "메일을 남기면 대장간이 열릴 때 네 도깨비불의 설계도 첫 장을 보내주고, 지금 바로 달그락 마을 문이 열려.", art: "bell" },
];
function Art({ kind }: { kind: (typeof CARDS)[number]["art"] }) {
  if (kind === "flow") return (
    <svg viewBox="0 0 240 90" aria-hidden className="ex-art">
      {["아이디어", "부품", "회로", "조립"].map((t, i) => (
        <g key={t} transform={`translate(${12 + i * 58},18)`}>
          <circle cx="20" cy="20" r="19" fill={i === 0 ? "#FF8F3F" : "var(--surface-2)"} stroke="var(--ink)" strokeWidth="2" />
          <text x="20" y="62" textAnchor="middle" fontSize="12" fill="var(--ink)">{t}</text>
          {i < 3 && <path d="M43 20h12" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />}
        </g>
      ))}
    </svg>
  );
  if (kind === "team") return (
    <svg viewBox="0 0 240 90" aria-hidden className="ex-art">
      <rect x="86" y="30" width="68" height="44" rx="6" fill="#F3E7C9" stroke="var(--ink)" strokeWidth="2" />
      <path d="M96 44h48M96 54h34M96 64h40" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
      {[[40, "#4FB3A6"], [200, "#9B7BFF"], [120, "#FF8F3F"]].map(([x, c], k) => (
        <g key={k} transform={`translate(${x},${k === 2 ? 4 : 30})`}>
          <path d="M-14 22 C-14 4 -8 -6 0 -6 C8 -6 14 4 14 22 Z" fill={c as string} stroke="var(--ink)" strokeWidth="2" />
          <circle cx="-4" cy="6" r="1.8" fill="var(--ink)" /><circle cx="4" cy="6" r="1.8" fill="var(--ink)" />
        </g>
      ))}
    </svg>
  );
  if (kind === "two") return (
    <svg viewBox="0 0 240 90" aria-hidden className="ex-art">
      <rect x="10" y="12" width="100" height="62" rx="12" fill="var(--surface-2)" stroke="var(--ink)" strokeWidth="2" />
      <text x="60" y="38" textAnchor="middle" fontSize="12" fill="var(--ink)">내 AI</text>
      <text x="60" y="58" textAnchor="middle" fontSize="11" fill="var(--muted)">커넥터 연결</text>
      <rect x="130" y="12" width="100" height="62" rx="12" fill="var(--surface-2)" stroke="var(--ink)" strokeWidth="2" />
      <text x="180" y="38" textAnchor="middle" fontSize="12" fill="var(--ink)">달그락 웹</text>
      <text x="180" y="58" textAnchor="middle" fontSize="11" fill="var(--muted)">바로 대화</text>
    </svg>
  );
  if (kind === "bench") return (
    <svg viewBox="0 0 240 90" aria-hidden className="ex-art">
      <rect x="62" y="16" width="116" height="62" rx="6" fill="#2C7A70" stroke="var(--ink)" strokeWidth="2" />
      {Array.from({ length: 8 }).map((_, i) => <circle key={i} cx={78 + i * 12} cy="30" r="2.5" fill="#E9D9A6" />)}
      <rect x="84" y="44" width="40" height="18" rx="2" fill="#1E1F24" />
      <circle cx="150" cy="54" r="7" fill="#FF8F3F" stroke="var(--ink)" strokeWidth="1.5" />
      <path d="M190 20 l24 -10" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
      <path d="M182 26 l10 -5" stroke="#9C9C9C" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
  return (
    <svg viewBox="0 0 240 90" aria-hidden className="ex-art">
      <path d="M120 14c-16 0-26 12-26 28v14l-8 10h68l-8-10V42c0-16-10-28-26-28z" fill="#FF8F3F" stroke="var(--ink)" strokeWidth="2" />
      <circle cx="120" cy="72" r="6" fill="var(--ink)" />
    </svg>
  );
}
function Explainer() {
  const [i, setI] = useState(0);
  return (
    <div className="explainer">
      <div className="ex-track" onScroll={(e) => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / el.clientWidth)); }}>
        {CARDS.map((c) => (
          <div key={c.title} className="ex-card">
            <Art kind={c.art} />
            <div className="display" style={{ fontSize: 20 }}>{c.title}</div>
            <p>{c.body}</p>
          </div>
        ))}
      </div>
      <div className="ex-dots" aria-hidden>{CARDS.map((c, k) => <i key={c.title} className={k === i ? "on" : ""} />)}</div>
      <div className="tiny muted" style={{ textAlign: "center" }}>옆으로 넘겨봐</div>
    </div>
  );
}
