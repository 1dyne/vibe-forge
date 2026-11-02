"use client";
import { useEffect, useState } from "react";
import type { DevProfile, LocalProject } from "../lib/project-types";
import { CODING_EXPERIENCE, DEV_INSTALL_OPTIONS, DEV_TOOLS, claudeProjectInstructions, devProfileMissing, devSetupSteps, emptyDevProfile } from "../lib/dev-handoff";
import { workbenchDownloadUrl } from "../lib/workbench";
import { workflowFor } from "../lib/workflow";

type Me = { kind: "operator" | "user"; connectorUrl: string | null; clients: Array<{ name: string; version: string; lastSeenAt: string }> };

function clientLabel(name: string) {
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

export default function ConnectPanel({ project, tab, busy, onTab, onClose, onAction }: {
  project: LocalProject; tab: "claude" | "dev"; busy: boolean;
  onTab: (tab: "claude" | "dev") => void; onClose: () => void; onAction: (input: Record<string, unknown>) => void;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const workflow = workflowFor(project);
  const [dev, setDev] = useState<DevProfile>(workflow.devProfile ?? emptyDevProfile());
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
  const instructions = claudeProjectInstructions(project);
  const steps = devSetupSteps(saved, project, me?.connectorUrl ?? null);
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="profile-modal connect-modal" role="dialog" aria-modal="true" aria-label="연결" onClick={(e) => e.stopPropagation()}>
      <header><h2>{project.name}</h2><button aria-label="닫기" onClick={onClose}>×</button></header>
      <div className="connect-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "claude"} className={tab === "claude" ? "active" : ""} onClick={() => onTab("claude")}>🔗 Claude 연결</button>
        <button role="tab" aria-selected={tab === "dev"} className={tab === "dev" ? "active" : ""} onClick={() => onTab("dev")}>💻 개발 연결</button>
      </div>

      {tab === "claude" && <>
        <p>Claude 채팅에서 대화하고, 정리된 내용은 이 프로젝트에 쌓여요. Claude는 웹 검색으로 부품과 데이터시트를 찾고 출처를 함께 남겨요.</p>
        <ol className="connect-steps">
          <li><strong>커넥터 추가 (처음 한 번)</strong>
            {me?.connectorUrl ? <><p>claude.ai → 설정 → 커넥터 → 커스텀 커넥터 추가에 붙여넣어요.</p><div className="copy-row"><code>{me.connectorUrl}</code><Copy value={me.connectorUrl} /></div></>
              : <p>{me?.kind === "operator" ? "운영자 계정에는 커넥터 주소가 없어요. 참여자 관리에서 본인 이름으로 링크를 만들어 쓰세요." : "커넥터 주소를 불러오지 못했어요. 운영자에게 받은 주소를 사용해주세요."}</p>}
          </li>
          <li><strong>Claude 프로젝트 만들고 지침에 붙여넣기</strong>
            <p>claude.ai에서 이 아이디어용 프로젝트를 만들고, 프로젝트 지침(instructions)에 아래 문구를 붙여넣어요. 그 프로젝트의 모든 대화가 이 달그락 프로젝트에만 이어서 쌓여요.</p>
            <pre className="instructions-box">{instructions}</pre><Copy value={instructions} label="지침 복사" />
          </li>
          <li><strong>대화 시작</strong><p>그 Claude 프로젝트에서 새 대화를 열고 + 메뉴에서 달그락 대장간 커넥터를 켠 뒤 “이어서 하자”라고 말해요. 이 화면은 자동으로 새로고침돼요.</p></li>
        </ol>
      </>}

      {tab === "dev" && <>
        <p>소프트웨어가 필요하면 SW 달그락이 명세서를 만들고, 실제 코드는 Claude Code나 Codex에서 함께 만들어요. 처음이어도 괜찮아요. 아래 체크리스트로 설명 수준을 맞춰요.</p>
        <fieldset><legend>코딩 경험</legend>{(["none", "guided", "independent"] as const).map((v) => <label className="radio-option" key={v}><input type="radio" name="coding" checked={dev.codingExperience === v} onChange={() => setDev({ ...dev, codingExperience: v })} />{CODING_EXPERIENCE[v]}</label>)}</fieldset>
        <fieldset><legend>쓸 도구</legend><div className="choice-row">{(["claude_code", "codex", "undecided"] as const).map((v) => <label key={v} className={dev.tool === v ? "on" : ""}><input type="radio" name="tool" checked={dev.tool === v} onChange={() => setDev({ ...dev, tool: v })} />{DEV_TOOLS[v]}</label>)}</div><small className="muted">Claude Code는 Claude 구독, Codex는 ChatGPT 계정으로 써요. 모르겠으면 SW 달그락이 추천해요.</small></fieldset>
        <fieldset><legend>내 컴퓨터</legend><div className="choice-row">{(["mac", "windows", "linux"] as const).map((v) => <label key={v} className={dev.os === v ? "on" : ""}><input type="radio" name="os" checked={dev.os === v} onChange={() => setDev({ ...dev, os: v })} />{{ mac: "Mac", windows: "Windows", linux: "Linux" }[v]}</label>)}</div></fieldset>
        <fieldset><legend>이미 설치된 것</legend><div className="tool-checks">{DEV_INSTALL_OPTIONS.map((t) => <label key={t}><input type="checkbox" checked={dev.installed.includes(t)} onChange={(e) => setDev({ ...dev, confirmed: true, installed: e.target.checked ? [...dev.installed, t] : dev.installed.filter((x) => x !== t) })} />{t}</label>)}</div><label className="none-check"><input type="checkbox" checked={dev.confirmed && !dev.installed.length} onChange={(e) => setDev({ ...dev, installed: [], confirmed: e.target.checked })} />아무것도 설치하지 않았어요</label></fieldset>
        <button className="primary" disabled={busy} onClick={() => onAction({ action: "dev_profile", devProfile: dev })}>체크리스트 저장</button>
        {missing.length > 0 && <p className="muted">저장하면 맞춤 설치 순서가 나와요. 아직 필요한 것: {missing.join(" · ")}</p>}

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
