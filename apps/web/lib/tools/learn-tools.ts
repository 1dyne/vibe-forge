import { z } from "zod";
import { ASK_WHEN_LABEL, EXTRA_QUESTIONS } from "../checklist";
import { getMakerProfile, mutateProject, saveMakerProfile } from "../local-project-store";
import { STAGE_WHY } from "../learn";
import { emptyProfile, workflowFor } from "../workflow";
import { kit, projectIdSchema, type ToolDefinition } from "../tool-kit";

// 학습 모드: 사람이 "왜 그렇게 하는지도 알려줘"라고 하면 켠다. 계정에 저장돼 모든 프로젝트에 적용된다.
export const tools: ToolDefinition[] = [
  {
    name: "set_learning_mode", title: "학습 모드 켜기·끄기",
    description: "사용자가 \"왜 이렇게 하는지도 알려줘\", \"배우면서 하고 싶어\"라고 하면 켜고, \"설명은 짧게\", \"그냥 진행해줘\"라고 하면 끈다. 사용자가 말하지 않았는데 켜거나 끄지 않는다. 계정에 저장돼 다른 프로젝트에도 이어진다.",
    inputSchema: { type: "object", additionalProperties: false, required: ["projectId", "enabled"], properties: { projectId: projectIdSchema, enabled: { type: "boolean", description: "true=학습 모드 켜기" } } },
    run: async (input, context) => {
      const { projectId, enabled } = z.object({ projectId: z.string().uuid(), enabled: z.boolean() }).strict().parse(input);
      await kit.ownedProject(projectId, context);
      // 계정 프로필에 저장한다. saveMakerProfile이 그 사람의 다른 프로젝트에도 함께 맞춘다.
      const account = (await getMakerProfile(context.user.id)) ?? emptyProfile();
      await saveMakerProfile({ ...emptyProfile(), ...account, learningMode: enabled }, context.user.id);
      const updated = await mutateProject(projectId, (p) => { const w = workflowFor(p); w.profile = { ...w.profile, learningMode: enabled }; p.workflow = w; });
      return kit.stored(updated, context, enabled
        ? "학습 모드를 켰어요. 이제부터 결정마다 왜 그렇게 했는지, 다른 선택지는 무엇이었는지, 다음에 직접 정하려면 무엇을 보면 되는지를 짧게 함께 말해 주세요."
        : "학습 모드를 껐어요. 설명은 필요한 만큼만 짧게 해 주세요.");
    }
  }
];

export const GUIDE_SECTION = `## 학습 모드와 추가 질문
### 학습 모드 (get_project의 profile.learningMode)
- true일 때: 설계에서 무언가를 정할 때마다 세 가지를 짧게 함께 말한다. (1) 왜 이것을 골랐는지, (2) 다른 선택지는 무엇이었고 왜 고르지 않았는지, (3) 다음에 사용자가 직접 정하려면 무엇을 보면 되는지. 세 가지를 합쳐 다섯 문장을 넘기지 않는다.
- true일 때: 전문 용어는 처음 쓸 때 한 줄로 풀어 준다(예: 펌웨어 → 보드 안에서 도는 프로그램, GND → 전기가 돌아오는 길이자 0V 기준점). 같은 대화에서 다시 풀지 않는다.
- true일 때: 답을 주기 전에, 사용자가 고를 수 있는 것은 선택지를 먼저 보여주고 골라 보게 한 뒤 내 추천과 견준다. 한 턴에 한 번만 한다.
- true일 때: 단계가 바뀌면 그 단계가 왜 있는지 한두 문장으로 먼저 말한다.
${Object.values(STAGE_WHY).map((s) => `  - ${s.stage}: ${s.why}`).join("\n")}
- false이거나 없을 때: 위 설명을 붙이지 않고 필요한 만큼만 짧게 말한다. 사용자가 "왜?"라고 물으면 그때 답한다.
- 사용자가 켜 달라거나 꺼 달라고 하면 set_learning_mode로 기록한다. 말하지 않았는데 바꾸지 않는다.
- 학습 모드여도 목표를 낮추거나 단계를 건너뛰지 않는다. 설명의 깊이만 달라진다.

### 추가 질문 (profile.extras, 프로젝트마다 다른 것은 profile.projectExtras)
아래 질문은 처음에 몰아서 묻지 않는다. 각 질문의 "언제"에 적힌 단계에 들어가기 직전에만, 아직 답이 없을 때 묻는다.
- 반드시 선택지로 묻는다. 한 턴에 두 개까지만 묻는다.
- 답은 set_maker_profile의 extras(사람 것) 또는 projectExtras(프로젝트 것)에 질문 id를 키로, 선택지의 값을 그대로 넣어 저장한다. 여러 개 고르는 질문은 배열로 넣는다. 이미 있는 답은 함께 다시 보낸다.
- 사용자가 건너뛰겠다고 하면 다시 묻지 않고, 그 값은 모르는 것으로 두고 안전한 쪽으로 가정한다(도구가 없다고 가정, 국내 구매만 가정).
- 답에 따라 실제로 다르게 한다. 예: measureTools에 caliper가 없으면 0.1mm 실측을 부탁하지 않고 판매 페이지 주소나 자 옆에 놓고 찍은 사진을 부탁한다. installRights가 no면 설치 없이 올리는 방법을 먼저 찾는다. ageGuardian이 minor_alone이면 인두·칼·리튬 배터리가 나오는 단계 전에 어른과 함께 하도록 안내한다.
${EXTRA_QUESTIONS.map((q) => `- ${q.id} (${q.scope === "project" ? "projectExtras" : "extras"} · ${ASK_WHEN_LABEL[q.askWhen]} · ${q.kind === "multi" ? "여러 개" : "하나"}): ${q.question} → ${q.options.map((o) => `${o.value}=${o.label}`).join(" / ")}`).join("\n")}
`;
