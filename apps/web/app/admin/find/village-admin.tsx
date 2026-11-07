"use client";
import { useState } from "react";

type Mail = { id: string; kind: string; body: string; status: string; reply: string | null; forgeId: string | null; screen: string; createdAt: string; notionSynced: boolean };
const KIND = { feature: "기능 제안", bug: "이상해요", decor: "꾸미기", chat: "한마디" } as Record<string, string>;
const STATUS = { new: "새 편지", reading: "읽는 중", planned: "반영 예정", done: "반영 완료", wontdo: "보류" } as Record<string, string>;

export function MailRow({ mail }: { mail: Mail }) {
  const [status, setStatus] = useState(mail.status);
  const [reply, setReply] = useState(mail.reply ?? "");
  const [saved, setSaved] = useState("");
  async function save() {
    const res = await fetch("/api/admin/find/mail", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: mail.id, status, reply: reply || null }) });
    setSaved(res.ok ? "저장" : "실패");
  }
  return (
    <tr>
      <td style={{ padding: 6, whiteSpace: "nowrap" }}>{mail.createdAt.slice(0, 16).replace("T", " ")}<br /><small>{KIND[mail.kind] ?? mail.kind}{mail.notionSynced ? " · 노션" : ""}</small></td>
      <td style={{ padding: 6, maxWidth: 360, whiteSpace: "pre-wrap" }}>{mail.body}<br /><small style={{ color: "#888" }}>{mail.screen}{mail.forgeId ? ` · 대장간 ${mail.forgeId}` : ""}</small></td>
      <td style={{ padding: 6 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input style={{ display: "block", marginTop: 4, width: 220 }} placeholder="답장 한 줄(반영 완료 때)" value={reply} onChange={(e) => setReply(e.target.value)} />
        <button type="button" style={{ marginTop: 4, fontSize: 12 }} onClick={save}>저장</button> <small>{saved}</small>
      </td>
    </tr>
  );
}

export function NoticeForm() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("update");
  const [msg, setMsg] = useState("");
  async function post() {
    const res = await fetch("/api/admin/find/notices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, body, kind }) });
    setMsg(res.ok ? "붙였어요. 새로고침하면 목록에 보여요." : (await res.json()).error ?? "실패");
    if (res.ok) { setTitle(""); setBody(""); }
  }
  return (
    <div style={{ display: "grid", gap: 6, maxWidth: 520 }}>
      <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="update">업데이트</option><option value="alley">새 골목</option><option value="fix">고친 것</option><option value="event">이벤트</option></select>
      <input placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="내용 (짧게)" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      <button type="button" onClick={post} disabled={!title || !body}>소식판에 붙이기</button>
      <small>{msg}</small>
    </div>
  );
}

export function SyncButton({ enabled }: { enabled: boolean }) {
  const [msg, setMsg] = useState("");
  if (!enabled) return <small style={{ color: "#996c22" }}>노션 연동 꺼짐 — Railway에 NOTION_TOKEN을 넣으면 켜져요. 그전 편지는 여기 쌓였다가 켜지면 노션으로 옮겨져요.</small>;
  return <><button type="button" style={{ fontSize: 12 }} onClick={async () => { const r = await fetch("/api/admin/find/sync", { method: "POST" }); const j = await r.json(); setMsg(r.ok ? `보냄 ${j.result?.pushed ?? 0} · 가져옴 ${j.result?.pulled ?? 0}` : j.error); }}>노션과 지금 맞추기</button> <small>{msg}</small></>;
}

export function PlanAdmin({ plans }: { plans: Array<{ id: number; title: string; status: string; fuel: number }> }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <div style={{ display: "grid", gap: 6, maxWidth: 560 }}>
      {plans.map((p) => (
        <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <b style={{ flex: 1 }}>{p.title}</b><small>장작 {p.fuel}</small>
          <select defaultValue={p.status} onChange={async (e) => { await fetch("/api/admin/find/plans", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: p.id, status: e.target.value }) }); setMsg("상태 바꿈"); }}>
            <option value="voting">투표 중</option><option value="building">짓는 중</option><option value="done">완공</option>
          </select>
        </div>
      ))}
      <input placeholder="새 후보 제목 (예: 밤 테마 골목)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input placeholder="짧은 설명 (선택)" value={desc} onChange={(e) => setDesc(e.target.value)} />
      <button type="button" disabled={!title} onClick={async () => { const r = await fetch("/api/admin/find/plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, description: desc }) }); setMsg(r.ok ? "올렸어요. 새로고침하면 보여요." : "실패"); if (r.ok) { setTitle(""); setDesc(""); } }}>후보 올리기</button>
      <small>{msg}</small>
    </div>
  );
}

export function ReportRow({ report }: { report: { id: number; forgeId: string; reason: string; resolved: boolean; at: string } }) {
  const [state, setState] = useState(report.resolved ? "처리됨" : "");
  const act = async (hide: boolean) => { const r = await fetch("/api/admin/find/reports", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: report.id, forgeId: report.forgeId, hide }) }); setState(r.ok ? (hide ? "숨김" : "처리됨") : "실패"); };
  return (
    <tr>
      <td style={{ padding: 6 }}>{report.at.slice(0, 16).replace("T", " ")}</td>
      <td style={{ padding: 6 }}><a href={`/f/${report.forgeId}`}>{report.forgeId}</a></td>
      <td style={{ padding: 6 }}>{report.reason}</td>
      <td style={{ padding: 6 }}>{state || <><button type="button" style={{ fontSize: 12 }} onClick={() => act(true)}>집 숨기기</button> <button type="button" style={{ fontSize: 12 }} onClick={() => act(false)}>문제없음</button></>}</td>
    </tr>
  );
}
