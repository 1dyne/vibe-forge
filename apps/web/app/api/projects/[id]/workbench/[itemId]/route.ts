import { getProject } from "../../../../../../lib/local-project-store";
import { workbenchItems } from "../../../../../../lib/workbench";

export async function GET(_request: Request, context: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await context.params;
  const item = workbenchItems(await getProject(id)).find(i => i.id === itemId);
  if (!item) return Response.json({ error: "작업물을 찾을 수 없습니다." }, { status: 404 });
  const fallback = item.filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(item.content, { headers: {
    "content-type": item.mimeType,
    "content-disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(item.filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff"
  } });
}
