import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProject, mutateProject, saveMakerProfile } from "../../../../../lib/local-project-store";
import { hasValidOrigin } from "../../../../../lib/request-security";
import { canAccess, canUseWebAi, getViewer, notFound, ownerIdOf, unauthorized, webAiDenied, withViewerVault } from "../../../../../lib/viewer";
import { transition, workflowFor } from "../../../../../lib/workflow";
import { approvedCad, blockingChecks, runBuildPipeline } from "../../../../../lib/build-pipeline";
import { pushActivity, recordAssembly, resetStage } from "../../../../../lib/mcp-tools";
import type { DevProfile, MakerProfile } from "../../../../../lib/project-types";
import { CoordinationError, finalizeBlockers, recordPurchase, resolveConflictByPerson, setTaskStatus } from "../../../../../lib/coordination";

const ProfileSchema = z.object({ tools: z.array(z.string().max(80)).max(30), toolsConfirmed: z.boolean(), firmwareExperience: z.enum(["unanswered", "none", "guided", "independent"]), coreBehavior: z.string().max(1800),
  solderingSkill: z.enum(["unanswered", "none", "tried", "comfortable"]).optional(), printerAccess: z.enum(["unanswered", "own", "makerspace", "service", "none"]).optional(),
  region: z.string().max(60).optional(), budgetKRW: z.number().int().min(0).max(100_000_000).nullable().optional(),
  purpose: z.enum(["unanswered", "personal", "gift", "sell", "lecture"]).optional(), targetPriceKRW: z.number().int().min(0).max(100_000_000).nullable().optional(),
  travelRange: z.enum(["unanswered", "walk", "transit30", "transit60", "car"]).optional(), timelineWeeks: z.number().min(0.5).max(104).nullable().optional() }).strict();
const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("profile"), profile: ProfileSchema }),
  z.object({ action: z.literal("agents"), agents: z.array(z.enum(["hw", "sw", "me", "id"])).min(1).max(4) }),
  z.object({ action: z.literal("plan") }), z.object({ action: z.literal("approve_circuit") }),
  z.object({ action: z.literal("approve_mockup") }), z.object({ action: z.literal("enter_workshop") }),
  // "finalize" is the new name of "enter_workshop": the design is fixed once every part is orderable.
  z.object({ action: z.literal("finalize") }),
  z.object({ action: z.literal("task_status"), taskId: z.string().uuid(), status: z.enum(["ready", "in_progress", "blocked", "cannot", "completed"]), note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("resolve_conflict"), conflictId: z.string().uuid(), optionId: z.string().max(8).optional(), proposal: z.string().trim().max(1500).optional() }),
  z.object({ action: z.literal("reopen") }),
  z.object({ action: z.literal("evidence"), taskId: z.string(), text: z.string().trim().min(1).max(3000) }),
  z.object({ action: z.literal("dev_profile"), devProfile: z.object({ codingExperience: z.enum(["unanswered", "none", "guided", "independent"]), tool: z.enum(["undecided", "claude_code", "codex"]), os: z.enum(["unanswered", "mac", "windows", "linux"]), installed: z.array(z.string().max(40)).max(12), confirmed: z.boolean() }).strict() }),
  z.object({ action: z.literal("assembly_report"), step: z.number().int().min(1).max(20), cardId: z.string().regex(/^(s\d+-c\d+|lib:[a-z0-9-]+)$/).optional(), text: z.string().trim().min(1).max(1000), value: z.number().finite().nullable().optional(), yes: z.boolean().nullable().optional() }),
  z.object({ action: z.literal("detail_request"), step: z.number().int().min(1).max(20), level: z.enum(["beginner", "micro"]) }),
  z.object({ action: z.literal("reset_stage"), stage: z.enum(["product_form", "plan"]) }),
  z.object({ action: z.literal("purchase"), ref: z.string().max(80), status: z.enum(["needed", "available", "ordered", "received", "problem"]), note: z.string().max(1000).default("") })
]);
async function handlePOST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  try {
    const parsedInput = Input.parse(await request.json());
    const input = parsedInput.action === "finalize" ? { action: "enter_workshop" as const } : parsedInput;
    const viewer = await getViewer(request);
    if (!viewer) return unauthorized();
    const { id } = await context.params;
    const project = await getProject(id);
    if (!project || !canAccess(viewer, project)) return notFound();
    // Approvals and records stay open to everyone; only "plan" calls the in-app AI.
    if (input.action === "plan" && !canUseWebAi(viewer)) return webAiDenied();
    const current = workflowFor(project);
    // Electrical rules marked blocked hold back approvals and assembly progress.
    const blocked = blockingChecks(project.build);
    if (blocked.length && ["approve_circuit", "approve_mockup", "enter_workshop", "assembly_report"].includes(input.action)) {
      return NextResponse.json({ error: `회로에 꼭 고쳐야 할 문제가 ${blocked.length}건 있어 진행할 수 없어요: ${blocked.map((check) => check.message).join(" / ")} Claude에게 회로를 고쳐 다시 제출해 달라고 해주세요.` }, { status: 409 });
    }
    if (input.action === "enter_workshop") {
      const blockers = finalizeBlockers(project);
      if (blockers.length) return NextResponse.json({ error: `아직 설계를 확정할 수 없어요: ${blockers.join(" / ")}`, blockers }, { status: 409 });
    }
    let newBuild = null;
    if (input.action === "plan") {
      transition(current, "plan", !!project.build);
      newBuild = await runBuildPipeline(project, true);
    }
    const updated = await mutateProject(id, (p) => {
      const w = workflowFor(p);
      const now = new Date().toISOString();
      const announce = (text: string) => {
        p.messages.push({ id: randomUUID(), role: "assistant", agent: "chief", channel: "main", text, createdAt: now, shared: true });
        w.sharedUpdates.push({ id: randomUUID(), agent: "chief", text, createdAt: now });
      };
      if (input.action === "profile") {
        w.profile = input.profile as MakerProfile;
        p.messages.push({ id: randomUUID(), role: "user", channel: "main", text: `제작 프로필을 알려드릴게요.\n핵심 동작: ${w.profile.coreBehavior || "아직 논의 중"}\n보유 도구: ${w.profile.tools.join(", ") || "없음"}\n펌웨어 경험: ${{ unanswered: "아직 답변 안 함", none: "처음이에요", guided: "안내를 보며 해봤어요", independent: "직접 할 수 있어요" }[w.profile.firmwareExperience]}`, createdAt: now });
        announce("제작 프로필을 저장했어요. 목표는 유지하면서 경험에 맞춰 설명할게요. 아이디어를 더 논의하거나, 준비되었다면 계획 시작을 눌러주세요.");
      } else if (input.action === "assembly_report") {
        recordAssembly(p, input.step, input.cardId ?? null, input.text, { value: input.value ?? null, yes: input.yes ?? null });
      } else if (input.action === "detail_request") {
        if (!p.assembly?.steps[input.step - 1]) throw new Error("조립 가이드의 단계를 찾을 수 없어요.");
        p.assemblyRequests = [...(p.assemblyRequests ?? []).filter((r) => r.step !== input.step || r.doneAt), { step: input.step, level: input.level, requestedAt: now, doneAt: null }];
        p.messages.push({ id: randomUUID(), role: "user", channel: "main", text: `${input.step}단계를 ${input.level === "micro" ? "한 동작 단위로" : "초보자용으로"} 더 잘게 나눠주세요.`, createdAt: now, shared: true });
        pushActivity(p, { source: "person", title: `${input.step}단계 더 잘게 보기 요청` });
      } else if (input.action === "reset_stage") {
        resetStage(p, input.stage);
      } else if (input.action === "dev_profile") {
        w.devProfile = input.devProfile as DevProfile;
      } else if (input.action === "agents") {
        w.activeAgents = [...new Set(input.agents)];
        announce(`함께할 팀을 ${w.activeAgents.map((a) => a.toUpperCase()).join(" · ")} 달그락으로 변경했어요. 공통 프로젝트 기록을 함께 참고합니다.`);
      } else if (input.action === "evidence") {
        const task = p.tasks.find((t) => t.id === input.taskId);
        if (!task) throw new Error("작업을 찾을 수 없습니다.");
        task.status = "completed";
        w.evidence.push({ taskId: task.id, text: input.text, createdAt: now });
        p.messages.push({ id: randomUUID(), role: "user", channel: "main", text: `[${task.title}] 결과: ${input.text}`, shared: true, createdAt: now });
        announce(`실행 결과를 팀 전체에 공유했어요: ${input.text}\n결과 제출은 검증 합격을 뜻하지 않아요. 해당 에이전트의 평가 모드에서 검토할 수 있습니다.`);
      } else if (input.action === "purchase") {
        const text = recordPurchase(p, input.ref, input.status, input.note);
        Object.assign(w, workflowFor(p));
        p.messages.push({ id: randomUUID(), role: "user", channel: "main", text, shared: true, createdAt: now });
        announce(input.status === "problem" ? `${text}. 충돌 카드를 열었어요. 대장이 대체 부품과 바뀌는 설계를 정리해 선택지를 올릴 거예요.` : `${text}. 모든 에이전트에게 공유했어요. 변경된 모델·수량이 있다면 채팅으로 알려주세요.`);
      } else if (input.action === "task_status") {
        const task = setTaskStatus(p, input.taskId, input.status, "human", { note: input.note });
        const label = { ready: "할 예정", in_progress: "하는 중", blocked: "막힘", cannot: "못 함", completed: "완료" }[input.status];
        const text = `[${task.title}] ${label}${input.note ? ` · ${input.note}` : ""}`;
        if (input.status === "completed" && input.note) w.evidence.push({ taskId: task.id, text: input.note, createdAt: now });
        p.messages.push({ id: randomUUID(), role: "user", channel: "main", text, shared: true, createdAt: now });
        w.sharedUpdates.push({ id: randomUUID(), agent: "chief", text: `사용자 진행: ${text}${input.status === "completed" ? " (결과 제출, 검증 합격 아님)" : ""}`, createdAt: now });
        pushActivity(p, { source: "person", title: `할 일 ${label}`, detail: task.title });
      } else if (input.action === "resolve_conflict") {
        if (!input.optionId && !input.proposal) throw new CoordinationError("선택지를 고르거나 제안을 적어주세요.");
        const conflict = resolveConflictByPerson(p, input.conflictId, { optionId: input.optionId, proposal: input.proposal });
        const option = conflict.options.find((o) => o.id === conflict.resolution?.optionId);
        const text = option ? `[충돌: ${conflict.title}] '${option.label}'을(를) 골랐어요.` : `[충돌: ${conflict.title}] 제안: ${input.proposal}`;
        p.messages.push({ id: randomUUID(), role: "user", channel: "main", text, shared: true, createdAt: now });
        w.sharedUpdates.push({ id: randomUUID(), agent: "chief", text: option ? `${text} 대장이 설계도·회로·할 일에 반영해야 해요.` : `${text} 대장이 검토해 선택지를 다시 올리거나 반영해야 해요.`, createdAt: now });
        pushActivity(p, { source: "person", title: option ? "충돌 선택" : "충돌에 제안", detail: conflict.title });
      } else if (input.action === "reopen") {
        w.phase = "brainstorm"; w.circuitApprovedAt = null; w.mockupApprovedAt = null;
        p.stage = "idea";
        announce("설계 논의를 다시 열었어요. 기존 산출물은 참고용으로 남고, 새 회로와 3D는 다시 승인받습니다.");
      } else {
        Object.assign(w, transition(w, input.action, !!p.build));
        pushActivity(p, { source: "person", title: { plan: "계획 시작", approve_circuit: "회로 승인", approve_mockup: "3D 승인", enter_workshop: "최종 설계 확정" }[input.action] });
        const decisions = { plan: "브레인스토밍을 마치고 회로 계획을 시작할게요.", approve_circuit: "회로 방향을 승인합니다. 3D 목업을 만들어주세요.", approve_mockup: "3D 목업 방향을 승인합니다. 다음 작업을 나눠주세요.", enter_workshop: "부품 재고를 모두 확인했어요. 설계를 최종 확정하고 작업대로 갈게요." };
        p.messages.push({ id: randomUUID(), role: "user", channel: "main", text: decisions[input.action], createdAt: now, shared: true });
        if (input.action === "plan") {
          p.stage = "spec"; p.build = newBuild; p.lastAgentMode = "live";
          p.tasks = p.tasks.map((task) => task.kind === "confirm_spec" ? { ...task, status: "completed" } : task);
          announce("브레인스토밍을 마치고 회로 초안을 준비했어요. 오른쪽 회로 탭에서 연결과 미확정 사항을 확인해주세요. 회로 방향을 승인하면 3D 목업을 만듭니다.");
        } else if (input.action === "approve_circuit") {
          p.build = approvedCad(p.build!, p.productForm);
          announce("회로 방향을 승인했어요. 승인된 부품과 치수로 3D 목업을 만들었어요. 드래그해서 돌려보고 형태를 검토해주세요. 이 승인은 실물 전기 검증의 합격과는 별개예요.");
        } else if (input.action === "approve_mockup") {
          announce("3D 목업 방향을 승인했어요. 다음 할 일 탭에서 사람과 AI의 작업을 나누고 BOM의 구매 상태를 확인해주세요.");
          p.tasks = p.tasks.filter((t) => !["measure", "run_firmware"].includes(t.kind));
          const build = p.build!;
          for (const [kind, texts] of [["measure", build.evaluator.hw.requiredMeasurements], ["run_firmware", build.evaluator.sw.requiredRuns]] as const) {
            texts.forEach((plain, index) => p.tasks.push({ id: randomUUID(), kind, title: `${kind === "measure" ? "회로 계측" : "펌웨어 확인"} ${index + 1}`, plain, status: "ready" }));
          }
        } else { p.stage = "workshop"; announce("설계를 최종 확정했어요. 이제 작업대에서 사람이 할 일과 순서를 따라 만들어요. 확정 뒤 설계를 바꿔야 하면 변경 제안 카드로 올려 선택을 받을게요."); }
      }
      p.workflow = w;
    }, project.designRevision);
    if (input.action === "profile") await saveMakerProfile(input.profile as MakerProfile, ownerIdOf(viewer));
    return NextResponse.json({ project: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "요청에 실패했습니다.";
    if (message.includes("max_tokens") || message.startsWith("MODEL_OUTPUT_INVALID")) {
      console.error("model response incomplete", message);
      return NextResponse.json({ error: "AI 설계 응답이 길어서 중간에 끊겼어요. 저장된 것은 없어요. 한 번 더 눌러보고, 같은 문제가 반복되면 Claude 커넥터 대화에서 “회로 제출해줘”로 진행해주세요." }, { status: 502 });
    }
    return NextResponse.json({ error: message.includes("BUDGET") ? "설정된 API 비용 한도에 도달했습니다. 한도를 확인해주세요." : error instanceof z.ZodError ? "입력값을 확인해주세요." : message }, { status: 409 });
  }
}

export const POST = withViewerVault(handlePOST);
