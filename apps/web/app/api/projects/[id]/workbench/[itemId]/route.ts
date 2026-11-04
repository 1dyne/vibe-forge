import type { NextRequest } from "next/server";
import { canAccess, getViewer, withViewerVault } from "../../../../../../lib/viewer";
import { getProject } from "../../../../../../lib/local-project-store";
import { workbenchItems } from "../../../../../../lib/workbench";

async function handleGET(request: NextRequest, context: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await context.params;
  const viewer = await getViewer(request);
  const found = await getProject(id);
  const item = workbenchItems(viewer && canAccess(viewer, found) ? found : null).find(i => i.id === itemId);
  if (!item) return Response.json({ error: "작업물을 찾을 수 없습니다." }, { status: 404 });
  const fallback = item.filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(item.content, { headers: {
    "content-type": item.mimeType,
    "content-disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(item.filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff"
  } });
}

export const GET = withViewerVault(handleGET);
