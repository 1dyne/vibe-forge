import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { RelayError, enqueueJob, helperStatus } from "../../../../lib/helper-relay";
import { getProject, mutateProject } from "../../../../lib/local-project-store";
import { fallbackLetter, isMeetup, markMeetupFinish, meetupPrompt } from "../../../../lib/meetup";
import { hit } from "../../../../lib/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";
import { canAccess, getViewer, notFound, unauthorized, withViewerVault } from "../../../../lib/viewer";

export const dynamic = "force-dynamic";

// ── MEETUP: 2026-11-28 밋업 시연 전용 (lib/meetup.ts 참고). 밋업이 끝나면 지운다 ──
// '완성 🎉': 대장 달그락의 편지를 부탁한다. 연결 앱이 켜져 있으면 그 AI가 쓰고,
// 꺼져 있거나 fallback을 달라고 하면 정해진 기준으로 쓴 편지를 바로 적는다.
const Body = z.object({ projectId: z.string().uuid(), channel: z.enum(["main", "chief"]).default("main"), fallback: z.boolean().optional() }).strict();

async function handlePOST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const input = parsed.data;
  const found = await getProject(input.projectId);
  if (!found || !canAccess(viewer, found) || !isMeetup(found)) return notFound();
  const userId = viewer.kind === "user" ? viewer.user.id : null;
  if (userId && !hit("mcp", `helper-chat:${userId}`).ok) return NextResponse.json({ error: "요청이 너무 많아요. 잠시 후 다시 시도해주세요." }, { status: 429 });
  const channel = input.channel as "main" | "chief";

  if (!input.fallback && userId && helperStatus(userId).online) {
    try {
      const project = await mutateProject(found.id, (p) => markMeetupFinish(p, channel));
      const job = enqueueJob({ userId, projectId: project.id, channel, text: meetupPrompt(project), model: null, images: [] });
      return NextResponse.json({ jobId: job.id, project });
    } catch (error) {
      if (!(error instanceof RelayError)) throw error;
      // 연결 앱이 다른 일을 하고 있으면 정해진 편지로 넘어간다
    }
  }
  const project = await mutateProject(found.id, (p) => {
    markMeetupFinish(p, channel);
    p.messages.push({ id: randomUUID(), role: "assistant", agent: "chief", channel, text: fallbackLetter(p), createdAt: new Date().toISOString() });
  });
  return NextResponse.json({ jobId: null, project });
}

export const POST = withViewerVault(handlePOST);
