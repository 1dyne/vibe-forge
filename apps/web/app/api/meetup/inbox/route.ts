import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProject, mutateProject } from "../../../../lib/local-project-store";
import { meetupLocked, recordMeetupIdea } from "../../../../lib/meetup";
import { openInbox, takeIdeas } from "../../../../lib/meetup-inbox";
import { hasValidOrigin } from "../../../../lib/request-security";
import { canAccess, getViewer, notFound, unauthorized, withViewerVault } from "../../../../lib/viewer";

export const dynamic = "force-dynamic";

// ── MEETUP: 2026-11-28 밋업 시연 전용 (lib/meetup-inbox.ts 참고). 밋업이 끝나면 지운다 ──
// 주인의 화면이 몇 초마다 부른다: "나 열려 있어요, 그동안 온 아이디어 주세요."
// 온 글이 있으면 주인의 열쇠로 프로젝트에 현장 아이디어로 적는다.
const Body = z.object({ projectId: z.string().uuid() }).strict();

async function handlePOST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const found = await getProject(parsed.data.projectId);
  if (!found || !canAccess(viewer, found) || !meetupLocked(found)) return notFound();
  const code = openInbox(found.id);
  const ideas = takeIdeas(code);
  if (!ideas.length) return NextResponse.json({ code, project: null });
  const project = await mutateProject(found.id, (p) => { for (const idea of ideas) recordMeetupIdea(p, idea.name ? `${idea.name}: ${idea.text}` : idea.text, "main"); });
  return NextResponse.json({ code, project, added: ideas.length });
}

export const POST = withViewerVault(handlePOST);
