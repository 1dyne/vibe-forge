import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { helperSession, helperUnauthorized } from "../../../../../lib/helper-auth";
import { RelayError, jobFor, pushJobEvent, readJobEvents, touchHelper, type HelperEvent } from "../../../../../lib/helper-relay";
import { getProject, mutateProject } from "../../../../../lib/local-project-store";
import type { AgentId, ChatChannel } from "../../../../../lib/project-types";
import { hit } from "../../../../../lib/rate-limit";
import { getViewer, unauthorized } from "../../../../../lib/viewer";
import { withVault } from "../../../../../lib/vault";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Event = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delta"), text: z.string().max(8000) }).strict(),
  z.object({ type: z.literal("status"), text: z.string().max(200) }).strict(),
  z.object({ type: z.literal("done"), text: z.string().max(20000) }).strict(),
  z.object({ type: z.literal("error"), code: z.string().max(80), message: z.string().max(500) }).strict()
]);
const Body = z.object({ events: z.array(Event).min(1).max(50) }).strict();

// 연결 앱이 답을 조금씩 올려보내는 자리. 다 됐다고 하면(done) 그 답을 프로젝트의
// 대화 기록에 남긴다. 그래야 다른 기기에서 열어도 같은 대화가 보인다.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await helperSession(request);
  if (!session) return helperUnauthorized();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const { id } = await context.params;
  touchHelper(session.user.id);
  try {
    // apps/web는 strict가 꺼져 있어 zod가 추론한 타입의 필드가 선택으로 보인다. 검증은 위에서 끝났다.
    for (const event of parsed.data.events as HelperEvent[]) {
      const before = jobFor(id, session.user.id);
      if (before.finished) break;
      const job = pushJobEvent(id, session.user.id, event);
      if (event.type === "done" && event.text.trim() && job.projectId) {
        await withVault(session.vault, async () => {
          const project = await getProject(job.projectId!);
          if (!project || project.ownerId !== session.user.id) return;
          const agent: AgentId = job.channel === "main" || job.channel === "chief" ? "chief" : job.channel as AgentId;
          await mutateProject(project.id, (p) => { p.messages.push({ id: randomUUID(), role: "assistant", agent, channel: job.channel as ChatChannel, text: event.text.trim(), createdAt: new Date().toISOString() }); });
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RelayError) return NextResponse.json({ error: error.message, code: error.code }, { status: 404 });
    throw error;
  }
}

// 화면이 답을 읽는 자리(로그인한 본인만). ?from=<지금까지 읽은 개수>
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer(request);
  if (!viewer || viewer.kind !== "user") return unauthorized();
  if (!hit("mcp", `helper-read:${viewer.user.id}`).ok) return NextResponse.json({ error: "요청이 너무 많아요." }, { status: 429 });
  const { id } = await context.params;
  const from = Math.max(0, Number(request.nextUrl.searchParams.get("from")) || 0);
  try {
    return NextResponse.json(await readJobEvents(id, viewer.user.id, from), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof RelayError) return NextResponse.json({ error: error.message, code: error.code }, { status: 404 });
    throw error;
  }
}
