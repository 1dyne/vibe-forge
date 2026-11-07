"use client";
import { useState } from "react";
import { track } from "../track";
import ForgeSignup from "../waitlist";

type Street = { id: string; name: string; topics: string; mood: string; residents: number };
type Plan = { id: number; title: string; description: string; status: "voting" | "building" | "done"; fuel: number; mine: number };
type Props = {
  streets: Street[];
  hall: { pct: number; stage: number; label: string; totalFuel: number; goal: number };
  floating: number;
  totalForges: number;
  topWant: { forgeId: string; nickname: string; fireName: string; color: string; wants: number } | null;
  notices: Array<{ id: number; title: string; body: string; publishedAt: string }>;
  plans: Plan[];
  budget: { total: number; used: number } | null;
  me: { forgeId: string; fire: { id: string; name: string } | null } | null;
  couponText: string | null;
};

// 마을 5개 자리 (3D 마을이 안 열리는 기기용 간단 지도)
const FINGERS: Record<string, { x: number; y: number; w: number; h: number; rot: number }> = {
  kkomul: { x: 66, y: 296, w: 50, h: 112, rot: -40 },
  ttukttak: { x: 70, y: 70, w: 52, h: 200, rot: -6 },
  jjaekkak: { x: 132, y: 30, w: 54, h: 230, rot: 0 },
  wagle: { x: 196, y: 52, w: 52, h: 210, rot: 5 },
  kkambbak: { x: 254, y: 118, w: 48, h: 160, rot: 13 }
};
const DOT_COLORS = ["#9B7BFF", "#FF8F3F", "#3FBF6E", "#4FB3A6"];

function Hall({ stage }: { stage: number }) {
  // 본관 공사 단계: 터 → 뼈대 → 지붕 → 굴뚝 → 완공 (다인 그림 오기 전 임시)
  return (
    <g>
      <rect x="140" y="378" width="80" height="44" rx="3" fill={stage >= 4 ? "#F6F5F1" : "none"} stroke="#232323" strokeWidth="2" strokeDasharray={stage === 0 ? "5 4" : undefined} />
      {stage >= 1 && <g stroke="#8B6A4A" strokeWidth="3"><line x1="150" y1="422" x2="150" y2="378" /><line x1="180" y1="422" x2="180" y2="378" /><line x1="210" y1="422" x2="210" y2="378" /></g>}
      {stage >= 2 && <polygon points="132,380 180,346 228,380" fill="#E2574C" stroke="#232323" strokeWidth="2" />}
      {stage >= 3 && <g><rect x="200" y="346" width="12" height="22" fill="#9E9E9E" stroke="#232323" strokeWidth="2" /><circle cx="206" cy="338" r="6" fill="#FF8F3F" className="hall-smoke" /></g>}
      {stage >= 4 && <g><rect x="172" y="398" width="16" height="24" fill="#FFD27A" stroke="#232323" strokeWidth="2" /><line x1="180" y1="346" x2="180" y2="326" stroke="#232323" strokeWidth="2" /><polygon points="180,326 196,331 180,336" fill="#9B7BFF" /></g>}
    </g>
  );
}

export default function VillageMap(props: Props) {
  const { streets, hall, floating, totalForges, topWant, notices, me, couponText } = props;
  const [sheet, setSheet] = useState<null | { kind: "street"; street: Street } | { kind: "hall" }>(null);
  const [plans, setPlans] = useState(props.plans);
  const [budget, setBudget] = useState(props.budget);
  const [planMsg, setPlanMsg] = useState("");

  async function vote(p: Plan, delta: number) {
    if (!me) { setPlanMsg("내 대장간이 있어야 장작으로 투표할 수 있어."); return; }
    const res = await fetch("/api/find/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId: p.id, fuel: Math.max(0, p.mine + delta) }) });
    const json = await res.json();
    if (!res.ok) { setPlanMsg(json.error ?? json.message ?? "투표하지 못했어."); return; }
    setPlans(json.plans); setBudget(json.budget); setPlanMsg(""); track("plan_vote");
  }

  return (
    <section className="screen village">
      <div className="village-head">
        <h1 style={{ fontSize: 26 }}>도깨비 마을</h1>
        <a className="world-link" href="/find/village">마을 걸어보기</a>
        <div className="muted small">지금 마을에 도깨비불 <b>{floating}</b>개가 떠 있어 · 대장간 {totalForges}채</div>
      </div>

      <div className="palm-wrap">
        <svg viewBox="0 0 360 500" className="palm" role="img" aria-label="도깨비 마을 지도">
          <rect x="62" y="250" width="240" height="230" rx="96" fill="#EAF5F2" stroke="#232323" strokeWidth="2.5" />
          {streets.map((s) => {
            const f = FINGERS[s.id];
            const residents = s.residents;
            return (
              <g key={s.id} className="finger" transform={`rotate(${f.rot} ${f.x + f.w / 2} ${f.y + f.h})`} onClick={() => { setSheet({ kind: "street", street: s }); track("street_open", { street: s.id }); }} role="button" tabIndex={0} aria-label={`${s.name} 열기`}>
                <rect x={f.x} y={f.y} width={f.w} height={f.h + 40} rx={f.w / 2} fill={residents ? "#F6F5F1" : "#F1F0EB"} stroke="#232323" strokeWidth="2.5" />
                <text x={f.x + f.w / 2} y={f.y + 26} textAnchor="middle" className="finger-name">{s.name}</text>
                <text x={f.x + f.w / 2} y={f.y + 44} textAnchor="middle" className="finger-count">{residents ? `${residents}채` : "빈 터"}</text>
                {Array.from({ length: Math.min(4, Math.ceil(residents / 2) + 1) }).map((_, i) => (
                  <circle key={i} cx={f.x + f.w / 2 + (i % 2 ? 9 : -9)} cy={f.y + 70 + i * 28} r="5" fill={DOT_COLORS[(i + s.id.length) % 4]} className="float-dot" style={{ animationDelay: `${i * 0.7}s` }} />
                ))}
              </g>
            );
          })}
          <g className="hall" onClick={() => { setSheet({ kind: "hall" }); track("hall_open"); }} role="button" tabIndex={0} aria-label="달그락 대장간 본관">
            <rect x="112" y="316" width="136" height="140" rx="20" fill="transparent" />
            <Hall stage={hall.stage} />
            <text x="180" y="446" textAnchor="middle" className="hall-name">달그락 대장간 본관</text>
          </g>
          <g>
            <rect x="110" y="456" width="140" height="10" rx="5" fill="#EEECE5" stroke="#232323" strokeWidth="1" />
            <rect x="110" y="456" width={Math.max(4, 1.4 * hall.pct)} height="10" rx="5" fill="#FF8F3F" />
          </g>
        </svg>
      </div>
      <div className="muted small" style={{ textAlign: "center" }}>마을 장작 <b>{hall.pct}%</b> · 본관 공사: {hall.label} ({hall.totalFuel}/{hall.goal})<br />마을이나 본관을 눌러봐</div>

      {topWant && (
        <a className="board-card" href={`/f/${topWant.forgeId}`} style={{ borderColor: topWant.color }}>
          <span className="tiny muted">이번 주 가장 갖고 싶은 발명품</span>
          <b>{topWant.fireName}</b>
          <span className="small">{topWant.nickname}의 대장간 · 나도 갖고 싶어 {topWant.wants}</span>
        </a>
      )}

      {notices.length > 0 && (
        <div className="notes">
          <div className="tiny muted">광장 소식판</div>
          {notices.map((n) => <div key={n.id} className="notice-row"><b>{n.title}</b><span>{n.body}</span></div>)}
        </div>
      )}

      <div className="notes">
        <div className="tiny muted">공사 계획판 — 다음에 지을 것에 장작으로 투표{budget ? ` (내 장작 ${budget.total - budget.used}/${budget.total}개 남음)` : ""}</div>
        {plans.length === 0 && <div className="small muted">아직 올라온 후보가 없어. 우체통에 지었으면 하는 걸 넣어줘.</div>}
        {plans.map((p) => (
          <div key={p.id} className="plan-row">
            <div style={{ flex: 1, minWidth: 0 }}><b>{p.title}</b>{p.description && <span className="tiny muted">{p.description}</span>}<span className="tiny muted">{p.status === "voting" ? `장작 ${p.fuel}개` : p.status === "building" ? "짓는 중" : "완공"}</span></div>
            {p.status === "voting" && (
              <div className="plan-vote">
                <button type="button" aria-label="장작 빼기" disabled={p.mine === 0} onClick={() => vote(p, -1)}>−</button>
                <b>{p.mine}</b>
                <button type="button" aria-label="장작 넣기" onClick={() => vote(p, 1)}>+</button>
              </div>
            )}
          </div>
        ))}
        {planMsg && <div className="error">{planMsg}</div>}
      </div>

      <nav className="town-tabs" aria-label="마을 메뉴"><a href="/find/home">내 집</a><a href="/find/neighbors">이웃</a><a href="/find/dex">도감</a><a href="/find/random">아무 집이나</a></nav>

      {sheet && (
        <div className="overlay" role="dialog" aria-label={sheet.kind === "hall" ? "본관" : sheet.street.name} onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="sheet tall">
            {sheet.kind === "street" ? (
              <>
                <div className="display" style={{ fontSize: 22 }}>{sheet.street.name} <span className="muted small">{sheet.street.topics}</span></div>
                <p className="body" style={{ margin: 0 }}>{sheet.street.mood}. 지금 대장간 {sheet.street.residents}채.</p>
                <a className="btn btn-fire" href={`/find/village?at=${sheet.street.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>이 마을 걸어보기</a>
              </>
            ) : (
              <>
                <div className="display" style={{ fontSize: 22 }}>달그락 대장간 본관</div>
                <p className="body" style={{ margin: 0 }}>주민들이 넣은 장작이 모이면 본관이 한 단계씩 지어져. 지금 {hall.label} 단계, 마을 장작 {hall.pct}%야. 본관이 열리면 네 도깨비불의 회로도부터 받을 수 있어.</p>
                {me ? <ForgeSignup fire={me.fire} forgeId={me.forgeId} refCode={null} couponText={couponText} /> : (
                  <a className="btn btn-fire" href="/find" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>내 도깨비불부터 찾기</a>
                )}
              </>
            )}
            <button className="link" type="button" onClick={() => setSheet(null)}>닫기</button>
          </div>
        </div>
      )}
    </section>
  );
}
