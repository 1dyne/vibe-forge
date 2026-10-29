import { NextRequest, NextResponse } from "next/server";
import { repairAndReevaluateBuild } from "../../../../../lib/build-pipeline";
import { applyBuildResult, getProject } from "../../../../../lib/local-project-store";
import { hasValidOrigin } from "../../../../../lib/request-security";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project?.build) return NextResponse.json({ error: "수정할 제작 초안이 없습니다." }, { status: 404 });
  try {
    const build = await repairAndReevaluateBuild(project);
    return NextResponse.json({ project: await applyBuildResult(id, build) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    if (["LIVE_BUDGET_BLOCKED", "LIVE_DAILY_BUDGET_BLOCKED"].includes(code)) return NextResponse.json({ error: "Evaluator 비용 한도를 사용할 수 없습니다." }, { status: 409 });
    console.error("repair failed", code);
    return NextResponse.json({ error: "펌웨어 수정·재검토 중 오류가 발생했습니다." }, { status: 500 });
  }
}
