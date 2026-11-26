"use client";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { LocalProject } from "../lib/project-types";
import TerminalHelp from "./terminal-help";

// 달그락 연결 앱(내 컴퓨터에서 도는 앱)가 켜져 있으면 여기서 바로 대화한다.
// 답은 연결 앱이 내 ChatGPT 요금제로, 또는 내 컴퓨터의 Claude Code(내 Claude 구독)로 만들고, 이 화면은 그 답을 흘려 받는다.
// 흘러오는 답은 입력창이 아니라 대화 목록에 그린다(onLive). 입력창은 입력만 맡는다.

type Model = { slug: string; name: string };
type Status = { online: boolean; model: string | null; account: string | null; models?: Model[] };
type RelayEvent = { type: "delta"; text: string } | { type: "status"; text: string } | { type: "done"; text: string } | { type: "error"; code: string; message: string };
export type HelperLive = { user: string; text: string; step: string };
export type HelperTurn = { user: string; assistant: string | null; error: string | null; hadProject: boolean };
const USAGE_URL = "https://chatgpt.com/settings/usage";
export const HELPER_REPO_URL = "https://github.com/1dyne/dalgrak-helper";
export const HELPER_COMMAND = "npx github:1dyne/dalgrak-helper";
const MODEL_KEY = "forge-helper-model";
type Photo = { name: string; dataUrl: string };
const MAX_PHOTOS = 3;
const CLAUDE_INSTALL = "npm install -g @anthropic-ai/claude-code";
const CLAUDE_LOGIN = "claude";
/** 보내지 못한 말. 다시 보내기를 누르면 그대로 다시 보낸다 */
type Failed = { message: string; usage: boolean; code: string; text: string; photos: Photo[] };

// 휴대폰 사진은 몇 MB씩 된다. 긴 변을 1,280px로 줄여 JPEG로 바꿔 보낸다.
async function shrink(file: File): Promise<Photo> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const el = new Image(); el.onload = () => resolve(el); el.onerror = () => reject(new Error("사진을 읽지 못했어요.")); el.src = url; });
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("사진을 읽지 못했어요.");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { name: file.name.slice(0, 120) || "사진", dataUrl: canvas.toDataURL("image/jpeg", 0.82) };
  } finally { URL.revokeObjectURL(url); }
}

function CopyRow({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return <span className="copy-row"><code>{text}</code><button type="button" className="copy-button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>{done ? "복사됨" : "복사"}</button></span>;
}

export default function HelperComposer({ project, channel, speaker, placeholder, suggestion, onProject, onLive, onTurnEnd }: {
  /** 지금 이 방에서 답하는 달그락의 이름 (예: 대장 달그락) */
  speaker: string;
  project: LocalProject | null;
  channel: string;
  placeholder: string;
  /** 다음에 할 법한 말. 입력창이 비어 있을 때 흐린 글자로 보이고, 입력창을 한 번 누르면 그대로 채워진다 */
  suggestion?: string | null;
  /** 내가 보낸 말이 기록된 프로젝트를 바로 반영한다 */
  onProject: (project: LocalProject) => void;
  /** 답이 흘러오는 동안의 모습. 끝나면 null */
  onLive: (live: HelperLive | null) => void;
  /** 한 턴이 끝났다. 프로젝트 목록을 다시 읽고, 프로젝트가 없던 대화는 화면에 남긴다 */
  onTurnEnd: (turn: HelperTurn) => Promise<void> | void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; usage: boolean } | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [terminal, setTerminal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const [model, setModel] = useState<string | null>(null);
  const alive = useRef(true);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    alive.current = true;
    try { setModel(localStorage.getItem(MODEL_KEY)); } catch { /* 저장소 없이도 된다 */ }
    let timer: ReturnType<typeof setTimeout>;
    const check = () => fetch("/api/helper/status", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((s) => { if (alive.current && s) setStatus(s); }).catch(() => {}).finally(() => { if (alive.current) timer = setTimeout(check, document.hidden ? 20_000 : 8_000); });
    void check();
    return () => { alive.current = false; clearTimeout(timer); };
  }, []);

  // 입력창은 쓴 만큼만 자란다. 사람이 높이를 끌어 맞출 일이 없게.
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.4))}px`;
  }, [text, status?.online]);

  const models = status?.models ?? [];
  const chosen = models.find((m) => m.slug === model)?.slug ?? status?.model ?? null;
  const pickModel = (slug: string) => { setModel(slug); try { localStorage.setItem(MODEL_KEY, slug); } catch { /* 이번 화면에서만 기억 */ } };

  async function addPhotos(files: FileList | File[] | null) {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    try {
      const made = await Promise.all(list.slice(0, MAX_PHOTOS).map(shrink));
      setPhotos((before) => [...before, ...made].slice(0, MAX_PHOTOS));
      if (photos.length + list.length > MAX_PHOTOS) setError({ message: `사진은 한 번에 ${MAX_PHOTOS}장까지 보낼 수 있어요.`, usage: false });
    } catch (caught) { setError({ message: caught instanceof Error ? caught.message : "사진을 읽지 못했어요.", usage: false }); }
  }

  async function follow(jobId: string, user: string): Promise<string> {
    let from = 0;
    let shown = "";
    for (let misses = 0; alive.current;) {
      const response = await fetch(`/api/helper/jobs/${jobId}?from=${from}`, { cache: "no-store" }).catch(() => null);
      if (!response?.ok) { if (++misses > 5 || response?.status === 404) throw new Error("답변을 이어 받지 못했어요. 화면을 새로고침해 기록을 확인해주세요."); await new Promise((r) => setTimeout(r, 1500)); continue; }
      misses = 0;
      const body = await response.json() as { events: RelayEvent[]; next: number; finished: boolean };
      from = body.next;
      for (const event of body.events) {
        if (event.type === "delta") { shown += event.text; onLive({ user, text: shown, step: "" }); }
        else if (event.type === "status") onLive({ user, text: shown, step: event.text });
        else if (event.type === "error") throw Object.assign(new Error(event.message), { code: event.code, partial: shown });
        else if (event.type === "done") return event.text || shown;
      }
      if (body.finished) return shown;
    }
    return shown;
  }

  async function submit(e: FormEvent | null, again: Failed | null = null) {
    e?.preventDefault();
    const message = again ? again.text : text.trim() || (photos.length ? "이 사진을 봐주세요." : "");
    if (!message || busy) return;
    const sending = again ? again.photos : photos;
    setFailed(null);
    const hadProject = !!project;
    setBusy(true); setError(null);
    onLive({ user: message, text: "", step: `${speaker}에게 전하는 중` });
    try {
      const response = await fetch("/api/helper/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: project?.id ?? null, text: message, channel, ...(chosen ? { model: chosen } : {}), ...(sending.length ? { images: sending } : {}), ...(again ? { retry: true } : {}) }) });
      if (response.status === 401) { window.location.assign("/login"); return; }
      const body = await response.json();
      if (!response.ok) { if (body.code === "offline") setStatus((s) => ({ ...(s ?? { model: null, account: null }), online: false })); throw Object.assign(new Error(body.error ?? "보내지 못했어요."), { code: body.code ?? "" }); }
      if (!again) { setText(""); setPhotos([]); }
      if (body.project) onProject(body.project);
      const answer = await follow(body.jobId, message);
      await onTurnEnd({ user: message, assistant: answer, error: null, hadProject });
    } catch (caught) {
      const code = (caught as { code?: string }).code ?? "";
      const message2 = caught instanceof Error ? caught.message : "답변을 받지 못했어요.";
      // 보내지 못한 말은 버리지 않는다. 전송 실패로 남기고 다시 보낼 수 있게 한다.
      setFailed({ message: message2, usage: code.includes("usage"), code, text: message, photos: sending });
      if (!again) { setText(""); setPhotos([]); }
      await onTurnEnd({ user: message, assistant: (caught as { partial?: string }).partial || null, error: message2, hadProject });
    } finally {
      onLive(null);
      if (alive.current) setBusy(false);
    }
  }

  if (!status) return <div className="connector-composer"><p>연결 상태를 확인하고 있어요…</p></div>;
  if (!status.online) return <div className="connector-composer">
    <strong>달그락 연결 앱이 꺼져 있어요 · 켜면 여기서 바로 대화할 수 있어요</strong>
    <p>내 컴퓨터의 <button type="button" className="term-link" onClick={() => setTerminal(HELPER_COMMAND)}>터미널(윈도우는 PowerShell)</button>에 아래를 붙여넣고 Enter를 누르세요. 전에 로그인했다면 다시 묻지 않고 바로 켜져요. “준비됐어요”가 뜨면 이 화면이 몇 초 안에 입력창으로 바뀌어요.</p>
    <div className="copy-row"><code>{HELPER_COMMAND}</code><button type="button" className="copy-button" onClick={() => { void navigator.clipboard?.writeText(HELPER_COMMAND).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? "복사됨" : "복사"}</button></div>
    <p>터미널 창을 닫으면 연결 앱도 꺼져요. 대화하는 동안에는 켜 두세요. 꺼져 있어도 기록·설계·파일 보기, 승인, 구매·측정 기록은 여기서 그대로 할 수 있어요. <a href={HELPER_REPO_URL} target="_blank" rel="noreferrer noopener">처음 설치하는 방법 · 더블클릭으로 켜는 파일 받기</a></p>
    {terminal && <TerminalHelp command={terminal} onClose={() => setTerminal(null)} />}
  </div>;
  return <>
    {failed && <div role="alert" className="send-failed">
      <div className="send-failed-head"><b>전송 실패</b><span className="send-failed-text" title={failed.text}>{failed.text}</span><button type="button" className="retry" disabled={busy} onClick={() => void submit(null, failed)}>↻ 다시 보내기</button><button type="button" className="link-button" onClick={() => setFailed(null)}>지우기</button></div>
      <p>{failed.message} {failed.usage && <a href={USAGE_URL} target="_blank" rel="noreferrer noopener">사용량 관리</a>}</p>
      {(failed.code === "claude_signed_out" || failed.code === "claude_missing") && <ol className="fix-steps">
        <li>내 컴퓨터에서 <button type="button" className="term-link" onClick={() => setTerminal(failed.code === "claude_missing" ? CLAUDE_INSTALL : CLAUDE_LOGIN)}>터미널(윈도우는 PowerShell)</button>을 새로 하나 열어요. 달그락 연결 앱이 켜져 있는 창은 그대로 두세요.</li>
        {failed.code === "claude_missing" && <li>아래를 붙여넣고 Enter를 눌러 Claude Code를 설치해요.<CopyRow text={CLAUDE_INSTALL} /></li>}
        <li>아래를 붙여넣고 Enter를 눌러요. 로그인 안내가 나오면 브라우저에서 Claude 계정으로 로그인해요.<CopyRow text={CLAUDE_LOGIN} /></li>
        <li>“무엇을 도와드릴까요” 같은 입력 줄이 보이면 로그인된 거예요. 그 창은 닫아도 돼요. 여기로 돌아와 <b>다시 보내기</b>를 눌러요.</li>
      </ol>}
      {failed.code === "offline" && <p>컴퓨터에서 <button type="button" className="term-link" onClick={() => setTerminal(HELPER_COMMAND)}>터미널</button>을 열고 아래를 붙여넣어 연결 앱을 켠 뒤 다시 보내주세요.<CopyRow text={HELPER_COMMAND} /></p>}
    </div>}
    {terminal && <TerminalHelp command={terminal} onClose={() => setTerminal(null)} />}
    {error && <p role="alert" className="helper-live-error">{error.message} {error.usage && <a href={USAGE_URL} target="_blank" rel="noreferrer noopener">사용량 관리</a>} <button type="button" onClick={() => setError(null)}>닫기</button></p>}
    <form className="composer helper-composer" onSubmit={submit} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); void addPhotos(e.dataTransfer.files); } }}>
      {photos.length > 0 && <div className="photo-strip">{photos.map((photo, index) => <span key={index} className="photo-chip"><img src={photo.dataUrl} alt={photo.name} /><button type="button" aria-label={`${photo.name} 빼기`} onClick={() => setPhotos((before) => before.filter((_, i) => i !== index))}>×</button></span>)}</div>}
      <textarea ref={box} rows={1} value={text} aria-label={project ? "채팅 메시지" : "아이디어 입력"} placeholder={busy ? `${speaker}이 답하는 중이에요…` : suggestion ?? placeholder} title={suggestion && !text ? "한 번 누르면 이 문장이 입력돼요" : undefined} onClick={() => { if (!text && suggestion && !busy) setText(suggestion); }} onChange={(e) => setText(e.target.value)} onPaste={(e) => { const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/")); if (files.length) { e.preventDefault(); void addPhotos(files); } }} onKeyDown={(e) => { if (e.key === "Tab" && !e.shiftKey && !text && suggestion) { e.preventDefault(); setText(suggestion); return; } if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busy) void submit(e); } }} disabled={busy} />
      <div className="composer-tools">
        <input ref={picker} type="file" accept="image/*" multiple hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
        <button type="button" className="attach" aria-label="사진 붙이기" title="사진 붙이기 (최대 3장) — 만든 것, 부품, 손그림을 보여주세요" disabled={busy || photos.length >= MAX_PHOTOS} onClick={() => picker.current?.click()}>＋</button>
        {chosen?.startsWith("claude:")
          ? <span className="composer-hint" title="내 컴퓨터에 깔린 Claude Code가 내 Claude 구독으로 답해요">Claude 구독 사용 중 · 내 컴퓨터의 Claude Code</span>
          : <span className="composer-hint">ChatGPT 요금제 사용 중 · <a href={USAGE_URL} target="_blank" rel="noreferrer noopener">사용량 관리</a></span>}
        {models.length > 1
          ? <select className="model-select" aria-label="모델 선택" value={chosen ?? ""} disabled={busy} onChange={(e) => pickModel(e.target.value)}>{models.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}</select>
          : chosen && <span className="composer-hint">{chosen}</span>}
        <button type="submit" className="send" aria-label="메시지 보내기" disabled={busy || (!text.trim() && !photos.length)}>↑</button>
      </div>
    </form>
  </>;
}
