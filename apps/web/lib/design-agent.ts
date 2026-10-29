import { AnthropicModelAdapter, MockModelAdapter } from "@dalgeurak/agents";
import { calculateModelCost } from "@dalgeurak/domain";
import { z } from "zod";
import { withLocalCostReservation } from "./local-cost-ledger";
import type { AgentPlan, ImageAttachment, LocalProject, MakerProfile, SlotKey } from "./project-types";
import { modelImages } from "./attachments";
import { workflowFor } from "./workflow";

const slotKeys = ["power", "wireless", "sensing", "actuation", "data_sink", "form", "runtime", "fab"] as const;
const taskKinds = ["confirm_spec", "confirm_availability", "measure", "run_firmware", "provide_info"] as const;

const PlanSchema = z.object({
  projectName: z.string().min(1).max(80),
  oneLiner: z.string().min(1).max(240),
  reply: z.string().min(1).max(2400),
  slotUpdates: z.array(z.object({
    key: z.enum(slotKeys),
    status: z.enum(["empty", "assumed", "filled"]),
    valueText: z.string().nullable(),
    assumption: z.string().nullable(),
    acknowledged: z.boolean()
  }).strict()).max(8),
  tasks: z.array(z.object({
    kind: z.enum(taskKinds),
    title: z.string().min(1).max(100),
    plain: z.string().min(1).max(500)
  }).strict()).max(5)
}).strict();

const planJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["projectName", "oneLiner", "reply", "slotUpdates", "tasks"],
  properties: {
    projectName: { type: "string" },
    oneLiner: { type: "string" },
    reply: { type: "string" },
    slotUpdates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "status", "valueText", "assumption", "acknowledged"],
        properties: {
          key: { type: "string", enum: slotKeys },
          status: { type: "string", enum: ["empty", "assumed", "filled"] },
          valueText: { type: ["string", "null"] },
          assumption: { type: ["string", "null"] },
          acknowledged: { type: "boolean" }
        }
      }
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "plain"],
        properties: {
          kind: { type: "string", enum: taskKinds },
          title: { type: "string" },
          plain: { type: "string" }
        }
      }
    }
  }
} as const;

function mockPlan(message: string, project?: LocalProject): AgentPlan {
  const projectName = project?.name ?? (message.replace(/\s+/g, " ").trim().slice(0, 24) || "새 제작 프로젝트");
  const slotUpdates: AgentPlan["slotUpdates"] = project ? [] : [
    { key: "form", status: "assumed", valueText: null, assumption: "우선 실내 탁상용 목업으로 진행", acknowledged: false },
    { key: "fab", status: "assumed", valueText: null, assumption: "브레드보드와 3D 프린트 사용 가능으로 가정", acknowledged: false }
  ];
  return {
    projectName,
    oneLiner: project?.oneLiner ?? `${message.slice(0, 100)} 아이디어를 실제 제작 가능한 설계로 구체화합니다.`,
    reply: project
      ? "답변을 저장했습니다. 현재는 mock 모드라 의미 해석 대신 기록만 반영했습니다. live 모드에서는 이 답변을 바탕으로 설계 슬롯과 다음 작업을 다시 계산합니다."
      : "아이디어를 프로젝트로 만들었습니다. 먼저 실제 동작 목표와 사용 환경을 확인한 뒤 회로·부품·3D 목업·펌웨어 순서로 좁혀가겠습니다.",
    slotUpdates,
    tasks: project ? [] : [
      { kind: "confirm_spec", title: "핵심 동작 정하기", plain: "완성품이 무엇을 감지하고 어떻게 반응해야 하는지 한 문장으로 알려주세요." },
      { kind: "provide_info", title: "사용 가능한 제작 도구 확인", plain: "보유한 보드, 멀티미터, 납땜 도구, 3D 프린터 사용 가능 여부를 알려주세요." }
    ]
  };
}

export async function runDesignAgent(message: string, project?: LocalProject, attachments: ImageAttachment[] = [], savedProfile?: MakerProfile | null): Promise<{ plan: AgentPlan; mode: "mock" | "live"; costUsd: number }> {
  const live = process.env.APP_MODE === "live";
  const fixture = mockPlan(message, project);
  const adapter = live
    ? new AnthropicModelAdapter(process.env.ANTHROPIC_MODEL_SMALL ?? "")
    : new MockModelAdapter(fixture);

  const maxOutputTokens = 2200;
  const maximumCallUsd = 0.04;
  if (live) {
    const turnLimit = Number(process.env.LLM_COST_LIMIT_PER_TURN_USD ?? 0);
    const dayLimit = Number(process.env.LLM_COST_LIMIT_PER_DAY_USD ?? 0);
    if (turnLimit < maximumCallUsd || dayLimit < maximumCallUsd) {
      throw new Error("LIVE_BUDGET_BLOCKED");
    }
  }

  const invoke = async () => {
    const result = await adapter.call({
      role: "chief",
      schemaName: "design_intake",
      schema: planJsonSchema as unknown as Record<string, unknown>,
      maxOutputTokens,
      effort: "low",
      images: modelImages([...((project?.messages ?? []).flatMap((m) => m.attachments ?? []).slice(-2)), ...attachments].slice(-3)),
      instructions: [
        "당신은 달그락 대장간의 프로젝트 총괄 '대장 달그락'이다. 제목은 사용자 문장을 복사하지 말고 20자 이내 프로젝트 이름으로 요약한다.",
        "reply는 600자 이하, 질문은 이번 턴에 가장 필요한 2개 이하로 쓴다. slotUpdates에는 새로 확인되거나 가정한 슬롯만 최대 4개 넣고 빈 슬롯을 모두 나열하지 않는다. tasks는 최대 3개이며 plain은 120자 이하로 쓴다.",
        "아이디어 단계의 모든 질의는 브레인스토밍이다. 불완전한 핵심 동작·환경·구현 요구에 대해서 질문하고, 아직 제작이나 승인을 완료했다고 말하지 않는다.",
        "보유 도구와 펌웨어 설치 경험을 확인한다. 초보자여도 목표 난이도를 낮추지 말고 용어를 풀어서 설명한다. 프로필에 답이 있으면 같은 질문을 반복하지 않는다.",
        "첨부 이미지가 있으면 보이는 특징을 아이디어 논의에 반영하고, 이미지에서 알 수 없는 치수나 전압은 질문한다.",
        "사용자가 명시한 사실만 filled로 두고, 합리적 임시값은 assumed로 두며 acknowledged=false로 둔다.",
        "확인되지 않은 수치·부품·재고를 만들지 않는다.",
        "확인받지 않은 assumed 슬롯은 전체에서 최대 3개다.",
        "다음에 사람이 답하거나 수행해야 할 작업을 구체적인 한국어로 최대 5개 만든다.",
        "멀티미터 측정이나 펌웨어 실행은 안전한 절차를 만들 정보가 충분할 때만 요청한다.",
        "기존 프로젝트가 있으면 사용자의 새 답변으로 달라진 슬롯만 slotUpdates에 넣는다."
      ].join("\n"),
      input: {
        userMessage: message,
        makerProfile: project ? workflowFor(project).profile : savedProfile,
        existingProject: project ? {
          name: project.name,
          oneLiner: project.oneLiner,
          slots: project.slots,
          openTasks: project.tasks.filter((task) => task.status === "ready"),
          workflow: workflowFor(project),
          recentMessages: project.messages.slice(-8).map(({ text, role, agent }) => ({ text, role, agent }))
        } : null
      }
    }, PlanSchema);
    const costUsd = result.provider === "anthropic" ? calculateModelCost({ input: 2, output: 10 }, result.usage) : 0;
    return { plan: result.parsed as AgentPlan, mode: live ? "live" as const : "mock" as const, costUsd };
  };

  if (!live) return invoke();
  const dailyLimit = Number(process.env.LLM_COST_LIMIT_PER_DAY_USD);
  return withLocalCostReservation(maximumCallUsd, dailyLimit, async () => {
    const value = await invoke();
    return { value, actualUsd: value.costUsd };
  });
}

export const DesignAgentSlotKeys: readonly SlotKey[] = slotKeys;
