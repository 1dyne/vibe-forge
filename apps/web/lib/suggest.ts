import { checklistMissing } from "./checklist";
import type { LocalProject } from "./project-types";
import { openTasks } from "./project-types";
import { workflowFor } from "./workflow";

// 입력창에 흐리게 띄울 "다음에 할 법한 말". 비개발자는 무엇을 물어야 하는지부터 막힌다.
// 그대로 보내도 되고, 쓰기 시작하면 사라진다. 지금 단계에서 실제로 다음 차례인 것만 고른다.
export function suggestNext(project: LocalProject | null): string | null {
  if (!project) return null;
  const workflow = workflowFor(project);
  switch (workflow.phase) {
    case "brainstorm":
      if (checklistMissing(workflow.profile).required.length) return "체크리스트부터 같이 채워줘";
      if (!project.productForm) return "완성품이 어떤 모양일지 같이 정하자";
      if (!project.buildPlan) return "전체 설계도를 만들어줘";
      return "1단계 회로를 제안해줘";
    case "circuit": return "이 회로를 쉬운 말로 설명해줘";
    case "mockup": return "3D에서 내가 무엇을 확인하면 돼?";
    case "handoff": return project.assembly ? "누구와 같이 만들지 팀을 정해줘" : "조립 가이드를 만들어줘";
    case "workshop": return openTasks(project.tasks).length ? "지금 내가 할 일을 하나씩 알려줘" : "다음 단계로 넘어가자";
    default: return null;
  }
}
