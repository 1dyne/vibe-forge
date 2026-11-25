import { z } from "zod";
import { mutateProject } from "../local-project-store";
import { kit, projectIdSchema, ToolError, type ToolDefinition } from "../tool-kit";
import { buildLadder, ladderBrief, recordRung, verifyOf, viewLadder, VerifyError } from "../verify-ladder";

// 회로 검증 사다리 도구. 사다리 자체(순서, 방법, 기준)는 서버가 회로와 부품 카드에서 만들고,
// 달그락은 한 칸씩 사람에게 묻고 사람이 말해준 값을 그대로 적는다.

export const GUIDE_SECTION = `## 회로 검증 사다리 (get_verification_ladder · record_verification)
회로를 만든 뒤에는 "되나 안 되나"를 한꺼번에 보지 않는다. 서버가 회로와 부품 카드에서 만든 사다리를 아래 칸부터 한 칸씩 오른다: ① 전원 넣기 전 → ② 전원 → ③ 업로드 → ④ 부품 하나씩 → ⑤ 함께. 앞 단계가 모두 통과(또는 사람이 이유를 대고 건너뜀)해야 다음 단계가 열린다.
- 사람이 조립을 마쳤거나 "안 돼요"라고 하면 먼저 get_verification_ladder를 읽는다. 결과의 '다음에 받을 칸'이 지금 물어야 할 한 가지다.
- 한 번에 한 칸만 묻는다. 그 칸의 방법, 멀티미터 모드, 리드를 댈 곳, 단위를 사다리에 적힌 그대로 전한다. 말을 바꾸다 핀 이름이나 모드를 틀리지 않는다.
- 사람이 해야 할 차례이므로 update_work_card로 turn=person, ask에 그 칸의 방법과 "무엇을 돌려주면 되는지"(숫자와 단위 / 예·아니오 / 시리얼 모니터의 줄 그대로)를 적는다.
- 사람이 값을 말해주면 record_verification으로 그대로 적는다. 판정은 서버가 한다. 사람이 말하지 않은 값을 적거나, 값 없이 통과로 만들 수 없다.
- 정상 범위는 사다리에 출처와 함께 적힌 것만 말한다. '확인 필요'인 칸은 범위를 지어내지 않는다. 받은 값을 사람과 함께 보고(예: 3.3V 핀에서 3.28V), 사람이 맞다고 하면 yes로 다시 적는다. 확신이 없으면 모름으로 둔다.
- 범위 밖이면 그 칸의 '다음에 볼 것'을 따라 원인을 좁힌다. 증상에서 출발해 한 가지씩 바꿔 보게 하고, 고친 뒤 같은 칸을 다시 잰다. 다음 칸으로 넘어가지 않는다.
- 전원 넣기 전 단계에서 합선·방향 문제가 나오면 전원을 넣지 말라고 먼저 말한다.
- 건너뛰는 것은 사람의 결정이다. 사람이 건너뛰겠다고 하면 skip에 이유를 적는다. 건너뛴 칸은 통과가 아니며, 나중에 문제가 생기면 그 칸부터 다시 본다.
- 체크리스트에 멀티미터가 없으면 사다리가 눈·시리얼 모니터로 하는 확인으로 바뀌어 있다. 멀티미터 없이는 확인할 수 없는 칸을 사람에게 숨기지 않고 말한다. 사라고 권하지는 않되, 메이커스페이스에서 빌릴 수 있다고 알려줄 수 있다.
- 부품 카드가 없는 부품은 전용 칸이 없다. 데이터시트를 찾아 출처를 남기고(record_part_source), 정상 범위는 사람과 함께 그 문서에서 확인한다.
`;

const Input = z.object({
  projectId: z.string().uuid(),
  rungId: z.string().min(1).max(80),
  value: z.number().finite().min(-1e9).max(1e9).nullable().optional(),
  yes: z.boolean().nullable().optional(),
  text: z.string().max(600).nullable().optional(),
  photoNote: z.string().max(300).nullable().optional(),
  skip: z.string().max(300).nullable().optional()
}).strict();

export const tools: ToolDefinition[] = [
  {
    name: "get_verification_ladder", title: "회로 검증 사다리 읽기",
    description: "이 프로젝트의 회로를 어떤 순서로 무엇을 재서 확인할지(전원 넣기 전 → 전원 → 업로드 → 부품 하나씩 → 함께)와 지금까지 사람이 준 결과를 읽는다. 결과 글의 '다음에 받을 칸'에 방법·멀티미터 모드·리드 위치·단위·정상 범위(출처 있을 때만)가 있다. 사람에게 확인을 부탁하기 전에 호출한다.",
    inputSchema: { type: "object", additionalProperties: false, required: ["projectId"], properties: { projectId: projectIdSchema } },
    annotations: { readOnlyHint: true },
    run: async (input, context) => {
      const { projectId } = z.object({ projectId: z.string().uuid() }).strict().parse(input);
      const project = await kit.ownedProject(projectId, context);
      const ladder = buildLadder(project);
      const state = verifyOf(project);
      return { text: ladderBrief(ladder, state), data: { ladder: viewLadder(ladder, state) } };
    }
  },
  {
    name: "record_verification", title: "검증 결과 적기 (사람이 말해준 값)",
    description: "사다리의 한 칸에 대해 사람이 말해준 결과를 적는다: 잰 숫자(value, 그 칸의 단위로), 예/아니오(yes), 시리얼 모니터에 찍힌 줄(text). 서버가 출처 있는 정상 범위로 판정하고, 기준이 없으면 '모름'으로 둔다. 사람이 말하지 않은 값은 적지 않는다. 사람이 확인하지 않고 넘어가기로 했으면 skip에 이유를 적는다(통과로 세지 않는다). 잠긴 칸에는 적을 수 없다.",
    inputSchema: { type: "object", additionalProperties: false, required: ["projectId", "rungId"], properties: {
      projectId: projectIdSchema,
      rungId: { type: "string", description: "get_verification_ladder가 알려준 칸의 id" },
      value: { type: ["number", "null"], description: "사람이 잰 숫자. 그 칸의 단위(V, Ω)로" },
      yes: { type: ["boolean", "null"], description: "사람이 본 결과가 기대와 같았는지. 숫자를 받은 '확인 필요' 칸을 사람과 함께 판단했을 때도 여기에 적는다" },
      text: { type: ["string", "null"], description: "시리얼 모니터의 줄이나 사람이 본 것 그대로" },
      photoNote: { type: ["string", "null"], description: "사람이 보낸 사진에서 보인 것" },
      skip: { type: ["string", "null"], description: "사람이 이 칸을 건너뛰기로 한 이유" }
    } },
    run: async (input, context) => {
      const parsed = Input.parse(input);
      await kit.ownedProject(parsed.projectId, context);
      let summary = "";
      try {
        const updated = await mutateProject(parsed.projectId, (p) => {
          const { state, result, rung } = recordRung(buildLadder(p), verifyOf(p), parsed.rungId, parsed, "agent");
          p.verify = state;
          summary = result.skipped ? `'${rung.title}'을(를) 건너뛴 것으로 적었어요(통과 아님).`
            : result.verdict === "pass" ? `'${rung.title}': 통과로 적었어요. ${rung.ifPass}`
            : result.verdict === "fail" ? `'${rung.title}': 범위 밖이에요. 다음에 볼 것: ${rung.ifFail}`
            : `'${rung.title}': 값을 적었지만 출처 있는 기준이 없어 '모름'이에요. 값을 사람과 함께 보고, 사람이 맞다고 하면 yes로 다시 적어주세요.`;
        });
        const again = buildLadder(updated);
        return kit.stored(updated, context, `${summary}\n\n${ladderBrief(again, verifyOf(updated))}`);
      } catch (error) {
        if (error instanceof VerifyError) throw new ToolError(error.message);
        throw error;
      }
    }
  }
];
