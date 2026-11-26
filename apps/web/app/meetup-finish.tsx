"use client";
import { useRef, useState } from "react";
import type { LocalProject } from "../lib/project-types";

// ── MEETUP: 2026-11-28 밋업 시연 전용 (lib/meetup.ts 참고). 밋업이 끝나면 지운다 ──
// 대장간에 들어온 시연용 프로젝트의 입력칸 위에 뜨는 '완성 🎉' 버튼.
// 누르면 색종이가 날리고, 대장 달그락이 축하 인사와 아이디어별 조언을 편지로 보낸다.

type RelayEvent = { type: "delta" | "status" | "done" | "error"; text?: string; message?: string };
const COLORS = ["#ff8a5c", "#94d2c9", "#ffd166", "#9da2df", "#f7a8c4", "#b9d98a"];

export default function MeetupFinish({ project, channel, onProject }: { project: LocalProject; channel: string; onProject: (p: LocalProject) => void }) {
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState("");
  const [party, setParty] = useState(0);
  const [note, setNote] = useState("");
  const running = useRef(false);
  const ideas = project.meetup?.ideas.length ?? 0;
  const done = !!project.meetup?.finishedAt;

  const post = async (fallback: boolean) => {
    const r = await fetch("/api/meetup/finish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: project.id, channel: channel === "chief" ? "chief" : "main", ...(fallback ? { fallback: true } : {}) }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok || !b.project) throw new Error(b.error ?? "지금은 보내지 못했어요.");
    return b as { jobId: string | null; project: LocalProject };
  };
  const reload = async () => {
    const b = await fetch("/api/projects", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const fresh = (b?.projects as LocalProject[] | undefined)?.find((p) => p.id === project.id);
    if (fresh) onProject(fresh);
  };
  const follow = async (jobId: string) => {
    let from = 0, shown = "";
    for (let misses = 0, turns = 0; turns < 600; turns++) {
      const res = await fetch(`/api/helper/jobs/${jobId}?from=${from}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) { if (++misses > 5 || res?.status === 404) throw new Error("끊겼어요"); await new Promise((x) => setTimeout(x, 1500)); continue; }
      misses = 0;
      const body = await res.json() as { events: RelayEvent[]; next: number; finished: boolean };
      from = body.next;
      for (const e of body.events) {
        if (e.type === "delta") { shown += e.text ?? ""; setLive(shown); }
        else if (e.type === "error") throw new Error(e.message ?? "답을 받지 못했어요");
        else if (e.type === "done") return;
      }
      if (body.finished) return;
    }
  };

  async function finish() {
    if (running.current) return;
    running.current = true; setBusy(true); setNote(""); setLive(""); setParty((n) => n + 1);
    try {
      const first = await post(false);
      onProject(first.project);
      if (first.jobId) {
        try { await follow(first.jobId); await reload(); }
        catch { const second = await post(true); onProject(second.project); }
      }
    } catch (e) { setNote(e instanceof Error ? e.message : "지금은 보내지 못했어요."); }
    finally { running.current = false; setBusy(false); setLive(""); }
  }

  return (
    <div className="meetup-finish">
      <style>{`
        .meetup-finish{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 10px;padding:10px 12px;border:2px solid var(--ink,#232323);border-radius:14px;background:#fff6d8;box-shadow:3px 3px 0 var(--ink,#232323)}
        .meetup-finish button{border:2px solid var(--ink,#232323);border-radius:999px;background:#ff8a5c;color:#232323;font-weight:800;font-size:16px;padding:8px 18px;box-shadow:2px 2px 0 var(--ink,#232323);cursor:pointer}
        .meetup-finish button:disabled{opacity:.6;cursor:default}
        .meetup-finish small{color:#5d574c;font-size:12.5px;line-height:1.45;flex:1;min-width:180px}
        .meetup-finish .letter{flex-basis:100%;margin:0;padding:10px 12px;border-radius:10px;background:#fffdf8;border:1.5px dashed var(--ink,#232323);font-size:14px;line-height:1.6;white-space:pre-wrap;max-height:38vh;overflow:auto}
        .meetup-confetti{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:9999}
        .meetup-confetti i{position:absolute;top:-24px;width:10px;height:16px;border-radius:2px;animation:meetup-fall linear forwards}
        @keyframes meetup-fall{to{transform:translateY(112vh) rotate(720deg);opacity:.9}}
        @media (prefers-reduced-motion:reduce){.meetup-confetti{display:none}}
      `}</style>
      <button type="button" disabled={busy} onClick={() => void finish()}>{busy ? "편지 쓰는 중…" : done ? "완성 🎉 한 번 더" : "완성 🎉"}</button>
      <small>{note || (busy ? "대장 달그락이 편지를 쓰고 있어요." : `현장 아이디어 ${ideas}개가 적혀 있어요. 다 만들었으면 눌러요. 대장 달그락이 아이디어마다 조언을 편지로 보내요.`)}</small>
      {busy && live && <p className="letter" aria-live="polite">{live}</p>}
      {party > 0 && <div className="meetup-confetti" key={party} aria-hidden>{Array.from({ length: 70 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, background: COLORS[i % COLORS.length], animationDuration: `${2.2 + ((i * 13) % 20) / 10}s`, animationDelay: `${((i * 7) % 12) / 10}s` }} />)}</div>}
    </div>
  );
}
