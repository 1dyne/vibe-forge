"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { IdeaAnalysis } from "../../lib/onboarding/analyze";

const EXAMPLES = [
  "교실이 시끄러워지면 불이 켜지는 신호등",
  "화분 흙이 마르면 폰으로 알림 받기",
  "깔창에 압력 센서를 넣어 걸음을 기록하는 인솔",
  "동네 모임 일정을 잡아주는 예약 앱"
];

const EXPERIENCE = [
  { id: "first_time", label: "처음이에요" },
  { id: "tried_board", label: "아두이노 정도 만져봤어요" },
  { id: "soldered", label: "납땜까지 해봤어요" }
] as const;

const WANT_FIRST = [
  { id: "circuit", label: "회로도" },
  { id: "parts_cost", label: "부품 목록·견적" },
  { id: "case_3d", label: "3D 케이스 파일" },
  { id: "assembly", label: "조립 가이드" },
  { id: "firmware", label: "보드에 올릴 코드" }
] as const;

const BUDGET = [
  { id: "under_50k", label: "5만 원 이하" },
  { id: "50k_150k", label: "5~15만 원" },
  { id: "over_150k", label: "15만 원 이상" },
  { id: "unknown", label: "아직 몰라요" }
] as const;

type Standing = { code: string; position: number; total: number; referrals: number; alreadyJoined: boolean };

function Character({ busy }: { busy: boolean }) {
  return (
    <span className="st-character" aria-hidden>
      <img src={busy ? "/characters/thinking_1.png" : "/characters/idle.png"} alt="" width={84} height={84} />
    </span>
  );
}

function MatchBar({ percent }: { percent: number }) {
  return (
    <div className="st-bar" role="img" aria-label={`일치율 ${percent}%`}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

function CopyBox({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="st-copy">
      <pre>{text}</pre>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* 복사 권한이 없으면 직접 선택해서 복사 */ } }}>
        {copied ? "복사했어요" : label}
      </button>
    </div>
  );
}

export default function StartFlow() {
  const [idea, setIdea] = useState("");
  const [submittedIdea, setSubmittedIdea] = useState("");
  const [analysis, setAnalysis] = useState<IdeaAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ref, setRef] = useState<string | null>(null);
  const resultRef = useRef<HTMLElement>(null);

  // 대기 신청
  const [email, setEmail] = useState("");
  const [experience, setExperience] = useState<string | null>(null);
  const [wantFirst, setWantFirst] = useState<string[]>([]);
  const [budget, setBudget] = useState<string | null>(null);
  const [shareIdea, setShareIdea] = useState(true);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [standing, setStanding] = useState<Standing | null>(null);
  const [shared, setShared] = useState("");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref")?.toUpperCase() ?? null;
    if (code && /^[A-Z0-9]{6}$/.test(code)) setRef(code);
  }, []);

  async function analyze(text: string, kind?: "hardware" | "software") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/start/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(kind ? { idea: text, kind } : { idea: text }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "분석하지 못했어요.");
      setSubmittedIdea(text);
      setAnalysis(body.analysis);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (idea.trim().length >= 3) analyze(idea.trim());
  }

  async function join(event: FormEvent) {
    event.preventDefault();
    setJoining(true);
    setJoinError("");
    try {
      const top = analysis?.matches[0];
      const response = await fetch("/api/start/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email, experience, wantFirst, budget,
          shareIdea: Boolean(analysis) && shareIdea,
          idea: analysis ? submittedIdea : null,
          ideaKind: analysis?.kind ?? null,
          topMatch: top ? { repo: top.repo, matchPercent: top.matchPercent } : null,
          privacyConsent, marketingConsent, ref,
          website: honeypot
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "신청하지 못했어요.");
      setStanding(body.standing);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "신청하지 못했어요.");
    } finally {
      setJoining(false);
    }
  }

  function shareText() {
    const top = analysis?.matches[0];
    if (analysis?.kind === "hardware" && top) return `"${submittedIdea}" 만들기 — 오픈소스 ${top.name}와(과) ${top.matchPercent}% 닮았대요. 나머지는 달그락 대장간이 설계도로 채워준대요.`;
    if (analysis?.kind === "hardware") return `"${submittedIdea}" — 세상에 아직 비슷한 오픈소스가 없대요. 달그락 대장간에서 설계도부터 받아볼 거예요.`;
    if (analysis?.kind === "software") return `"${submittedIdea}" — 이건 바이브코딩으로 바로 만들 수 있대요.`;
    return "만들고 싶은 걸 적으면 어떻게 만들지 알려주는 달그락 대장간";
  }

  async function share() {
    const url = `${window.location.origin}/start${standing ? `?ref=${standing.code}` : ""}`;
    const text = shareText();
    try {
      if (navigator.share) { await navigator.share({ title: "달그락, 이거 만들 수 있어?", text, url }); return; }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShared("링크를 복사했어요");
      setTimeout(() => setShared(""), 1800);
    } catch { /* 사용자가 공유 창을 닫은 경우 */ }
  }

  const toggleWant = (id: string) => setWantFirst((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  return (
    <main className="st-page">
      <header className="st-top">
        <a className="st-brand" href="/start"><img src="/characters/idle.png" alt="" width={32} height={32} />달그락 대장간</a>
        <a className="st-top-cta" href="#waitlist">오픈 알림 받기</a>
      </header>

      <section className="st-hero">
        <Character busy={busy} />
        <p className="st-eyebrow">생각을 손에 잡히게</p>
        <h1>뭘 만들고 싶어요?</h1>
        <p className="st-lede">한 줄이면 충분해요. 소프트웨어인지 하드웨어인지 나눠보고,<br />하드웨어라면 응용할 만한 오픈소스 메이커 프로젝트를 찾아드릴게요.</p>
        <form className="st-ask" onSubmit={onSubmit}>
          <label htmlFor="idea" className="st-sr">만들고 싶은 것</label>
          <textarea id="idea" value={idea} onChange={(e) => setIdea(e.target.value)} maxLength={500} rows={2}
            placeholder="예) 교실이 시끄러워지면 불이 켜지는 신호등"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSubmit(e); } }} />
          <button className="st-primary" type="submit" disabled={busy || idea.trim().length < 3}>{busy ? "살펴보는 중…" : "달그락, 이거 만들 수 있어?"}</button>
        </form>
        <div className="st-examples">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" onClick={() => { setIdea(example); analyze(example); }}>{example}</button>
          ))}
        </div>
        {error && <p className="st-error" role="alert">{error}</p>}
      </section>

      {analysis && (
        <section className="st-result" ref={resultRef} aria-live="polite">
          <p className="st-quote">“{submittedIdea}”</p>

          {analysis.kind === "unclear" && (
            <div className="st-card">
              <h2>손으로 만질 수 있는 물건인가요?</h2>
              <p className="st-muted">문장만으로는 구분이 어려웠어요. 하나만 골라주세요.</p>
              <div className="st-choice">
                <button type="button" onClick={() => analyze(submittedIdea, "hardware")}>네, 실제 물건이에요</button>
                <button type="button" onClick={() => analyze(submittedIdea, "software")}>아니요, 화면 속 프로그램이에요</button>
              </div>
            </div>
          )}

          {analysis.kind === "software" && (
            <div className="st-card">
              <span className="st-badge sw">소프트웨어</span>
              <h2>이건 바이브코딩으로 지금 바로 만들 수 있어요</h2>
              <p>부품도 납땜도 필요 없어요. AI 코딩 도구(Claude 등)에 아래 문장을 그대로 붙여넣고 시작해보세요.</p>
              <CopyBox text={analysis.vibePrompt ?? ""} label="시작 문장 복사" />
              <ol className="st-steps">
                <li>가장 작은 버전부터 — 첫 화면이 뜨면 절반은 온 거예요.</li>
                <li>막히면 에러 메시지를 그대로 붙여넣고 “쉽게 설명해줘”라고 하세요.</li>
                <li>센서나 불빛처럼 <b>실제 물건</b>이 필요해지면, 그때 달그락 대장간으로 오세요.</li>
              </ol>
              <button type="button" className="st-link" onClick={() => analyze(submittedIdea, "hardware")}>사실 실제 물건도 필요해요 →</button>
            </div>
          )}

          {analysis.kind === "hardware" && (
            <>
              <div className="st-card">
                <span className="st-badge hw">하드웨어</span>
                <h2>{analysis.matches.length ? "처음부터 만들 필요 없어요. 여기서 출발해보세요" : "아직 비슷한 오픈소스가 없어요 — 새로 설계할 아이디어예요"}</h2>
                {analysis.capabilities.length > 0 && (
                  <p className="st-muted">달그락이 읽은 필요한 기능 · {analysis.capabilities.map((c) => <span className="st-chip" key={c.id}>{c.label}</span>)}</p>
                )}
                <div className="st-matches">
                  {analysis.matches.map((m, i) => (
                    <a className={`st-match${i === 0 ? " top" : ""}`} key={m.repo} href={m.url} target="_blank" rel="noopener noreferrer">
                      <div className="st-match-head">
                        <strong>{m.name}</strong>
                        <span className="st-percent">{m.matchPercent}<small>%</small></span>
                      </div>
                      <MatchBar percent={m.matchPercent} />
                      <p>{m.summary}</p>
                      <p className="st-cover">
                        {m.covered.length > 0 && <span>✓ {m.covered.join(" · ")}</span>}
                        {m.missing.length > 0 && <span className="miss">＋ 더 필요: {m.missing.join(" · ")}</span>}
                      </p>
                      <small className="st-repo">github.com/{m.repo} ↗</small>
                    </a>
                  ))}
                </div>
                {analysis.matches.length > 0 && <p className="st-fine">일치율은 필요한 기능을 프로젝트가 얼마나 기본으로 갖췄는지로 계산해요(감지·반응은 2배 가중). 직접 빌드해보기 전엔 100%라고 하지 않아요. 저장소 확인일 {analysis.catalogVerifiedAt}.</p>}
              </div>

              {analysis.gaps.length > 0 && (
                <div className="st-card">
                  <h3>{analysis.matches.length ? `${analysis.matches[0].name}에 더 설계해야 하는 부분` : "새로 설계해야 하는 부분"}</h3>
                  <ul className="st-gaps">
                    {analysis.gaps.map((g) => (
                      <li key={g.capability}>
                        <b>{g.label}</b>
                        <p>{g.design}</p>
                        {g.helper && <a href={g.helper.url} target="_blank" rel="noopener noreferrer">참고 코드: {g.helper.name} ↗</a>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.openQuestions.length > 0 && (
                <div className="st-card soft">
                  <h3>설계 전에 정해야 할 것</h3>
                  <ul className="st-questions">{analysis.openQuestions.map((q) => <li key={q}>{q}</li>)}</ul>
                </div>
              )}

              {analysis.needsSoftwareToo && analysis.vibePrompt && (
                <div className="st-card soft">
                  <h3>앱·웹 화면은 바이브코딩으로</h3>
                  <p className="st-muted">기기와 함께 쓸 화면은 소프트웨어라서 지금 바로 시작할 수 있어요.</p>
                  <CopyBox text={analysis.vibePrompt} label="시작 문장 복사" />
                </div>
              )}
            </>
          )}

          {analysis.kind !== "unclear" && (
            <div className="st-share">
              <button type="button" onClick={share}>결과 공유하기</button>
              {shared && <span>{shared}</span>}
            </div>
          )}
        </section>
      )}

      <section className="st-waitlist" id="waitlist">
        <div className="st-waitlist-copy">
          <p className="st-eyebrow">곧 문을 열어요</p>
          <h2>설계도부터 받아 쓰는<br />달그락 대장간</h2>
          <p>아이디어를 회로도·부품 목록·3D 케이스·조립 가이드로 바꿔주는 AI 제작팀. 문을 열면 가장 먼저 알려드릴게요.</p>
        </div>

        {standing ? (
          <div className="st-card st-joined">
            <h3>{standing.alreadyJoined ? "이미 신청하셨어요" : "신청 완료!"}</h3>
            <p className="st-position"><b>{standing.position}</b>번째 <small>/ {standing.total}명</small></p>
            <p className="st-muted">친구가 내 링크로 신청하면 1명당 3칸씩 앞당겨져요. 지금까지 초대 {standing.referrals}명.</p>
            <CopyBox text={`${typeof window === "undefined" ? "" : window.location.origin}/start?ref=${standing.code}`} label="초대 링크 복사" />
            <button type="button" className="st-primary" onClick={share}>친구에게 공유하기</button>
          </div>
        ) : (
          <form className="st-card st-form" onSubmit={join}>
            <label htmlFor="email">알림 받을 이메일 <em>필수</em></label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />

            <fieldset>
              <legend>하드웨어 경험 <em>선택</em></legend>
              <div className="st-pills">{EXPERIENCE.map((o) => <button type="button" key={o.id} aria-pressed={experience === o.id} onClick={() => setExperience(experience === o.id ? null : o.id)}>{o.label}</button>)}</div>
            </fieldset>
            <fieldset>
              <legend>가장 먼저 받고 싶은 것 <em>선택 · 여러 개</em></legend>
              <div className="st-pills">{WANT_FIRST.map((o) => <button type="button" key={o.id} aria-pressed={wantFirst.includes(o.id)} onClick={() => toggleWant(o.id)}>{o.label}</button>)}</div>
            </fieldset>
            <fieldset>
              <legend>생각하는 제작 예산 <em>선택</em></legend>
              <div className="st-pills">{BUDGET.map((o) => <button type="button" key={o.id} aria-pressed={budget === o.id} onClick={() => setBudget(budget === o.id ? null : o.id)}>{o.label}</button>)}</div>
            </fieldset>

            <input className="st-hp" tabIndex={-1} autoComplete="off" aria-hidden value={honeypot} onChange={(e) => setHoneypot(e.target.value)} name="website" />

            {analysis && (
              <label className="st-check"><input type="checkbox" checked={shareIdea} onChange={(e) => setShareIdea(e.target.checked)} />방금 적은 아이디어도 함께 보내기 <small>첫 설계도 후보를 고를 때 참고해요</small></label>
            )}
            <label className="st-check"><input type="checkbox" checked={privacyConsent} onChange={(e) => setPrivacyConsent(e.target.checked)} required /><span><b>[필수]</b> 개인정보 수집·이용 동의</span></label>
            <p className="st-fine">수집 항목: 이메일{analysis ? ", 아이디어와 분석 결과(보내기를 선택한 경우)" : ""}, 위에서 고른 응답 · 목적: 오픈 알림과 첫 설계도 우선순위 결정 · 보관: 정식 오픈 안내 후 6개월 또는 삭제 요청 시까지</p>
            <label className="st-check"><input type="checkbox" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} /><span><b>[선택]</b> 오픈 이후 새 기능·이벤트 소식 받기</span></label>

            {ref && <p className="st-fine">초대 코드 {ref}로 신청해요.</p>}
            {joinError && <p className="st-error" role="alert">{joinError}</p>}
            <button className="st-primary" type="submit" disabled={joining || !privacyConsent}>{joining ? "신청하는 중…" : "오픈 알림 받기"}</button>
          </form>
        )}
      </section>

      <footer className="st-footer">
        <p>달그락 대장간 · 하드웨어 경험이 없어도 아이디어를 실제 물건으로</p>
      </footer>
    </main>
  );
}
