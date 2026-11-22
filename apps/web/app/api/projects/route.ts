import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { allowanceUsd, budgetDenied, chargeTurn, remainingUsd } from "../../../lib/usage";
import { accountById } from "../../../lib/users";
import { runDesignAgent } from "../../../lib/design-agent";
import { QuotaError, createProject, getMakerProfile, limits, listProjects, reorderProjects } from "../../../lib/local-project-store";
import { hasValidOrigin } from "../../../lib/request-security";
import { canUseWebAi, getViewer, ownerIdOf, unauthorized, webAiDenied, withViewerVault } from "../../../lib/viewer";
import { AttachmentsSchema } from "../../../lib/attachments";
import type { ImageAttachment } from "../../../lib/project-types";

const CreateProject = z.object({ idea: z.string().trim().min(3).max(4000), attachments: AttachmentsSchema }).strict();

async function handleGET(request: NextRequest) {
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  const account = viewer.kind === "user" ? await accountById(viewer.user.id) : null;
  return NextResponse.json({
    projects: await listProjects(ownerIdOf(viewer)),
    viewer: viewer.kind === "operator" ? { kind: "operator" } : {
      kind: "user", name: viewer.user.name, webAi: viewer.user.webAi, projectLimit: limits.projectsPerUser(),
      // 오늘 남은 무료 분량. 앱 안에서 대화할 때만 줄어든다(커넥터로 쓰면 줄지 않는다).
      credit: account ? { remainingUsd: remainingUsd(account), allowanceUsd: allowanceUsd(account) } : null
    }
  });
}

async function handlePOST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  if (!canUseWebAi(viewer)) return webAiDenied();
    // 무료 분량이 남았는지 보고, 모자라면 여기서 멈춘다. 실패한 호출도 토큰은 나가므로
    // 보수적으로 먼저 적는다(운영자 계정은 자기 키를 쓰므로 세지 않는다).
    { const denied = await budgetDenied(viewer, "chat"); if (denied) return denied; }
    if (process.env.APP_MODE === "live") await chargeTurn(viewer, "chat");
  try {
    const input = CreateProject.parse(await request.json());
    const attachments = input.attachments as ImageAttachment[];
    const result = await runDesignAgent(input.idea, undefined, attachments, await getMakerProfile(ownerIdOf(viewer)));
    const project = await createProject(input.idea, result.plan, result.mode, attachments, { ownerId: ownerIdOf(viewer) ?? undefined, origin: "web" });
    return NextResponse.json({ project, call: { mode: result.mode, costUsd: result.costUsd } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ["LIVE_BUDGET_BLOCKED", "LIVE_DAILY_BUDGET_BLOCKED"].includes(error.message)) {
      return NextResponse.json({ error: "설정된 API 비용 한도를 사용할 수 없습니다. 일일 잔여 한도와 턴당 한도를 확인해주세요." }, { status: 409 });
    }
    if (error instanceof QuotaError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "아이디어를 3자 이상 4,000자 이하로 입력해주세요." }, { status: 400 });
    console.error("project creation failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "프로젝트를 만들지 못했습니다." }, { status: 500 });
  }
}

// 끌어놓아 정한 목록 순서를 저장한다. 보낸 순서대로 0..n-1을 매긴다.
async function handlePATCH(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  const parsed = z.object({ order: z.array(z.string().max(60)).max(200) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "순서를 확인해주세요." }, { status: 400 });
  return NextResponse.json({ projects: await reorderProjects(ownerIdOf(viewer), parsed.data.order) });
}

export const GET = withViewerVault(handleGET);
export const POST = withViewerVault(handlePOST);
export const PATCH = withViewerVault(handlePATCH);
