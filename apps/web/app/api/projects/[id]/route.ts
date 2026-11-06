import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "../../../../lib/audit";
import { deleteProject, getProject } from "../../../../lib/local-project-store";
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

export const DELETE = withViewerVault(handleDELETE);
