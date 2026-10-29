import { NextRequest, NextResponse } from "next/server";
import { runBuildPipeline } from "../../../../../lib/build-pipeline";
import { applyBuildResult, getProject } from "../../../../../lib/local-project-store";
import { hasValidOrigin } from "../../../../../lib/request-security";
import { intakeMissing, workflowFor } from "../../../../../lib/workflow";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  if (intakeMissing(workflowFor(project).profile).length) return NextResponse.json({ error: "브레인스토밍의 핵심 동작·보유 도구·펌웨어 경험을 먼저 확인해주세요." }, { status: 409 });
  try {
    const build = await runBuildPipeline(project, true);
    const updated = await applyBuildResult(id, build);
    return NextResponse.json({ project: updated });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    if (["LIVE_BUDGET_BLOCKED", "LIVE_DAILY_BUDGET_BLOCKED"].includes(code)) return NextResponse.json({ error: "live 파이프라인 비용 한도를 사용할 수 없습니다." }, { status: 409 });
    if (code === "LIVE_MODE_REQUIRED") return NextResponse.json({ error: "회로·3D·펌웨어 생성은 live 모드에서 실행됩니다." }, { status: 409 });
    console.error("build pipeline failed", code);
    return NextResponse.json({ error: "제작 초안 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
