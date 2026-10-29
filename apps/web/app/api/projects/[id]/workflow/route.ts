import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProject, mutateProject, saveMakerProfile } from "../../../../../lib/local-project-store";
import { hasValidOrigin } from "../../../../../lib/request-security";
import { transition, workflowFor } from "../../../../../lib/workflow";
import { approvedCad, runBuildPipeline } from "../../../../../lib/build-pipeline";
import type { MakerProfile } from "../../../../../lib/project-types";

const ProfileSchema = z.object({ tools: z.array(z.string().max(80)).max(30), toolsConfirmed: z.boolean(), firmwareExperience: z.enum(["unanswered", "none", "guided", "independent"]), coreBehavior: z.string().max(1800) }).strict();
const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("profile"), profile: ProfileSchema }),
  z.object({ action: z.literal("agents"), agents: z.array(z.enum(["hw", "sw", "me", "id"])).min(1).max(4) }),
  z.object({ action: z.literal("plan") }), z.object({ action: z.literal("approve_circuit") }),
  z.object({ action: z.literal("approve_mockup") }), z.object({ action: z.literal("enter_workshop") }),
  z.object({ action: z.literal("reopen") }),
  z.object({ action: z.literal("evidence"), taskId: z.string(), text: z.string().trim().min(1).max(3000) }),
  z.object({ action: z.literal("purchase"), ref: z.string().max(80), status: z.enum(["needed", "ordered", "received", "problem"]), note: z.string().max(1000).default("") })
]);
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  try {
    const input = Input.parse(await request.json());
    const { id } = await context.params;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    const current = workflowFor(project);
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
        const decisions = { plan: "브레인스토밍을 마치고 회로 계획을 시작할게요.", approve_circuit: "회로 방향을 승인합니다. 3D 목업을 만들어주세요.", approve_mockup: "3D 목업 방향을 승인합니다. 다음 작업을 나눠주세요.", enter_workshop: "선택한 달그락 팀과 대장간에서 작업을 시작할게요." };
        p.messages.push({ id: randomUUID(), role: "user", channel: "main", text: decisions[input.action], createdAt: now, shared: true });
        if (input.action === "plan") {
          p.stage = "spec"; p.build = newBuild; p.lastAgentMode = "live";
          p.tasks = p.tasks.map((task) => task.kind === "confirm_spec" ? { ...task, status: "completed" } : task);
          announce("브레인스토밍을 마치고 회로 초안을 준비했어요. 오른쪽 회로 탭에서 연결과 미확정 사항을 확인해주세요. 회로 방향을 승인하면 3D 목업을 만듭니다.");
        } else if (input.action === "approve_circuit") {
          p.build = approvedCad(p.build!);
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
    if (input.action === "profile") await saveMakerProfile(input.profile as MakerProfile);
    return NextResponse.json({ project: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "요청에 실패했습니다.";
    return NextResponse.json({ error: message.includes("BUDGET") ? "설정된 API 비용 한도에 도달했습니다. 한도를 확인해주세요." : error instanceof z.ZodError ? "입력값을 확인해주세요." : message }, { status: 409 });
  }
}
