import type { NextRequest } from "next/server";
import { canAccess, getViewer, withViewerVault } from "../../../../../../lib/viewer";
import { getProject } from "../../../../../../lib/local-project-store";
import { workbenchItems } from "../../../../../../lib/workbench";
import { partStl } from "../../../../../../lib/mockup-stl";

async function handleGET(request: NextRequest, context: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await context.params;
  const viewer = await getViewer(request);
  const found = await getProject(id);
  const item = workbenchItems(viewer && canAccess(viewer, found) ? found : null, { files: true }).find(i => i.id === itemId);
  if (!item) return Response.json({ error: "작업물을 찾을 수 없습니다." }, { status: 404 });
  // ?name= 으로 통일된 이름을 주면 그 이름으로 내려받는다. 경로 문자와 제어 문자는 뺀다. 확장자는 원래 것을 지킨다.
  const asked = (request.nextUrl.searchParams.get("name") ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").slice(0, 120);
  const ext = item.filename.includes(".") ? item.filename.slice(item.filename.lastIndexOf(".")) : "";
  const filename = asked && (!ext || asked.toLowerCase().endsWith(ext.toLowerCase())) ? asked : item.filename;
  const fallback = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  let body: BodyInit = item.content;
  if (item.generate?.kind === "mockup-stl") {
    const part = found?.preciseMockup?.parts.find((p) => p.id === item.generate!.partId);
    if (!part) return Response.json({ error: "작업물을 찾을 수 없습니다." }, { status: 404 });
    try { body = (await partStl(part, { place: request.nextUrl.searchParams.get("place") === "model" ? "model" : "bed" })).stl as unknown as BodyInit; }
    catch { return Response.json({ error: "이 부위는 출력 파일로 만들지 못했어요. 목업의 도형을 확인해주세요." }, { status: 422 }); }
  }
  return new Response(body, { headers: {
    "content-type": item.mimeType,
    "content-disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff"
  } });
}

export const GET = withViewerVault(handleGET);
