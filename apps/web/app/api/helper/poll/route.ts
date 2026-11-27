import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { helperSession, helperUnauthorized } from "../../../../lib/helper-auth";
import { claimJob, touchHelper } from "../../../../lib/helper-relay";
import { getProject } from "../../../../lib/local-project-store";
import { withVault } from "../../../../lib/vault";
import { dispatchForUser } from "../../../../lib/dispatcher";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Hello = z.object({ model: z.string().max(80).nullish(), version: z.string().max(40).nullish(), account: z.string().max(120).nullish(), models: z.array(z.object({ slug: z.string().min(1).max(80), name: z.string().max(80) }).strict()).max(40).optional(), wait: z.boolean().default(true) }).strict();
const HISTORY = 24;

// 연결 앱이 "나 켜져 있어요, 할 일 있나요?" 하고 묻는 자리. 할 일이 없으면 25초쯤
// 붙들고 있다가 빈손으로 돌려보내고, 연결 앱은 바로 다시 묻는다.
export async function POST(request: NextRequest) {
  const session = await helperSession(request);
  if (!session) return helperUnauthorized();
  const hello = Hello.safeParse(await request.json().catch(() => ({})));
  if (!hello.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  touchHelper(session.user.id, hello.data as Parameters<typeof touchHelper>[1]);
  // 연결 앱이 한가하면, 자동 진행을 켠 프로젝트의 다음 일을 대장이 넘긴다.
  await withVault(session.vault, () => dispatchForUser(session.user.id)).catch(() => null);
  const job = await claimJob(session.user.id, hello.data.wait ? undefined : 0);
  touchHelper(session.user.id);
  if (!job) return NextResponse.json({ job: null, account: session.user.name });
  const project = job.projectId ? await withVault(session.vault, () => getProject(job.projectId!)) : null;
  const owned = project && project.ownerId === session.user.id ? project : null;
  // 지금 넘기는 말은 job.text로 따로 가므로 기록에서는 뺀다. 맨 끝만 보면 안 된다:
  // 다시 보내기라 그 말을 새로 적지 않았다면, 끊긴 턴의 답이 그 뒤에 적혀 있을 수 있다.
  // 그 답도 이번 턴의 것이므로 같이 뺀다. 그보다 앞에 있는 같은 말은 지난 대화이니 남긴다.
  const said = (owned?.messages ?? []).filter((m) => (m.channel ?? "main") === job.channel);
  const asked = said.findLastIndex((m) => m.role === "user" && m.text === job.text);
  const past = asked >= 0 && asked >= said.length - 2 ? said.slice(0, asked) : said;
  const history = past.slice(-HISTORY).map((m) => ({ role: m.role, agent: m.agent ?? null, text: m.text.slice(0, 4000) }));
  return NextResponse.json({ job: { id: job.id, projectId: owned?.id ?? null, projectName: owned?.name ?? null, channel: job.channel, text: job.text, model: job.model, images: job.images, history } });
}
