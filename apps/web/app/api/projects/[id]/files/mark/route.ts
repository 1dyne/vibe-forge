import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FileMarkError, buildFileTree, markFinal, unmarkFinal } from "../../../../../../lib/file-tree";
import { getProject, mutateProject } from "../../../../../../lib/local-project-store";
import { hasValidOrigin } from "../../../../../../lib/request-security";
import { canAccess, getViewer, notFound, unauthorized, withViewerVault } from "../../../../../../lib/viewer";

// '최종'은 사람만 붙인다. 달그락이 쓰는 도구(MCP)에는 이 일이 없고, 로그인한 사람의
// 화면에서만 여기로 온다. 붙인 뒤에 파일이 바뀌면 최종이 아닌 것으로 보인다(개정 초안).
const Body = z.object({ itemId: z.string().min(1).max(200), action: z.enum(["final", "unfinal"]) }).strict();

async function handlePOST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project || !canAccess(viewer, project)) return notFound();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "입력을 확인해주세요." }, { status: 400 });
  const { itemId, action } = parsed.data;
  try {
    const updated = await mutateProject(id, (p) => { p.fileMarks = action === "final" ? markFinal(p, itemId) : unmarkFinal(p, itemId); });
    return NextResponse.json({ project: updated, tree: buildFileTree(updated) });
  } catch (error) {
    if (error instanceof FileMarkError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export const POST = withViewerVault(handlePOST);
