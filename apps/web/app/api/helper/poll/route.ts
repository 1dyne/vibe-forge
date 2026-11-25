import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { helperSession, helperUnauthorized } from "../../../../lib/helper-auth";
import { claimJob, touchHelper } from "../../../../lib/helper-relay";
import { getProject } from "../../../../lib/local-project-store";
import { withVault } from "../../../../lib/vault";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Hello = z.object({ model: z.string().max(80).nullish(), version: z.string().max(40).nullish(), account: z.string().max(120).nullish(), wait: z.boolean().default(true) }).strict();
const HISTORY = 24;

// 도우미가 "나 켜져 있어요, 할 일 있나요?" 하고 묻는 자리. 할 일이 없으면 25초쯤
// 붙들고 있다가 빈손으로 돌려보내고, 도우미는 바로 다시 묻는다.
export async function POST(request: NextRequest) {
  const session = await helperSession(request);
  if (!session) return helperUnauthorized();
  const hello = Hello.safeParse(await request.json().catch(() => ({})));
  if (!hello.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  touchHelper(session.user.id, hello.data);
  const job = await claimJob(session.user.id, hello.data.wait ? undefined : 0);
  touchHelper(session.user.id);
  if (!job) return NextResponse.json({ job: null });
  const project = job.projectId ? await withVault(session.vault, () => getProject(job.projectId!)) : null;
  const owned = project && project.ownerId === session.user.id ? project : null;
  // 마지막 사용자 말은 job.text로 따로 가므로 기록에서는 뺀다.
  const history = (owned?.messages ?? []).filter((m) => (m.channel ?? "main") === job.channel).slice(-HISTORY - 1, -1).map((m) => ({ role: m.role, agent: m.agent ?? null, text: m.text.slice(0, 4000) }));
  return NextResponse.json({ job: { id: job.id, projectId: owned?.id ?? null, projectName: owned?.name ?? null, channel: job.channel, text: job.text, history } });
}
