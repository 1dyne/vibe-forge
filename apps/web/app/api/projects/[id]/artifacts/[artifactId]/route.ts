import { NextRequest } from "next/server";
import { getProject } from "../../../../../../lib/local-project-store";
import { workflowFor } from "../../../../../../lib/workflow";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; artifactId: string }> }) {
  const { id, artifactId } = await context.params;
  const project = await getProject(id);
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
