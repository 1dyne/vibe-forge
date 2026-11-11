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
import { unackedRisks } from "../../../../../lib/safety";
import { validateLog } from "../../../../../lib/contract";
import { snapshot, RESTORABLE, FIELD_LABEL } from "../../../../../lib/history";

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
  z.object({ action: z.literal("reopen") }),
  z.object({ action: z.literal("evidence"), taskId: z.string(), text: z.string().trim().min(1).max(3000) }),
  z.object({ action: z.literal("dev_profile"), devProfile: z.object({ codingExperience: z.enum(["unanswered", "none", "guided", "independent"]), tool: z.enum(["undecided", "claude_code", "codex"]), os: z.enum(["unanswered", "mac", "windows", "linux"]), installed: z.array(z.string().max(40)).max(12), confirmed: z.boolean() }).strict() }),
  z.object({ action: z.literal("assembly_report"), step: z.number().int().min(1).max(20), cardId: z.string().regex(/^(s\d+-c\d+|lib:[a-z0-9-]+)$/).optional(), text: z.string().trim().min(1).max(1000), value: z.number().finite().nullable().optional(), yes: z.boolean().nullable().optional() }),
  z.object({ action: z.literal("detail_request"), step: z.number().int().min(1).max(20), level: z.enum(["beginner", "micro"]) }),
  z.object({ action: z.literal("reset_stage"), stage: z.enum(["product_form", "plan"]) }),
  z.object({ action: z.literal("safety_ack"), itemId: z.string().max(32) }),
  z.object({ action: z.literal("test_result"), caseId: z.string().max(32), status: z.enum(["pass", "fail", "unknown"]), evidence: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("restore_version"), snapshotId: z.string().uuid() }),
  z.object({ action: z.literal("contract_check"), source: z.enum(["device_log", "app_sample"]), lines: z.string().trim().min(1).max(20000) }),
  z.object({ action: z.literal("purchase"), ref: z.string().max(80), status: z.enum(["needed", "ordered", "received", "problem"]), note: z.string().max(1000).default("") })
]);
async function handlePOST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  try {
    const input = Input.parse(await request.json());
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
    if (input.action === "enter_workshop" && unackedRisks(project).length) {
      return NextResponse.json({ error: `안전 검토에서 확인할 위험이 ${unackedRisks(project).length}개 있어요. 작업대의 '안전'에서 하나씩 '확인했어요'를 눌러 주세요.` }, { status: 409 });
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
      } else if (input.action === "safety_ack") {
        const item = p.safety?.items.find((i) => i.id === input.itemId);
        if (!item) throw new Error("안전 항목을 찾을 수 없어요.");
        item.ackAt = now;
        pushActivity(p, { source: "person", title: `안전 확인: ${item.text.slice(0, 40)}` });
      } else if (input.action === "test_result") {
        const c = p.testPlan?.cases.find((x) => x.id === input.caseId);
        if (!c) throw new Error("테스트를 찾을 수 없어요.");
        c.result = { status: input.status, evidence: input.evidence, at: now, by: "person" };
        p.messages.push({ id: randomUUID(), role: "user", channel: "main", text: `테스트 '${c.title}' 결과: ${{ pass: "기대대로 돼요", fail: "기대와 달라요", unknown: "잘 모르겠어요" }[input.status]}\n${input.evidence}`, createdAt: now, shared: true });
      } else if (input.action === "contract_check") {
        if (!p.dataContract) throw new Error("데이터 약속이 아직 없어요.");
        const r = validateLog(p.dataContract, input.lines, { dir: input.source === "device_log" ? "device_to_app" : "app_to_device", ignoreNoise: true });
        const problems = [...r.results.filter((x) => !x.ok).map((x) => `"${x.line}": ${x.errors.join(", ")}`), ...r.missing.map((m) => `${m} 메시지가 한 번도 안 나왔어요`)];
        p.dataContract.runs = [...p.dataContract.runs, { id: randomUUID(), at: now, source: input.source, total: r.total, ok: r.ok, problems: problems.slice(0, 10), by: "person" as const }].slice(-20);
        p.messages.push({ id: randomUUID(), role: "user", channel: "main", text: `데이터 약속 검사(${input.source === "device_log" ? "보드 시리얼 로그" : "앱 출력"}): ${r.total}줄 중 ${r.ok}줄 일치.${problems.length ? `\n안 맞는 곳: ${problems.slice(0, 5).join(" / ")}` : ""}`, createdAt: now, shared: true });
      } else if (input.action === "restore_version") {
        const snap = p.history?.find((h) => h.id === input.snapshotId);
        if (!snap || !RESTORABLE.includes(snap.field)) throw new Error("이 기록은 되돌릴 수 없어요. 완성품 형태·회로는 '단계 다시'로 바꿔 주세요.");
        snapshot(p, snap.field, "restore_version", `${FIELD_LABEL[snap.field]} 되돌리기 전`);
        (p as unknown as Record<string, unknown>)[snap.field] = JSON.parse(snap.snapshot);
        announce(`${FIELD_LABEL[snap.field]}를 ${new Date(snap.at).toLocaleString("ko-KR")} 버전으로 되돌렸어요. 되돌리기 전 버전도 기록에 남아 있어요.`);
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
        if (!p.build?.blueprint.components.some((c) => c.ref === input.ref)) throw new Error("부품을 찾을 수 없습니다.");
        w.purchases[input.ref] = input.status;
        const text = `${input.ref} 구매 상태: ${{needed:"구매 예정",ordered:"주문 완료",received:"수령 완료",problem:"문제 발생"}[input.status]}${input.note ? ` · ${input.note}` : ""}`;
        p.messages.push({ id: randomUUID(), role: "user", channel: "main", text, shared: true, createdAt: now });
        announce(`${text}. 모든 에이전트에게 공유했어요. 변경된 모델·수량이 있다면 채팅으로 알려주세요.`);
      } else if (input.action === "reopen") {
        w.phase = "brainstorm"; w.circuitApprovedAt = null; w.mockupApprovedAt = null;
        p.stage = "idea";
        announce("설계 논의를 다시 열었어요. 기존 산출물은 참고용으로 남고, 새 회로와 3D는 다시 승인받습니다.");
      } else {
        Object.assign(w, transition(w, input.action, !!p.build));
        pushActivity(p, { source: "person", title: { plan: "계획 시작", approve_circuit: "회로 승인", approve_mockup: "3D 승인", enter_workshop: "대장간 입장" }[input.action] });
        const decisions = { plan: "브레인스토밍을 마치고 회로 계획을 시작할게요.", approve_circuit: "회로 방향을 승인합니다. 3D 목업을 만들어주세요.", approve_mockup: "3D 목업 방향을 승인합니다. 다음 작업을 나눠주세요.", enter_workshop: "선택한 달그락 팀과 대장간에서 작업을 시작할게요." };
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
        } else { p.stage = "workshop"; announce("대장간에 오신 것을 환영해요. 팀 전체 또는 개별 작업실에서 대화하세요. 모든 방의 변경·관측·제안은 공통 기록에 공유됩니다. 제가 담당과 다음 순서를 조율할게요."); }
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
