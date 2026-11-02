import type { BuildPlan, LocalProject } from "./project-types";
import { workflowFor } from "./workflow";

export type WorkbenchItem = {
  id: string;
  filename: string;
  kind: "product" | "assembly" | "plan" | "circuit" | "cad" | "firmware" | "file" | "bom" | "tasks" | "record";
  mimeType: string;
  content: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const won = (value: number | null | undefined) => value == null ? "가격 미정" : `${value.toLocaleString("ko-KR")}원`;
const BOARD: Record<BuildPlan["board"]["choice"], string> = { arduino: "아두이노", raspberry_pi: "라즈베리파이", pico: "라즈베리파이 피코", esp32: "ESP32", nuboard: "Nu보드", nu40: "누코드 NU40 DK", nu87: "누코드 NU87 Tiny DK", other: "기타" };
const CONNECTION: Record<BuildPlan["connection"]["method"], string> = { solder: "납땜", qwiic: "Qwiic", grove: "Grove", breadboard: "브레드보드·점퍼선 (연습)", perfboard: "퍼프보드 납땜 (실사용)", pcb: "PCB/PCBA (소형화·양산)", socket: "소켓·끼우기", mixed: "혼합" };
const VERDICT: Record<BuildPlan["cost"]["verdict"], string> = { within: "예산 안", tight: "예산 빠듯함", over: "예산 초과", unknown: "예산 미정" };

function planDocument(name: string, plan: BuildPlan): string {
  const e = escapeHtml;
  const rows = plan.modules.map(m => `<tr><td><b>${e(m.function)}</b></td><td>${e(m.part)}<p>${e(m.why)}</p></td><td>${e(m.connection)}</td><td>${e(m.whereToBuy)}<p class="k">검색어: ${e(m.searchKeyword)}</p></td><td class="n">${e(won(m.estPriceKRW))}</td><td>${e(m.difficulty)}</td></tr>`).join("");
  const gap = plan.cost.budgetKRW == null ? "" : ` · 예산 ${e(won(plan.cost.budgetKRW))} 대비 ${plan.cost.totalKRW - plan.cost.budgetKRW >= 0 ? "+" : ""}${e((plan.cost.totalKRW - plan.cost.budgetKRW).toLocaleString("ko-KR"))}원`;
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${e(name)} · 설계도</title><style>body{font:14px/1.75 system-ui,"Noto Sans KR",sans-serif;padding:20px;color:#1f1f1f;max-width:960px}h1{font-size:20px}h2{font-size:15px;margin-top:28px;border-bottom:1px solid #d8dcdb;padding-bottom:6px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #d8dcdb;padding:8px;text-align:left;vertical-align:top}th{background:#e5f3ee}td p{margin:4px 0 0;color:#5f6b66;font-size:12px}.k{color:#327b6d}.n{white-space:nowrap}.pill{display:inline-block;background:#e5f3ee;border-radius:5px;padding:2px 8px;font-size:12px;margin-right:6px}.warn{background:#f8edce}.bad{background:#f9e0dd}ol li{margin-bottom:12px}.box{background:#f4f7f5;border:1px solid #d8dcdb;border-radius:8px;padding:12px}</style>
<h1>${e(name)} · 대장의 설계도</h1><p><span class="pill">${plan.track === "software" ? "A · 소프트웨어" : plan.track === "both" ? "A+B · 소프트웨어+하드웨어" : "B · 하드웨어"}</span><span class="pill">${e(BOARD[plan.board.choice])} · ${e(plan.board.model)}</span><span class="pill">${e(CONNECTION[plan.connection.method])}</span></p><p>${e(plan.summary)}</p>
<h2>(1) 뇌·메인 보드</h2><p><b>${e(plan.board.model)}</b> — ${e(plan.board.why)}</p><p>다른 후보: ${e(plan.board.alternatives)}</p>
<h2>(2) 연결 방식</h2><p><b>${e(CONNECTION[plan.connection.method])}</b> — ${e(plan.connection.why)}</p>
<h2>(3) 기능별 부품 · 어디서 어떻게</h2><table><tr><th>기능</th><th>부품 · 왜</th><th>연결</th><th>어디서</th><th>예상 금액</th><th>난이도</th></tr>${rows}</table>
<p class="box"><b>예상 부품비 ${e(won(plan.cost.totalKRW))}</b>${gap} <span class="pill ${plan.cost.verdict === "over" ? "bad" : plan.cost.verdict === "tight" ? "warn" : ""}">${VERDICT[plan.cost.verdict]}</span><br>가격은 확인 시점 기준이며 배송비·예비 부품은 별도예요.${plan.cost.options.length ? `<br><b>병목을 푸는 방법</b><br>${plan.cost.options.map(o => `· ${e(o)}`).join("<br>")}` : ""}${plan.cost.marginNote ? `<br><b>판매 마진</b> ${e(plan.cost.marginNote)}` : ""}</p>
<h2>전체 구조</h2><ul>${plan.structure.map(s => `<li><b>${e(s.name)}</b>: ${e(s.role)} <span class="k">→ ${e(s.connectsTo)}</span></li>`).join("")}</ul>
${plan.prerequisites.length ? `<h2>먼저 익힐 것</h2><ol>${plan.prerequisites.map(p => `<li><b>${e(p.skill)}</b> (${e(p.timeEstimate)})<br>${e(p.why)}<br><span class="k">연습: ${e(p.practice)}</span></li>`).join("")}</ol>` : ""}
<h2>단계별 구현</h2><ol>${plan.stages.map(s => `<li><b>${e(s.title)}</b><br>목표: ${e(s.goal)}<br>배우는 것: ${e(s.learn)}<br>연습: ${e(s.practice)}<br>완료 기준: ${e(s.doneWhen)}${s.parts.length ? `<br><span class="k">부품: ${e(s.parts.join(", "))}</span>` : ""}</li>`).join("")}</ol>
<h2>외형 제작</h2><p>${plan.fabrication.needs3DPrint ? "3D 출력이 필요해요. " : ""}${e(plan.fabrication.plan)}</p>
${plan.risks.length ? `<h2>위험과 확인할 것</h2><ul>${plan.risks.map(r => `<li>${e(r)}</li>`).join("")}</ul>` : ""}
<p style="color:#757c7a;font-size:12px">${e(plan.updatedAt.slice(0, 16).replace("T", " "))} 저장 · 부품 구매 전 모델·가격·재고를 다시 확인해주세요.</p></html>`;
}

// Both the viewer and download route use these same documents, including old projects.
export function workbenchItems(project: LocalProject | null): WorkbenchItem[] {
  if (!project) return [];
  const workflow = workflowFor(project);
  const stem = project.name.replace(/[\\/:*?"<>|\r\n]/g, "-").slice(0, 80) || "project";
  const items: WorkbenchItem[] = [];
  if (project.productForm) items.push({ id: "document:product", filename: `${stem}-완성품.json`, kind: "product", mimeType: "application/json; charset=utf-8", content: JSON.stringify(project.productForm, null, 2) });
  if (project.assembly) {
    const g = project.assembly;
    items.push({ id: "document:assembly", filename: `${stem}-조립가이드.md`, kind: "assembly", mimeType: "text/markdown; charset=utf-8", content: `# ${project.name} · 조립 가이드\n\n${g.stage} · ${g.base.name} (${g.base.width}×${g.base.height}mm)\n\n${g.steps.map((s, i) => `## ${i + 1}. ${s.title}\n\n${s.action}\n\n${s.wires.map(w => `- ${w.from} → ${w.to}${w.label ? ` (${w.label})` : ""}`).join("\n")}\n\n확인: ${s.check}\n\n${s.cards.map(c => `> ⚠ ${c.symptom}\n> 확인: ${c.check}\n> 정상: ${c.expected}\n> 아니면: ${c.ifNot}`).join("\n\n")}`).join("\n\n")}\n` });
  }
  if (project.buildPlan) items.push(...[{ id: "document:plan", filename: `${stem}-설계도.html`, kind: "plan", mimeType: "text/html; charset=utf-8", content: planDocument(project.name, project.buildPlan) }] as WorkbenchItem[]);
  items.push(...(project.build?.artifacts ?? [])
    .filter(a => a.kind !== "cad" || Boolean(workflow.circuitApprovedAt))
    .map(a => ({ id: `artifact:${a.id}`, filename: a.filename, kind: a.kind, mimeType: a.mimeType, content: a.content })));
  for (const file of project.workspaceFiles ?? []) {
    items.push({ id: `file:${file.id}`, filename: file.filename, kind: "file", mimeType: /\.html?$/i.test(file.filename) ? "text/html; charset=utf-8" : "text/plain; charset=utf-8", content: file.content });
  }
  if (project.build?.blueprint.components.length) {
    const sourceCell = (ref: string) => (workflow.partSources?.[ref] ?? []).map(s => `<a href="${escapeHtml(s.url)}" rel="noreferrer noopener">${escapeHtml(s.title)}</a>${s.price ? ` · ${escapeHtml(s.price)}` : ""} <small>(${escapeHtml(s.checkedAt.slice(0, 10))} 확인)</small>`).join("<br>") || "-";
    const rows = project.build.blueprint.components.map(c => `<tr><td>${escapeHtml(c.ref)}</td><td>${escapeHtml(c.valueOrModel)}</td><td>${escapeHtml(c.reason)}</td><td>${sourceCell(c.ref)}</td><td>${escapeHtml(workflow.purchases[c.ref] ?? "needed")}</td></tr>`).join("");
    items.push({ id: "document:bom", filename: `${stem}-부품목록.html`, kind: "bom", mimeType: "text/html; charset=utf-8", content: `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${escapeHtml(project.name)} · 부품목록</title><style>body{font:14px/1.8 system-ui;padding:24px;color:#1f1f1f}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d8dcdb;padding:12px;text-align:left}th{background:#e5f3ee}</style><h1>${escapeHtml(project.name)} · 부품목록</h1><p>구매 전 정확한 모델·수량·가격·재고를 확인해주세요. 출처의 가격은 확인한 날짜 기준이에요.</p><table><tr><th>참조</th><th>부품</th><th>용도</th><th>출처</th><th>구매 상태</th></tr>${rows}</table></html>` });
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
