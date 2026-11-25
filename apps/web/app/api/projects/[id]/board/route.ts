import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { BoardError, boardOf, moveCard, recordReal, viewBoard } from "../../../../../lib/board";
import { getProject, mutateProject } from "../../../../../lib/local-project-store";
import { hasValidOrigin } from "../../../../../lib/request-security";
import { canAccess, getViewer, notFound, unauthorized, withViewerVault } from "../../../../../lib/viewer";

// 작업대에서 사람이 직접 하는 일. 달그락은 MCP 도구로, 사람은 여기로 온다.
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const Body = z.discriminatedUnion("action", [
  // 사람이 자기 차례인 카드에 답했다 → 달그락 차례로 돌아간다
  z.object({ action: z.literal("respond"), cardId: z.string().max(40), note: z.string().max(400).default("") }).strict(),
  // 사람이 직접 끝냈다고 표시
  z.object({ action: z.literal("done"), cardId: z.string().max(40), note: z.string().max(400).default("") }).strict(),
  z.object({ action: z.literal("now"), text: z.string().max(200).nullable() }).strict(),
  z.object({ action: z.literal("availability"), text: z.string().max(200).nullable() }).strict(),
  z.object({ action: z.literal("delivery"), label: z.string().min(1).max(80), ref: z.string().max(16).optional(), status: z.enum(["ordered", "delayed", "arrived", "problem"]), expectedAt: date.optional(), note: z.string().max(200).optional() }).strict()
]);

async function handleGET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  const project = await getProject((await context.params).id);
  if (!project || !canAccess(viewer, project)) return notFound();
  return NextResponse.json({ board: viewBoard(boardOf(project)) }, { headers: { "cache-control": "private, no-store" } });
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
  const input = parsed.data;
  try {
    const updated = await mutateProject(id, (p) => {
      const board = boardOf(p);
      if (input.action === "respond") p.board = moveCard(board, input.cardId, { turn: "agent", note: input.note || "사람이 확인했어요" }, "person");
      else if (input.action === "done") p.board = moveCard(board, input.cardId, { turn: "done", note: input.note }, "person");
      else if (input.action === "now") p.board = recordReal(board, { now: input.text });
      else if (input.action === "availability") p.board = recordReal(board, { availability: input.text });
      else p.board = recordReal(board, { delivery: { label: input.label, ref: input.ref, status: input.status, expectedAt: input.expectedAt, note: input.note } });
    });
    return NextResponse.json({ project: updated, board: viewBoard(boardOf(updated)) });
  } catch (error) {
    if (error instanceof BoardError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export const GET = withViewerVault(handleGET);
export const POST = withViewerVault(handlePOST);
