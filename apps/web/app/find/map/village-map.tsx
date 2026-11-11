"use client";
import { useEffect, useState } from "react";
import GiwaBoard from "../giwa-panel";
import { track } from "../track";
import ForgeSignup from "../waitlist";
import { ERAS, ERA_DOKKAEBI } from "../world/world-eras";

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

// 3D 마을과 같은 배치를 위에서 본 지도: 호수 섬 가운데 본관, 둘레 다섯 마을, 바깥 시대 마을 셋 (3D를 못 여는 폰용)
const S = 150 / 114; // 월드 반지름 114 → 지도 반지름 150
const VANG = [-0.63, 0.63, 1.88, Math.PI, -1.88];
const VCOL: Record<string, string> = { kkomul: "#A9BE92", ttukttak: "#B9B38E", jjaekkak: "#A5B79E", wagle: "#B6C38E", kkambbak: "#9FB8A6" };
const ECOL: Record<string, string> = { prehistory: "#9AA578", modern: "#A9A69C", y2k: "#8E8C94" };
const pt = (a: number, d: number) => ({ x: 180 + Math.sin(a) * d * S, y: 180 - Math.cos(a) * d * S });
const DOT_COLORS = ["#9B7BFF", "#FF8F3F", "#3FBF6E", "#4FB3A6"];

export default function VillageMap(props: Props) {
  const { streets, hall, floating, totalForges, topWant, notices, me, couponText } = props;
  const [sheet, setSheet] = useState<null | { kind: "street"; street: Street } | { kind: "hall" } | { kind: "era"; era: (typeof ERAS)[number] }>(null);
  const [plans, setPlans] = useState(props.plans);
  const [budget, setBudget] = useState(props.budget);
  const [planMsg, setPlanMsg] = useState("");
  useEffect(() => { if (window.location.hash === "#hall") setSheet({ kind: "hall" }); }, []);

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
        <svg viewBox="0 0 360 360" className="palm island-map" role="img" aria-label="도깨비 마을 지도">
          <circle cx="180" cy="180" r="156" fill="#CFE3EA" />
          <circle cx="180" cy="180" r="150" fill="#B9C79E" stroke="#232323" strokeWidth="2.5" />
          {/* 시대 마을로 가는 길 */}
          {ERAS.map((e) => { const a = pt(e.angle, 21), b = pt(e.angle, 68); return <line key={`p-${e.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#C9B48E" strokeWidth="4" strokeLinecap="round" />; })}
          {VANG.map((a, i) => { const p1 = pt(a, 11), p2 = pt(a, 38); return <line key={`v-${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#C9B48E" strokeWidth="5" strokeLinecap="round" />; })}
          {/* 호수와 섬 */}
          <circle cx="180" cy="180" r={16 * S} fill="none" stroke="#5E7FA8" strokeWidth={9 * S} />
          {VANG.map((a, i) => { const p1 = pt(a, 11), p2 = pt(a, 21); return <line key={`b-${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#8A7350" strokeWidth="5" />; })}
          {/* 시대 마을 */}
          {ERAS.map((e) => { const c = pt(e.angle, 84); return (
            <g key={e.id} className="finger" onClick={() => { setSheet({ kind: "era", era: e }); track("era_open", { era: e.id }); }} role="button" tabIndex={0} aria-label={`${e.name} 열기`}>
              <rect x={c.x - 36} y={c.y - 22} width="72" height="44" rx="10" fill={ECOL[e.id]} stroke="#232323" strokeWidth="2" />
              <text x={c.x} y={c.y - 3} textAnchor="middle" className="finger-name" style={{ fontSize: 12 }}>{e.name}</text>
              <text x={c.x} y={c.y + 12} textAnchor="middle" className="finger-count" style={{ fontSize: 9 }}>{e.period}</text>
            </g>
          ); })}
          {/* 다섯 마을 */}
          {streets.map((s, i) => { const c = pt(VANG[i], 46); return (
            <g key={s.id} className="finger" onClick={() => { setSheet({ kind: "street", street: s }); track("street_open", { street: s.id }); }} role="button" tabIndex={0} aria-label={`${s.name} 열기`}>
              <circle cx={c.x} cy={c.y} r="26" fill={VCOL[s.id] ?? "#B9C79E"} stroke="#232323" strokeWidth="2" />
              <text x={c.x} y={c.y - 2} textAnchor="middle" className="finger-name" style={{ fontSize: 12 }}>{s.name}</text>
              <text x={c.x} y={c.y + 13} textAnchor="middle" className="finger-count">{s.residents ? `${s.residents}채` : "빈 터"}</text>
              {Array.from({ length: Math.min(3, Math.ceil(s.residents / 3)) }).map((_, k) => <circle key={k} cx={c.x - 8 + k * 8} cy={c.y - 17} r="2.6" fill={DOT_COLORS[(k + i) % 4]} className="float-dot" style={{ animationDelay: `${k * 0.7}s` }} />)}
            </g>
          ); })}
          <g className="hall" onClick={() => { setSheet({ kind: "hall" }); track("hall_open"); }} role="button" tabIndex={0} aria-label="달그락 대장간 본관">
            <circle cx="180" cy="180" r={11 * S} fill="#CDB894" stroke="#232323" strokeWidth="2" />
            <rect x="170" y="172" width="20" height="14" fill={hall.stage >= 4 ? "#F6F5F1" : "none"} stroke="#232323" strokeWidth="1.5" strokeDasharray={hall.stage === 0 ? "3 2" : undefined} />
            {hall.stage >= 2 && <polygon points="166,173 180,163 194,173" fill="#3E3C42" stroke="#232323" strokeWidth="1.5" />}
            {hall.stage >= 3 && <circle cx="186" cy="160" r="3" fill="#FF8F3F" className="hall-smoke" />}
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

      <GiwaBoard hasForge={Boolean(me)} />

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

      <nav className="town-tabs" aria-label="마을 메뉴"><a href="/find/home">내 대장간</a><a href="/find/neighbors">이웃</a><a href="/find/dex">도감</a><a href="/find/random">아무 대장간이나</a></nav>

      {sheet && (
        <div className="overlay" role="dialog" aria-label={sheet.kind === "hall" ? "본관" : sheet.kind === "era" ? sheet.era.name : sheet.street.name} onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="sheet tall">
            {sheet.kind === "era" ? (
              <>
                <div className="display" style={{ fontSize: 22 }}>{sheet.era.name} <span className="muted small">{sheet.era.period}</span></div>
                <p className="body" style={{ margin: 0 }}>{sheet.era.topics}</p>
                <div className="tiny muted">여기 사는 물건 도깨비</div>
                <div className="phrases">{(ERA_DOKKAEBI[sheet.era.id] ?? []).map((n) => <span key={n} className="chip">{n}</span>)}</div>
                <a className="btn btn-fire" href={`/find/village?at=${sheet.era.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>이 시대 마을 걸어보기</a>
              </>
            ) : sheet.kind === "street" ? (
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
