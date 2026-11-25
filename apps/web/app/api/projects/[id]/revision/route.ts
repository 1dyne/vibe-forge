import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { approvedCad } from "../../../../../lib/build-pipeline";
import { getProject, mutateProject } from "../../../../../lib/local-project-store";
import { hasValidOrigin } from "../../../../../lib/request-security";
import { RevisionError, applyProposal, proposalSummary, rejectProposal, revisionOf } from "../../../../../lib/revision";
import { canAccess, getViewer, notFound, unauthorized, withViewerVault } from "../../../../../lib/viewer";
import { workflowFor } from "../../../../../lib/workflow";
import { boardOf, postNotice } from "../../../../../lib/board";
import { dispatchForUser } from "../../../../../lib/dispatcher";

// 수정안의 승인과 거절. 달그락은 수정안을 낼 수만 있고(MCP 도구), 적용은 사람이 여기서 한다.
const Body = z.object({ action: z.enum(["approve", "reject"]), proposalId: z.string().uuid() }).strict();

async function handleGET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  const project = await getProject((await context.params).id);
  if (!project || !canAccess(viewer, project)) return notFound();
  return NextResponse.json({ proposals: revisionOf(project).proposals.map(proposalSummary) }, { headers: { "cache-control": "private, no-store" } });
}

async function handlePOST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project || !canAccess(viewer, project)) return notFound();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "입력을 확인해주세요." }, { status: 400 });
  const { action, proposalId } = parsed.data;
  try {
    const updated = await mutateProject(id, (p) => {
      const now = new Date().toISOString();
      const w = workflowFor(p);
      if (action === "reject") {
        const rejected = rejectProposal(p, proposalId, now);
        p.messages.push({ id: randomUUID(), role: "user", channel: "main", text: `수정안 「${rejected.title}」을(를) 거절했어요. 지금 설계를 그대로 써요.`, createdAt: now, shared: true });
        w.sharedUpdates.push({ id: randomUUID(), agent: "chief", text: `수정안 「${rejected.title}」 거절됨 (설계 변경 없음)`, createdAt: now });
      } else {
        const approved = applyProposal(p, proposalId, now, randomUUID);
        // 회로가 승인된 프로젝트는 승인본에 CAD가 붙어 있다. 회로나 형태가 바뀌었으면 새 값으로 다시 붙인다.
        if (p.build && w.circuitApprovedAt && (approved.changes.build || approved.changes.productForm)) p.build = approvedCad(p.build, p.productForm);
        const redo = approved.impact.redo.map((task) => task.title);
        // 설계가 바뀌었으니 다른 달그락들이 자기 일에 주는 영향을 확인해야 한다.
        p.board = postNotice(boardOf(p), { from: approved.by, text: `수정안 「${approved.title}」이(가) 승인돼 설계가 바뀌었어요 (${approved.impact.fields.join(", ")}). 까닭: ${approved.reason}`, affects: ["chief", ...w.activeAgents] }, randomUUID(), now);
        p.messages.push({ id: randomUUID(), role: "user", channel: "main", text: `수정안 「${approved.title}」을(를) 승인했어요.${redo.length ? `\n\n다시 할 일: ${redo.join(", ")}` : ""}`, createdAt: now, shared: true });
        w.sharedUpdates.push({ id: randomUUID(), agent: approved.by, text: `수정안 「${approved.title}」 승인·적용: ${approved.impact.fields.join(", ")} 변경${redo.length ? ` · 사람이 다시 할 일 ${redo.length}개` : ""}`, createdAt: now });
      }
      p.workflow = w;
    });
    if (viewer.kind === "user") await dispatchForUser(viewer.user.id).catch(() => null);
    return NextResponse.json({ project: updated, proposals: revisionOf(updated).proposals.map(proposalSummary) });
  } catch (error) {
    if (error instanceof RevisionError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export const GET = withViewerVault(handleGET);
export const POST = withViewerVault(handlePOST);
