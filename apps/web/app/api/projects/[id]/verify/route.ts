import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProject, mutateProject } from "../../../../../lib/local-project-store";
import { hasValidOrigin } from "../../../../../lib/request-security";
import { buildLadder, recordRung, verifyOf, viewLadder, VerifyError, type RungResult } from "../../../../../lib/verify-ladder";
import { canAccess, getViewer, notFound, unauthorized, withViewerVault } from "../../../../../lib/viewer";

// 검증 사다리에서 사람이 직접 결과를 넣는 자리. 달그락은 MCP 도구로, 사람은 여기로 온다.
const Body = z.object({
  rungId: z.string().min(1).max(80),
  value: z.number().finite().min(-1e9).max(1e9).nullable().optional(),
  yes: z.boolean().nullable().optional(),
  text: z.string().max(600).nullable().optional(),
  photoNote: z.string().max(300).nullable().optional(),
  skip: z.string().max(300).nullable().optional()
}).strict();

async function handleGET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  const project = await getProject((await context.params).id);
  if (!project || !canAccess(viewer, project)) return notFound();
  return NextResponse.json({ ladder: viewLadder(buildLadder(project), verifyOf(project)) }, { headers: { "cache-control": "private, no-store" } });
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
  try {
    let result: RungResult | null = null;
    const updated = await mutateProject(id, (p) => {
      const recorded = recordRung(buildLadder(p), verifyOf(p), parsed.data.rungId, parsed.data, "person");
      p.verify = recorded.state;
      result = recorded.result;
    });
    return NextResponse.json({ project: updated, result, ladder: viewLadder(buildLadder(updated), verifyOf(updated)) });
  } catch (error) {
    if (error instanceof VerifyError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export const GET = withViewerVault(handleGET);
export const POST = withViewerVault(handlePOST);
