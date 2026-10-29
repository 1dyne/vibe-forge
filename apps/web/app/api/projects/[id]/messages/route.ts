import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runDesignAgent } from "../../../../../lib/design-agent";
import { applyAgentPlan, getProject, mutateProject } from "../../../../../lib/local-project-store";
import { hasValidOrigin } from "../../../../../lib/request-security";
import { randomUUID } from "node:crypto";
import { AttachmentsSchema } from "../../../../../lib/attachments";
import { runWorkshopAgent } from "../../../../../lib/workshop-agent";
import { workflowFor } from "../../../../../lib/workflow";
import type { ImageAttachment } from "../../../../../lib/project-types";

const Message = z.object({ text: z.string().trim().min(1).max(4000), attachments: AttachmentsSchema, channel: z.enum(["main", "chief", "hw", "sw", "me", "id"]).default("main"), mode: z.enum(["work", "evaluate"]).default("work") }).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  try {
    const { id } = await context.params;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    const input = Message.parse(await request.json());
    const attachments = input.attachments as ImageAttachment[];
    const workflow = workflowFor(project);
    if (workflow.phase !== "brainstorm") {
      const channel = workflow.phase === "workshop" ? input.channel : "chief";
      const result = await runWorkshopAgent(project, input.text, channel, input.mode, attachments);
      const updated = await mutateProject(id, (p) => {
        const now = new Date().toISOString();
        p.messages.push({ id: randomUUID(), role: "user", channel, mode: input.mode, text: input.text, attachments, createdAt: now });
        for (const reply of result.replies) p.messages.push({ id: randomUUID(), role: "assistant", agent: reply.agent, channel, mode: input.mode, text: reply.text, createdAt: now, shared: true });
        p.workspaceFiles ??= [];
        for (const file of result.files) p.workspaceFiles.push({ ...file, id: randomUUID(), createdAt: now });
        const w = workflowFor(p);
        w.sharedUpdates.push({ id: randomUUID(), agent: channel === "main" ? "chief" : channel, text: result.sharedSummary, createdAt: now });
        p.workflow = w;
        p.lastAgentMode = process.env.APP_MODE === "live" ? "live" : "mock";
      }, project.designRevision);
      return NextResponse.json({ project: updated });
    }
    const result = await runDesignAgent(input.text, project, attachments);
    const updated = await applyAgentPlan(id, input.text, result.plan, result.mode, attachments);
    return NextResponse.json({ project: updated, call: { mode: result.mode, costUsd: result.costUsd } });
  } catch (error) {
    if (error instanceof Error && error.message === "LIVE_CONTEXT_BUDGET_BLOCKED") {
      return NextResponse.json({ error: "프로젝트 자료와 완결된 답변을 담기에는 턴당 API 한도가 작습니다. 유료 생성 전 중단했어요. 설정의 턴당 한도를 높인 뒤 다시 요청해주세요." }, { status: 409 });
    }
    if (error instanceof Error && ["LIVE_BUDGET_BLOCKED", "LIVE_DAILY_BUDGET_BLOCKED"].includes(error.message)) {
      return NextResponse.json({ error: "설정된 API 비용 한도를 사용할 수 없습니다. 일일 잔여 한도와 턴당 한도를 확인해주세요." }, { status: 409 });
    }
    if (error instanceof z.ZodError) {
      console.error("message validation failed", error.issues.map(({ path, code, message }) => ({ path, code, message })));
      return NextResponse.json({ error: "입력 형식을 확인해주세요. 메시지는 4,000자 이내, 이미지는 PNG/JPEG/WebP 최대 3장입니다." }, { status: 400 });
    }
    if (error instanceof Error && (error.message.startsWith("MODEL_OUTPUT_INVALID") || error.message.includes("max_tokens"))) {
      console.error("model response incomplete", error.message);
      return NextResponse.json({ error: "AI 응답이 완결되지 않았거나 필요한 형식과 달라 저장하지 못했습니다. 입력은 유지했어요. 요청을 나누거나 응답 한도를 조정한 뒤 다시 시도해주세요." }, { status: 502 });
    }
    console.error("project message failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "답변을 반영하지 못했습니다." }, { status: 500 });
  }
}
