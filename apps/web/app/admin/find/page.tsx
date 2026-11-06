import { isOperator } from "../../../lib/find/admin-auth";
import { allWaitlist, eventCounts, storageKind } from "../../../lib/find/store";
import { notFound } from "next/navigation";
import CouponToggle from "./coupon-toggle";

export const dynamic = "force-dynamic";

// 도깨비불 찾기 운영 화면 (로그인한 사람만). HANDOFF §8 핵심 지표 + 대기열.
export default async function FindAdmin() {
  if (!(await isOperator())) notFound();
  const [counts, waitlist] = await Promise.all([eventCounts(), allWaitlist()]);
  const n = (k: string) => counts[k] ?? 0;
  const referred = waitlist.filter((w) => w.referredBy).length;
  const rate = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");
  const metrics: Array<[string, string, string]> = [
    ["아이디어 입력", String(n("idea_submit")), "시작 화면에서 '나와라, 뚝딱!'"],
    ["불 확정", `${n("fire_locked")} (${rate(n("fire_locked"), n("idea_submit"))})`, "입력 → '이 불로 할래!'"],
    ["평균 장작 수", n("fire_locked") ? (n("chip_pick") / n("fire_locked")).toFixed(1) : "-", "chip_pick ÷ fire_locked"],
    ["공유", `${n("share_done")} (${rate(n("share_done"), n("fire_locked"))})`, "share_done ÷ fire_locked"],
    ["대기 신청", `${waitlist.length} (${rate(n("waitlist_join"), n("fire_locked"))})`, "waitlist_join ÷ fire_locked"],
    ["추천 계수", waitlist.length ? (referred / waitlist.length).toFixed(2) : "-", "추천으로 들어온 가입 ÷ 전체 가입"]
  ];
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, fontSize: 13 }}>
      <h1 style={{ fontSize: 22 }}>도깨비불 찾기 운영</h1>
      <p className="muted">저장소: {storageKind() === "postgres" ? "Postgres" : "로컬 파일(.data/find.json) — 배포 전 DATABASE_URL 필요"} · <a href="/api/admin/find/export">대기 명단 CSV 내려받기</a> · <a href="/find">페이지 열기</a></p>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, margin: "16px 0 24px" }}>
        {metrics.map(([label, value, hint]) => (
          <div key={label} style={{ background: "#fafbf9", border: "1px solid var(--line)", borderRadius: 10, padding: 12 }}>
            <div className="muted" style={{ fontSize: 11 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, margin: "4px 0" }}>{value}</div>
            <div className="muted" style={{ fontSize: 10 }}>{hint}</div>
          </div>
        ))}
      </section>
      <h2 style={{ fontSize: 16 }}>대기 명단 ({waitlist.length})</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", background: "white" }}>
          <thead><tr>{["신청", "이메일", "처음 문장", "화력", "초대 코드", "추천인", "소식 동의", "쿠폰"].map((h) => <th key={h} style={{ textAlign: "left", borderBottom: "1px solid var(--line)", padding: 6 }}>{h}</th>)}</tr></thead>
          <tbody>
            {waitlist.slice().reverse().map((w) => (
              <tr key={w.id}>
                <td style={{ padding: 6, whiteSpace: "nowrap" }}>{w.createdAt.slice(0, 16).replace("T", " ")}</td>
                <td style={{ padding: 6 }}>{w.email}</td>
                <td style={{ padding: 6, maxWidth: 280 }}>{w.idea ?? "-"}</td>
                <td style={{ padding: 6 }}>{w.peakFire ?? "-"}</td>
                <td style={{ padding: 6 }}>{w.referralCode}</td>
                <td style={{ padding: 6 }}>{w.referredBy ?? "-"}</td>
                <td style={{ padding: 6 }}>{w.marketingConsent ? "예" : "아니오"}</td>
                <td style={{ padding: 6 }}><CouponToggle id={w.id} sentAt={w.couponSentAt} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 style={{ fontSize: 16, marginTop: 24 }}>이벤트 수</h2>
      <p className="muted">{Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ") || "아직 없음"}</p>
    </main>
  );
}
