import { NextRequest, NextResponse } from "next/server";
import seed from "../../../../lib/bench/sam-seed.json";
import { getMakerProfile, listProjects } from "../../../../lib/local-project-store";
import { callTool } from "../../../../lib/mcp-tools";
import { isMeetup } from "../../../../lib/meetup";
import { hit } from "../../../../lib/rate-limit";
import { getViewer, withViewerVault } from "../../../../lib/viewer";

export const dynamic = "force-dynamic";

// ── MEETUP: 2026-11-28 밋업 시연 전용 (lib/meetup.ts 참고). 밋업이 끝나면 지운다 ──
// 참여자가 이 주소를 열면 자기 계정에 시연용 '사만다 재고 저울' 프로젝트가 생긴다.
// 시드(sam-seed.json)의 도구 호출을 그 사람 이름으로 차례대로 부른다. 이미 있으면 그 프로젝트로 보낸다.
async function handleGET(request: NextRequest) {
  const home = (query = "") => NextResponse.redirect(new URL(`/${query}`, process.env.APP_BASE_URL || request.nextUrl.origin), 303);
  const viewer = await getViewer(request);
  if (!viewer) return NextResponse.redirect(new URL("/login", process.env.APP_BASE_URL || request.nextUrl.origin), 303);
  if (viewer.kind !== "user") return home();
  const mine = (await listProjects(viewer.user.id)).find((p) => isMeetup(p));
  if (mine) return home(`?p=${mine.id}`);
  if (!hit("mcp", `meetup-start:${viewer.user.id}`).ok) return home();

  // 도구·경험은 계정에 붙는 값이라, 이미 적어 둔 사람의 것은 그대로 넘긴다
  const profile = await getMakerProfile(viewer.user.id);
  const context = { user: viewer.user, dashboardUrl: process.env.APP_BASE_URL || request.nextUrl.origin };
  let id = "";
  for (const call of seed.calls as Array<{ tool: string; args: Record<string, unknown> }>) {
    let args = JSON.parse(JSON.stringify(call.args).replaceAll("$PROJECT", id)) as Record<string, unknown>;
    if (call.tool === "set_maker_profile") args = { projectId: id, coreBehavior: args.coreBehavior, tools: profile?.toolsConfirmed ? profile.tools : [], toolsConfirmed: true, firmwareExperience: profile && profile.firmwareExperience !== "unanswered" ? profile.firmwareExperience : "none" };
    const result = await callTool(call.tool, args, context);
    if (result.isError) { console.error("meetup start failed", call.tool, result.content[0]?.text.slice(0, 200)); return home(id ? `?p=${id}` : ""); }
    if (call.tool === "create_project") id = String((result.structuredContent as { id?: string } | undefined)?.id ?? "");
  }
  return home(`?p=${id}`);
}

export const GET = withViewerVault(handleGET);
