import { z } from "zod";
import { mutateProject } from "../local-project-store";
import { kit, projectIdSchema, type ToolDefinition } from "../tool-kit";

// 제품 디자인(ID)은 초안까지 만들고, 사람 손이 필요한 곳과 그 이유, 마무리할 길을 남긴다.
// 곡면처럼 치수를 지키면서 만들 수 없는 것을 "됐다"고 하지 않기 위한 자리다.

import { FINISH_ROUTES, type DesignFinish, type FinishRoute } from "./finish-labels";
export { FINISH_ROUTES, type DesignFinish, type FinishRoute };

const Input = z.object({
  projectId: z.string().uuid(),
  draft: z.string().trim().min(5).max(600),
  limits: z.array(z.object({ what: z.string().trim().min(2).max(80), why: z.string().trim().min(5).max(300) }).strict()).min(1).max(8),
  toolsOnHand: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  routes: z.array(z.object({ route: z.enum(Object.keys(FINISH_ROUTES) as [FinishRoute, ...FinishRoute[]]), why: z.string().trim().min(5).max(300), steps: z.array(z.string().trim().min(2).max(200)).min(1).max(8), tool: z.string().trim().max(60).optional(), costKRW: z.number().int().min(0).max(10_000_000).nullish(), time: z.string().trim().max(40).optional() }).strict()).min(2).max(5),
  brief: z.string().trim().max(1500).optional()
}).strict();

export const tools: ToolDefinition[] = [{
  name: "set_design_finish", title: "디자인 초안과 사람이 마무리할 길",
  description: "ID 달그락이 형태 초안을 낸 뒤, 달그락이 치수를 지키며 만들 수 없는 곳(자유 곡면, 캐릭터 얼굴, 매끈한 표면)을 숨기지 않고 남긴다. 어디가 왜 사람 손이 필요한지(limits), 사용자가 다룰 수 있는 도구(toolsOnHand: get_project의 profile.extras.modeling3d·programsUsed에서 확인, 없으면 먼저 묻는다), 그리고 마무리할 길을 둘 이상(routes, 첫 번째가 추천) 적는다. 길: own_tool(가진 도구로 직접), easy_tool(틴커캐드·슬라이서), learn(배워서), outsource(외주), hand_finish(출력 뒤 퍼티·사포·도색), makerspace(메이커스페이스 도움), simplify(디자인을 낮춰 초안 그대로). 길마다 구체적인 단계와 대략의 비용·시간을 적고, 외주·메이커스페이스 길이 있으면 그대로 가져갈 의뢰서(brief: 치수, 건드리면 안 되는 자리, 원하는 인상)를 쓴다. 사람이 대시보드에서 길을 고른다.",
  inputSchema: { type: "object", additionalProperties: false, required: ["projectId", "draft", "limits", "routes"], properties: {
    projectId: projectIdSchema,
    draft: { type: "string", description: "초안이 어디까지 됐는지 두세 문장 (예: 둥근 모서리 몸통과 분할선, 서보 자리까지 잡았어요)" },
    limits: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", additionalProperties: false, required: ["what", "why"], properties: { what: { type: "string", description: "사람 손이 필요한 곳 (예: 머리의 둥근 곡면)" }, why: { type: "string", description: "왜 달그락이 끝까지 못 하는지" } } } },
    toolsOnHand: { type: "array", maxItems: 8, items: { type: "string" }, description: "사용자가 다룰 수 있는 도구 (예: 블렌더, 틴커캐드). 없으면 빈 배열" },
    routes: { type: "array", minItems: 2, maxItems: 5, description: "마무리할 길. 첫 번째가 추천", items: { type: "object", additionalProperties: false, required: ["route", "why", "steps"], properties: { route: { type: "string", enum: Object.keys(FINISH_ROUTES) }, why: { type: "string", description: "이 사용자에게 왜 이 길인지" }, steps: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } }, tool: { type: "string", description: "쓸 도구 이름 (선택)" }, costKRW: { type: ["integer", "null"], description: "대략의 비용(원). 모르면 null" }, time: { type: "string", description: "대략의 시간 (예: 2~3시간, 3일)" } } } },
    brief: { type: "string", description: "외주·메이커스페이스에 가져갈 의뢰서 (선택)" }
  } },
  run: async (input, context) => {
    const parsed = Input.parse(input);
    await kit.ownedProject(parsed.projectId, context);
    const { projectId, ...finish } = parsed;
    const updated = await mutateProject(projectId, (p) => { p.designFinish = { ...finish, chosen: p.designFinish?.chosen && finish.routes.some((r) => r.route === p.designFinish!.chosen) ? p.designFinish.chosen : undefined, updatedAt: new Date().toISOString() } as DesignFinish; });
    return kit.stored(updated, context, "디자인 초안과 마무리할 길을 남겼어요. 사람이 작업대에서 길을 고르면 그 길의 첫 단계부터 함께 가 주세요.");
  }
}];

export const GUIDE_SECTION = `## 제품 디자인(ID)은 초안까지, 마무리는 사람과 함께 (set_design_finish)
- ID 달그락은 규칙으로 말할 수 있는 디자인을 끝까지 한다: 비례, 분할선, 모서리 반경, 버튼·화면 배치, 색과 재질. 정밀 목업의 radius(둥근 모서리)까지는 치수를 지키며 만들 수 있다.
- 자유 곡면, 캐릭터 얼굴, 매끈하게 이어지는 표면은 달그락이 출력 가능한 파일로 끝까지 만들 수 없다. 이것을 "됐다"고 말하지 않는다. 초안을 낸 뒤 set_design_finish로 어디가 왜 사람 손이 필요한지와 마무리할 길을 남긴다.
- 길을 고르기 전에 사용자가 다룰 수 있는 도구를 확인한다(profile.extras.modeling3d, programsUsed). 답이 없으면 먼저 묻는다. 도구가 없는 사람에게 블렌더 작업을 첫 번째로 권하지 않는다.
- 길은 둘 이상 준다. 첫 시제품이면 simplify(초안 그대로)나 hand_finish(출력 뒤 손 마감)를 반드시 후보에 넣는다. 외주를 권할 때는 의뢰서를 써 주고, 건드리면 안 되는 자리(서보·나사·보드 자리, 분할선)를 치수로 적는다.
- 사람이 길을 고르면(get_project의 designFinish.chosen) 그 길의 단계대로 한 번에 하나씩 안내한다.`;
