"use client";
import { useState } from "react";
import GiwaBoard from "../giwa-panel";
import { track } from "../track";
import ForgeSignup from "../waitlist";

type Plan = { id: number; title: string; description: string; status: "voting" | "building" | "done"; fuel: number; mine: number };
type Props = {
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

export default function VillageMap(props: Props) {
  const { hall, floating, totalForges, topWant, notices, me, couponText } = props;
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
        <h1 style={{ fontSize: 26 }}>본관 게시판</h1>
        <a className="world-link" href="/find/village">마을 걸어보기</a>
        <div className="muted small">지금 마을에 도깨비불 <b>{floating}</b>개가 떠 있어 · 대장간 {totalForges}채</div>
      </div>

      <div className="notes" id="hall">
        <div className="tiny muted">본관 공사 — {hall.label} 단계 · 마을 장작 {hall.pct}% ({hall.totalFuel}/{hall.goal})</div>
        <div className="hall-gauge" aria-hidden><i style={{ width: `${Math.max(2, hall.pct)}%` }} /></div>
        <p className="small body" style={{ margin: 0 }}>주민들이 넣은 장작이 모이면 본관이 한 단계씩 지어져. 본관이 열리면 네 도깨비불의 회로도부터 받을 수 있어.</p>
        {me ? <ForgeSignup fire={me.fire} forgeId={me.forgeId} refCode={null} couponText={couponText} /> : (
          <a className="btn btn-fire" href="/find" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>내 도깨비불부터 찾기</a>
        )}
      </div>

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

    </section>
  );
}
