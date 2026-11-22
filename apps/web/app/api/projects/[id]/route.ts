import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "../../../../lib/audit";
import { deleteProject, getProject, renameProject } from "../../../../lib/local-project-store";
import { hasValidOrigin } from "../../../../lib/request-security";
import { canAccess, getViewer, notFound, ownerIdOf, unauthorized, withViewerVault } from "../../../../lib/viewer";

// Deleting is a person's decision: there is no connector tool for it, and the
// request must repeat the project's name as confirmation.
async function handleDELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project || !canAccess(viewer, project)) return notFound();
  const parsed = z.object({ confirmName: z.string() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.confirmName.trim() !== project.name.trim()) return NextResponse.json({ error: "확인을 위해 프로젝트 이름을 똑같이 입력해주세요." }, { status: 400 });
  if (!(await deleteProject(id, ownerIdOf(viewer)))) return notFound();
  await audit("project_deleted", ownerIdOf(viewer) ? { userId: ownerIdOf(viewer)! } : {});
  return NextResponse.json({ ok: true });
}

// 이름 바꾸기. 목록에서 바로 고칠 수 있어야 해서 따로 열었다.
async function handlePATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project || !canAccess(viewer, project)) return notFound();
  const parsed = z.object({ name: z.string().trim().min(1).max(80) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "프로젝트 이름을 1~80자로 적어주세요." }, { status: 400 });
  const renamed = await renameProject(id, ownerIdOf(viewer), parsed.data.name);
  if (!renamed) return notFound();
  return NextResponse.json({ project: renamed });
}

export const DELETE = withViewerVault(handleDELETE);
export const PATCH = withViewerVault(handlePATCH);
