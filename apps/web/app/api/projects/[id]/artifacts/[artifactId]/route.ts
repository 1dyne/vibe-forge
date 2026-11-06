import { NextRequest } from "next/server";
import { canAccess, getViewer, withViewerVault } from "../../../../../../lib/viewer";
import { getProject } from "../../../../../../lib/local-project-store";
import { workflowFor } from "../../../../../../lib/workflow";

async function handleGET(request: NextRequest, context: { params: Promise<{ id: string; artifactId: string }> }) {
  const { id, artifactId } = await context.params;
  const viewer = await getViewer(request);
  const found = await getProject(id);
  const project = viewer && canAccess(viewer, found) ? found : null;
  const artifact = project?.build?.artifacts.find((item) => item.id === artifactId);
  if (!artifact) return Response.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  if (artifact.kind === "cad" && project && !workflowFor(project).circuitApprovedAt) return Response.json({ error: "회로 승인 후 3D 산출물을 열 수 있습니다." }, { status: 409 });
  const safeName = artifact.filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(artifact.content, {
    headers: {
      "content-type": artifact.mimeType,
      "content-disposition": `attachment; filename="${safeName}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store"
    }
  });
}

export const GET = withViewerVault(handleGET);
