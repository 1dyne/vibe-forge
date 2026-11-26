import seed from "./sam-seed.json";
import { guideToKit } from "./from-guide";
import type { LocalProject } from "../project-types";
import type { BenchKit } from "./types";

// 셈(SAM) 재고 저울 '사만다'의 조립을 로그인 없이 3D로 따라 해 보는 키트.
// 달그락 프로젝트에 넣는 시드(sam-seed.json)와 같은 조립 가이드를 그대로 쓴다. 값을 따로 적지 않는다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const args = (tool: string) => (seed.calls as Array<{ tool: string; args: any }>).find((c) => c.tool === tool)!.args;

export function samKit(): BenchKit {
  const guide = args("set_assembly_guide").guide as { steps: Array<{ cards: Array<Record<string, string>> }> };
  const circuit = args("submit_circuit").blueprint;
  const project = {
    id: "sam-scale", name: "사만다 저울 조립",
    assembly: { ...guide, steps: guide.steps.map((s, i) => ({ ...s, cards: s.cards.map((c, j) => ({ ...c, id: `s${i + 1}-c${j + 1}` })) })), updatedAt: "" },
    build: { blueprint: { components: circuit.components, nets: circuit.nets } },
    buildPlan: { connection: args("set_build_plan").plan.connection },
    housing: args("set_housing_plan").plan,
    productForm: args("set_product_form").form
  } as unknown as LocalProject;
  const kit = guideToKit(project)!;
  return {
    ...kit,
    id: "sam-scale",
    title: "사만다 저울 조립",
    subtitle: "로드셀·HX711·ATOMS3 Lite를 핀에 맞춰 끼워요",
    level: "처음",
    minutes: 10,
    learn: ["로드셀 4선이 HX711 어디로 가는지", "ATOMS3 Lite의 소켓과 핀 이름", "헤더를 한 칸도 밀리지 않게 꽂기", "로드셀은 한쪽 끝만 고정한다"],
    tools: ["인두", "실납", "니퍼", "멀티미터", "십자드라이버"],
    safety: ["보드를 꽂거나 뽑을 때는 USB를 먼저 빼요", "인두 끝은 330℃ 이상, 받침에만 둬요", "로드셀 선은 가늘어요. 잡아당기지 않아요"],
    provisional: undefined,
    unlisted: true
  };
}
