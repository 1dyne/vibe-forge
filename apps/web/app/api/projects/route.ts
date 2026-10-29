import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runDesignAgent } from "../../../lib/design-agent";
import { createProject, getMakerProfile, listProjects } from "../../../lib/local-project-store";
import { hasValidOrigin } from "../../../lib/request-security";
import { AttachmentsSchema } from "../../../lib/attachments";
import type { ImageAttachment } from "../../../lib/project-types";

const CreateProject = z.object({ idea: z.string().trim().min(3).max(4000), attachments: AttachmentsSchema }).strict();

export async function GET() {
  return NextResponse.json({ projects: await listProjects() });
}

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  try {
    const input = CreateProject.parse(await request.json());
    const attachments = input.attachments as ImageAttachment[];
    const result = await runDesignAgent(input.idea, undefined, attachments, await getMakerProfile());
    const project = await createProject(input.idea, result.plan, result.mode, attachments);
    return NextResponse.json({ project, call: { mode: result.mode, costUsd: result.costUsd } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ["LIVE_BUDGET_BLOCKED", "LIVE_DAILY_BUDGET_BLOCKED"].includes(error.message)) {
      return NextResponse.json({ error: "설정된 API 비용 한도를 사용할 수 없습니다. 일일 잔여 한도와 턴당 한도를 확인해주세요." }, { status: 409 });
    }
    if (error instanceof z.ZodError) return NextResponse.json({ error: "아이디어를 3자 이상 4,000자 이하로 입력해주세요." }, { status: 400 });
    console.error("project creation failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "프로젝트를 만들지 못했습니다." }, { status: 500 });
  }
}
