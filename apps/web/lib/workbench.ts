import type { LocalProject } from "./project-types";
import { workflowFor } from "./workflow";

export type WorkbenchItem = {
  id: string;
  filename: string;
  kind: "circuit" | "cad" | "firmware" | "file" | "bom" | "tasks" | "record";
  mimeType: string;
  content: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// Both the viewer and download route use these same documents, including old projects.
export function workbenchItems(project: LocalProject | null): WorkbenchItem[] {
  if (!project) return [];
  const workflow = workflowFor(project);
  const stem = project.name.replace(/[\\/:*?"<>|\r\n]/g, "-").slice(0, 80) || "project";
  const items: WorkbenchItem[] = (project.build?.artifacts ?? [])
    .filter(a => a.kind !== "cad" || Boolean(workflow.circuitApprovedAt))
    .map(a => ({ id: `artifact:${a.id}`, filename: a.filename, kind: a.kind, mimeType: a.mimeType, content: a.content }));
  for (const file of project.workspaceFiles ?? []) {
    items.push({ id: `file:${file.id}`, filename: file.filename, kind: "file", mimeType: /\.html?$/i.test(file.filename) ? "text/html; charset=utf-8" : "text/plain; charset=utf-8", content: file.content });
  }
  if (project.build?.blueprint.components.length) {
    const rows = project.build.blueprint.components.map(c => `<tr><td>${escapeHtml(c.ref)}</td><td>${escapeHtml(c.valueOrModel)}</td><td>${escapeHtml(c.reason)}</td><td>${escapeHtml(workflow.purchases[c.ref] ?? "needed")}</td></tr>`).join("");
    items.push({ id: "document:bom", filename: `${stem}-부품목록.html`, kind: "bom", mimeType: "text/html; charset=utf-8", content: `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${escapeHtml(project.name)} · 부품목록</title><style>body{font:14px/1.8 system-ui;padding:24px;color:#1f1f1f}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d8dcdb;padding:12px;text-align:left}th{background:#e5f3ee}</style><h1>${escapeHtml(project.name)} · 부품목록</h1><p>구매 전 정확한 모델·수량·가격·재고를 확인해주세요.</p><table><tr><th>참조</th><th>부품</th><th>용도</th><th>구매 상태</th></tr>${rows}</table></html>` });
  }
  if (project.tasks.length) {
    items.push({ id: "document:tasks", filename: `${stem}-작업목록.md`, kind: "tasks", mimeType: "text/markdown; charset=utf-8", content: `# ${project.name} · 작업목록\n\n${project.tasks.map(t => `- [${t.status === "completed" ? "x" : " "}] ${t.title}\n  ${t.plain}`).join("\n\n")}\n` });
  }
  if (workflow.sharedUpdates.length) {
    items.push({ id: "document:record", filename: `${stem}-팀기록.md`, kind: "record", mimeType: "text/markdown; charset=utf-8", content: `# ${project.name} · 팀 기록\n\n${workflow.sharedUpdates.map(u => `## ${u.agent} · ${u.createdAt}\n\n${u.text}`).join("\n\n")}\n` });
  }
  return items;
}

export function workbenchDownloadUrl(projectId: string, itemId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/workbench/${encodeURIComponent(itemId)}`;
}
