"use client";
import { useEffect, useState } from "react";
import type { DevProfile, LocalProject } from "../lib/project-types";
import { CODING_EXPERIENCE, DEV_INSTALL_OPTIONS, DEV_TOOLS, projectInstructions, devProfileMissing, devSetupSteps, emptyDevProfile } from "../lib/dev-handoff";
import { workbenchDownloadUrl } from "../lib/workbench";
import { workflowFor } from "../lib/workflow";
import { AI_CLIENTS, aiClient, type AiClientId } from "../lib/ai-clients";
import { IconLaptop, IconLink } from "./icons";

type Me = { kind: "operator" | "user"; connectorUrl: string | null; clients: Array<{ name: string; version: string; lastSeenAt: string }> };

function clientLabel(name: string) {
  if (/dalgrak-helper/i.test(name)) return "달그락 도우미";
  if (/codex/i.test(name)) return "Codex";
  if (/claude[-_ ]?code/i.test(name)) return "Claude Code";
  if (/claude/i.test(name)) return "Claude 앱";
  return name;
}
function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return minutes < 1 ? "방금" : minutes < 60 ? `${minutes}분 전` : minutes < 1440 ? `${Math.round(minutes / 60)}시간 전` : `${Math.round(minutes / 1440)}일 전`;
}

function Copy({ value, label = "복사" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="copy-button" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>{done ? "복사됨" : label}</button>;
}

export default function ConnectPanel({ project, tab, busy, onClose, onAccount }: {
  project: LocalProject; tab: "ai" | "dev"; busy: boolean;
  onTab: (tab: "ai" | "dev") => void; onClose: () => void; onAction: (input: Record<string, unknown>) => void; onAccount: () => void;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const workflow = workflowFor(project);
  const [dev, setDev] = useState<DevProfile>(workflow.devProfile ?? emptyDevProfile());
  const [editing, setEditing] = useState(false);
  const [client, setClient] = useState<AiClientId>("claude");
  const picked = aiClient(client);
  useEffect(() => {
    const load = () => fetch("/api/me", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((b) => b && setMe(b)).catch(() => {});
    void load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);
  const saved = workflow.devProfile ?? emptyDevProfile();
  const missing = devProfileMissing(saved);
  const specFiles = (project.workspaceFiles ?? []).filter((file) => file.agent === "sw" && ["SPEC.md", "CLAUDE.md", "AGENTS.md"].includes(file.filename));
  const codingClients = (me?.clients ?? []).filter((client) => /codex|claude[-_ ]?code/i.test(client.name));
  const instructions = projectInstructions(project);
  const steps = devSetupSteps(saved, project, me?.connectorUrl ?? null);
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="profile-modal connect-modal" role="dialog" aria-modal="true" aria-label="연결" onClick={(e) => e.stopPropagation()}>
      <header><h2>개발 연결 · {project.name}</h2><button aria-label="닫기" onClick={onClose}>×</button></header>


      {tab === "ai" && <>
        <p>달그락과의 대화는 내가 쓰는 AI에서 해요. 정리된 내용만 이 프로젝트에 쌓입니다.</p>
        <fieldset><legend>어떤 AI를 쓰시나요?</legend><div className="choice-row">{AI_CLIENTS.map(c =>
          <label key={c.id} className={client === c.id ? "on" : ""}><input type="radio" name="aiclient" checked={client === c.id} onChange={() => setClient(c.id)} />{c.label}</label>)}</div></fieldset>
        <p>{picked.intro}</p>
        {!picked.verified && <p className="notice">아직 저희가 직접 붙여보고 확인한 도구는 아니에요. 안 되면 알려주시면 고칠게요.</p>}
        {picked.caution && <p className="notice">{picked.caution}</p>}
        {me?.connectorUrl ? <>
          <ol className="connect-steps">{picked.steps.map((step, index) => <li key={index}><strong>{step.title}</strong><p>{step.detail}</p>
            {step.command && <div className="copy-row"><code>{step.command.replace("{URL}", me.connectorUrl!)}</code><Copy value={step.command.replace("{URL}", me.connectorUrl!)} /></div>}
          </li>)}</ol>
          <h3 className="connect-subtitle">커넥터 주소</h3>
          <div className="copy-row"><code>{me.connectorUrl}</code><Copy value={me.connectorUrl} /></div>
          <small className="muted">이 주소는 모두 같아서 남에게 보여도 괜찮아요. 내 기록은 허용 창을 거친 뒤에만 열려요.</small>
          <h3 className="connect-subtitle">「{project.name}」 전용 지침 문구</h3>
          <p className="muted">지금 열어 둔 프로젝트 「{project.name}」에만 기록이 쌓이도록 AI에게 먼저 주는 문구예요. 다른 프로젝트를 열면 그 프로젝트의 문구로 바뀌어요.</p>
          <pre className="instructions-box">{instructions}</pre><Copy value={instructions} label="지침 복사" />
        </> : <p>{me?.kind === "operator" ? "운영자 계정에는 커넥터 주소가 없어요. 참여자 관리에서 본인 이름으로 링크를 만들어 쓰세요." : "커넥터 주소를 불러오지 못했어요. 운영자에게 받은 주소를 사용해주세요."}</p>}
      </>}

      {tab === "dev" && <>
        {/* 같은 화면으로 비개발자와 개발자를 모두 맞추려다 둘 다 얕아졌다. 들머리에서 갈라
            설명의 깊이를 바꾼다. 기능을 숨기지는 않는다 — 실력이 늘면 계정에서 고치면 되고,
            숨겨두면 늘어난 사람이 갇힌 느낌을 받는다. */}
        <p>{saved.codingExperience === "independent"
          ? "SW 달그락이 명세서(SPEC.md·CLAUDE.md·AGENTS.md)를 만들어 둡니다. 내려받아 Claude Code나 Codex에서 바로 시작하세요."
          : saved.codingExperience === "guided"
          ? "SW 달그락이 명세서를 만들고, 설치와 연결은 순서대로 짚어드려요. 막히는 곳은 그대로 알려주시면 됩니다."
          : "소프트웨어가 필요하면 SW 달그락이 명세서를 만들고, 실제 코드는 Claude Code나 Codex에서 함께 만들어요. 처음이어도 괜찮아요. 설치부터 한 줄씩 같이 갑니다."}</p>
        <div className="dev-summary">
          <span>{saved.codingExperience === "unanswered" ? "코딩 경험을 아직 안 적었어요" : CODING_EXPERIENCE[saved.codingExperience]} · {DEV_TOOLS[saved.tool]} · {{ unanswered: "컴퓨터 종류 미정", mac: "Mac", windows: "Windows", linux: "Linux" }[saved.os]}</span>
          <button onClick={onAccount}>내 계정에서 {missing.length ? "채우기" : "고치기"}</button>
          <small className="muted">{missing.length ? `맞춤 설치 순서를 보려면 내 계정 · 경험에 ${missing.join(" · ")}을(를) 적어주세요.` : "코딩 경험과 컴퓨터 환경은 내 계정에 있어서 다음 프로젝트에서는 다시 묻지 않아요."}</small>
        </div>

        <h3 className="connect-subtitle">명세서</h3>
        {specFiles.length ? <div className="spec-files">{specFiles.map((file) => <a key={file.id} href={workbenchDownloadUrl(project.id, `file:${file.id}`)} download={file.filename}>↓ {file.filename}</a>)}</div>
          : <p className="muted">아직 없어요. Claude에게 “SW 명세서 만들어줘”라고 말하면 SW 달그락이 어떤 코드가 왜 필요한지 설명하고 SPEC.md·CLAUDE.md·AGENTS.md를 여기에 만들어요.</p>}

        {missing.length === 0 && <>
          <h3 className="connect-subtitle">설치와 연결 순서 · {DEV_TOOLS[saved.tool === "codex" ? "codex" : "claude_code"]}</h3>
          <ol className="connect-steps">{steps.map((step) => <li key={step.title}><strong>{step.title}</strong><p>{step.detail}</p>{step.command && <div className="copy-row"><code>{step.command}</code><Copy value={step.command} /></div>}</li>)}</ol>
        </>}

        <h3 className="connect-subtitle">연결 상태</h3>
        {codingClients.length ? <ul className="client-list">{codingClients.map((c) => <li key={c.name}><span className="online-dot" /> {clientLabel(c.name)} 연결됨 · 마지막 활동 {ago(c.lastSeenAt)}</li>)}</ul>
          : <p className="muted">아직 Claude Code나 Codex가 연결되지 않았어요. 위 순서대로 연결하면 여기에 표시돼요.</p>}
      </>}
    </section>
  </div>;
}
