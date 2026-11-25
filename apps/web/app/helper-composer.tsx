"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { LocalProject } from "../lib/project-types";

// 달그락 도우미(내 컴퓨터에서 도는 앱)가 켜져 있으면 여기서 바로 대화한다.
// 답은 도우미가 내 ChatGPT 요금제로 만들고, 이 화면은 그 답을 흘려 받아 보여준다.
// 도우미가 꺼져 있으면 기록과 설계는 그대로 보이고, 켜는 방법만 안내한다.

type Status = { online: boolean; model: string | null; account: string | null };
type RelayEvent = { type: "delta"; text: string } | { type: "status"; text: string } | { type: "done"; text: string } | { type: "error"; code: string; message: string };
const USAGE_URL = "https://chatgpt.com/settings/usage";
export const HELPER_REPO_URL = "https://github.com/1dyne/dalgrak-helper";

export default function HelperComposer({ project, channel, placeholder, onProject, onFinished }: {
  project: LocalProject | null;
  channel: string;
  placeholder: string;
  /** 내가 보낸 말이 기록된 프로젝트를 바로 반영한다 */
  onProject: (project: LocalProject) => void;
  /** 답이 끝났다. 프로젝트 목록을 다시 읽는다(새 프로젝트가 생겼을 수 있다) */
  onFinished: (hadProject: boolean) => Promise<void> | void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState("");
  const [step, setStep] = useState("");
  const [error, setError] = useState<{ message: string; usage: boolean } | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => fetch("/api/helper/status", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((s) => { if (alive.current && s) setStatus(s); }).catch(() => {}).finally(() => { if (alive.current) timer = setTimeout(check, document.hidden ? 20_000 : 8_000); });
    void check();
    return () => { alive.current = false; clearTimeout(timer); };
  }, []);

  async function follow(jobId: string) {
    let from = 0;
    let shown = "";
    for (let misses = 0; alive.current;) {
      const response = await fetch(`/api/helper/jobs/${jobId}?from=${from}`, { cache: "no-store" }).catch(() => null);
      if (!response?.ok) { if (++misses > 5 || response?.status === 404) throw new Error("답변을 이어 받지 못했어요. 화면을 새로고침해 기록을 확인해주세요."); await new Promise((r) => setTimeout(r, 1500)); continue; }
      misses = 0;
      const body = await response.json() as { events: RelayEvent[]; next: number; finished: boolean };
      from = body.next;
      for (const event of body.events) {
        if (event.type === "delta") { shown += event.text; setLive(shown); setStep(""); }
        else if (event.type === "status") setStep(event.text);
        else if (event.type === "error") throw Object.assign(new Error(event.message), { code: event.code });
        else if (event.type === "done") return;
      }
      if (body.finished) return;
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true); setError(null); setLive(""); setStep("달그락 도우미에게 전하는 중");
    try {
      const response = await fetch("/api/helper/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: project?.id ?? null, text: message, channel }) });
      if (response.status === 401) { window.location.assign("/login"); return; }
      const body = await response.json();
      if (!response.ok) { if (body.code === "offline") setStatus((s) => ({ online: false, model: s?.model ?? null, account: s?.account ?? null })); throw new Error(body.error ?? "보내지 못했어요."); }
      setText("");
      if (body.project) onProject(body.project);
      await follow(body.jobId);
      await onFinished(!!project);
    } catch (caught) {
      const code = (caught as { code?: string }).code ?? "";
      setError({ message: caught instanceof Error ? caught.message : "답변을 받지 못했어요.", usage: code.includes("usage") });
      await onFinished(!!project);
    } finally {
      if (alive.current) { setBusy(false); setLive(""); setStep(""); }
    }
  }

  if (!status) return <div className="connector-composer"><p>연결 상태를 확인하고 있어요…</p></div>;
  if (!status.online) return <div className="connector-composer">
    <strong>컴퓨터의 달그락 도우미를 켜면 여기서 바로 대화할 수 있어요</strong>
    <p>도우미는 내 컴퓨터에서 도는 작은 앱이에요. 내 ChatGPT 요금제로 답을 만들고, 대화는 이 화면에서 해요. 켜 둔 동안에는 휴대폰에서도 이어서 대화할 수 있어요.</p>
    <p>지금도 기록·설계·파일 보기, 승인, 구매·측정 기록은 여기서 그대로 할 수 있어요. <a href={HELPER_REPO_URL} target="_blank" rel="noreferrer noopener">도우미 설치 방법</a></p>
  </div>;
  return <>
    {(busy || error) && <div className="helper-live" aria-live="polite">
      {live && <p className="helper-live-text">{live}</p>}
      {busy && <p className="helper-live-step">{step || (live ? "이어서 쓰는 중" : "생각하고 있어요")}…</p>}
      {error && <p role="alert" className="helper-live-error">{error.message} {error.usage && <a href={USAGE_URL} target="_blank" rel="noreferrer noopener">사용량 관리</a>} <button type="button" onClick={() => setError(null)}>닫기</button></p>}
    </div>}
    <form className="composer" onSubmit={submit}>
      <textarea value={text} aria-label={project ? "채팅 메시지" : "아이디어 입력"} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busy) void submit(e); } }} disabled={busy} />
      <div className="composer-tools">
        <span className="composer-hint">ChatGPT 요금제 사용 중{status.model ? ` · ${status.model}` : ""} · <a href={USAGE_URL} target="_blank" rel="noreferrer noopener">사용량 관리</a></span>
        <button type="submit" className="send" aria-label="메시지 보내기" disabled={busy || !text.trim()}>↑</button>
      </div>
    </form>
  </>;
}
