"use client";
import { useState } from "react";
import type { LocalProject } from "../lib/project-types";

// Asks twice before a permanent delete: a plain warning, then the project's
// name typed back.
export default function DeleteProjectDialog({ project, used, limit, onClose, onDeleted }: { project: LocalProject; used: number; limit: number | null; onClose: () => void; onDeleted: (id: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmName: name }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      onDeleted(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제하지 못했어요.");
      setBusy(false);
    }
  }
  return <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
    <section className="profile-modal delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-warning" onClick={(e) => e.stopPropagation()}>
      <header><h2 id="delete-title">프로젝트 삭제</h2><button aria-label="닫기" disabled={busy} onClick={onClose}>×</button></header>
      <p id="delete-warning" className="danger-notice"><b>삭제하면 복구할 수 없어요.</b> ‘{project.name}’의 설계도, 회로, 3D 목업, 조립 가이드, 부품·할 일, 파일, 기록이 모두 지워지고 운영자도 되살릴 수 없어요. 필요한 파일은 먼저 작업대나 내 계정 → 내 기록 내려받기로 받아두세요.</p>
      {limit !== null && <p className="muted">지금 프로젝트 {used}/{limit}개 · 삭제하면 {used - 1}/{limit}개가 돼요.</p>}
      <label htmlFor="delete-confirm">확인을 위해 프로젝트 이름 <b>{project.name}</b>을(를) 그대로 입력해주세요.</label>
      <input id="delete-confirm" className="delete-input" value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} />
      {error && <p className="login-error" role="alert">{error}</p>}
      <div className="delete-actions"><button disabled={busy} onClick={onClose}>취소</button><button className="danger" disabled={busy || name.trim() !== project.name.trim()} onClick={() => void remove()}>{busy ? "삭제하는 중…" : "영구 삭제"}</button></div>
    </section>
  </div>;
}
