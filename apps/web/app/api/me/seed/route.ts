import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readSeed } from "../../../../lib/find/seed";
import { MAKER } from "../../../../lib/find/classify";
import { linkForgeToUser } from "../../../../lib/find/village-store";
import { createProject, listProjects, mutateProject } from "../../../../lib/local-project-store";
import { hasValidOrigin } from "../../../../lib/request-security";
import { getViewer, unauthorized, withViewerVault } from "../../../../lib/viewer";
import { workflowFor } from "../../../../lib/workflow";

export const dynamic = "force-dynamic";
const Body = z.object({ seed: z.string().min(10).max(4000) }).strict();

// 가입한 사람이 온보딩에서 스케치한 아이디어를 자기 대장간으로 가져온다.
// 한 일: (1) 온보딩의 내 대장간(마을의 방)을 이 계정에 묶는다 (2) 그 아이디어로 프로젝트를 하나 만든다.
// 같은 쪽지를 두 번 내도 프로젝트는 하나만 생긴다.
async function handlePOST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  if (viewer.kind !== "user") return NextResponse.json({ error: "참여자 계정에서만 쓸 수 있어요." }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  const seed = parsed.success ? readSeed(parsed.data.seed) : null;
  if (!seed) return NextResponse.json({ error: "가져올 아이디어를 찾지 못했어요. 대화창에 다시 적어 주세요." }, { status: 400 });
  const userId = viewer.user.id;
  // 마을의 방과 계정을 서로 가리키게 한다. 이미 다른 계정에 묶인 방은 건드리지 않는다.
  if (seed.forgeId) await linkForgeToUser(seed.forgeId, userId);
  const stamp = `seed:${seed.at}`;
  const mine = await listProjects(userId);
  const existing = mine.find((p) => p.seedStamp === stamp);
  if (existing) return NextResponse.json({ projectId: existing.id, name: existing.name, kind: seed.kind, created: false });
  const name = (seed.fireName || seed.idea).replace(/\s+/g, " ").slice(0, 24);
  const reply = `마을에서 스케치해 온 아이디어를 가져왔어요.\n\n“${seed.idea}”${seed.sentence ? `\n${seed.sentence}` : ""}\n\n${MAKER[seed.kind].name}의 일로 보여요. 여기서부터 같이 구체적으로 만들어 가요. 먼저 몇 가지만 확인할게요.`;
  const project = await createProject(seed.idea, { projectName: name, oneLiner: seed.sentence || seed.idea, reply, slotUpdates: [], tasks: [] } as never, "mock", [], { ownerId: userId, origin: "web" });
  const updated = await mutateProject(project.id, (p) => { p.seedStamp = stamp; const w = workflowFor(p); if (!w.profile.coreBehavior.trim()) w.profile = { ...w.profile, coreBehavior: [seed.idea, seed.sentence].filter(Boolean).join(" — ").slice(0, 1800) }; p.workflow = w; });
  return NextResponse.json({ projectId: updated.id, name: updated.name, kind: seed.kind, created: true });
}

export const POST = withViewerVault(handlePOST);
