import type { AgentId, LocalProject, MakerProfile, Workflow } from "./project-types";

export const AGENTS: Record<AgentId, { name: string; title: string; description: string }> = {
  chief: { name: "대장 달그락", title: "프로젝트 총괄", description: "아이디어를 정리하고 팀의 방향과 다음 작업을 조율해요." },
  hw: { name: "HW 달그락", title: "회로 · 펌웨어", description: "회로와 펌웨어를 만들고, 계측으로 문제를 찾아요." },
  sw: { name: "SW 달그락", title: "웹 · 앱 · 소프트웨어", description: "필요한 소프트웨어를 만들고 완성된 결과를 검사해요." },
  me: { name: "ME 달그락", title: "기구 설계", description: "부품의 배치와 구조를 설계하고 실측 치수로 조정해요." },
  id: { name: "ID 달그락", title: "산업 디자인", description: "형태와 사용 경험, 착용감과 안전성의 충돌을 살펴봐요." }
};
export const TOOL_OPTIONS = ["멀티미터", "자", "니퍼", "캡톤 테이프", "버니어 캘리퍼스", "납땜 도구", "브레드보드", "3D 프린터", "Arduino 보드"];
export const emptyProfile = (): MakerProfile => ({ tools: [], toolsConfirmed: false, firmwareExperience: "unanswered", coreBehavior: "" });

// 제작 프로필에는 성격이 다른 두 가지가 섞여 있다. 가진 장비와 쌓인 경험은 사람에게
// 붙고 프로젝트가 바뀌어도 그대로다. 예산·기한·용도는 프로젝트마다 다르다.
// 이걸 가르지 않으면 지난 프로젝트의 예산이 새 프로젝트로 따라 들어오고,
// 반대로 장비는 프로젝트마다 다시 물어보게 된다.
const PERSON_FIELDS = ["tools", "toolsConfirmed", "firmwareExperience", "solderingSkill", "printerAccess", "region", "travelRange", "makerspaces", "devProfile"] as const;

export function personPart(profile: MakerProfile): Partial<MakerProfile> {
  const out: Record<string, unknown> = {};
  for (const field of PERSON_FIELDS) if (profile[field] !== undefined) out[field] = profile[field];
  return out as Partial<MakerProfile>;
}

// 계정에 저장된 사람 쪽 값을 프로젝트 프로필 위에 덮는다. 프로젝트 쪽 값(핵심 동작,
// 예산, 기한, 용도, 목표가)은 건드리지 않는다.
export const withPersonPart = (project: MakerProfile, account: MakerProfile | null): MakerProfile =>
  account ? { ...project, ...personPart(account) } : project;
export function recommendAgents(idea: string): AgentId[] {
  const agents: AgentId[] = ["hw"];
  if (/웹|앱|서버|대시보드|통신|클라우드|web|app/i.test(idea)) agents.push("sw");
  if (/로봇|기구|착용|하우징|몸체|케이스|3d|움직|서보/i.test(idea)) agents.push("me");
  if (/착용|팔|디자인|반려|외형|사용감|웨어러블/i.test(idea)) agents.push("id");
  return agents;
}
export function workflowFor(project: Pick<LocalProject, "idea" | "build" | "workflow">): Workflow {
  return project.workflow ?? { phase: project.build ? "circuit" : "brainstorm", profile: emptyProfile(), activeAgents: recommendAgents(project.idea), circuitApprovedAt: null, mockupApprovedAt: null, sharedUpdates: [], purchases: {}, evidence: [] };
}
export function intakeMissing(profile: MakerProfile): string[] {
  return [!profile.coreBehavior.trim() && "핵심 동작", !profile.toolsConfirmed && "보유 도구", profile.firmwareExperience === "unanswered" && "펌웨어 경험"].filter(Boolean) as string[];
}
export function transition(workflow: Workflow, action: "plan" | "approve_circuit" | "approve_mockup" | "enter_workshop", hasBuild: boolean): Workflow {
  const next = structuredClone(workflow);
  if (action === "plan") {
    const missing = intakeMissing(next.profile);
    if (missing.length) throw new Error(`먼저 ${missing.join(" · ")}을 알려주세요.`);
    if (next.phase !== "brainstorm") throw new Error("이미 계획 단계에 있습니다.");
    next.phase = "circuit";
  } else if (action === "approve_circuit") {
    if (next.phase !== "circuit" || !hasBuild) throw new Error("회로 초안을 만든 후 승인해주세요.");
    next.circuitApprovedAt = new Date().toISOString();
    next.phase = "mockup";
  } else if (action === "approve_mockup") {
    if (next.phase !== "mockup" || !next.circuitApprovedAt) throw new Error("회로 승인 후 3D 목업을 검토해주세요.");
    next.mockupApprovedAt = new Date().toISOString();
    next.phase = "handoff";
  } else {
    if (next.phase !== "handoff" || !next.mockupApprovedAt) throw new Error("회로와 3D를 승인한 후 대장간에 입장할 수 있습니다.");
    if (!next.activeAgents.length) throw new Error("함께 작업할 에이전트를 하나 이상 선택해주세요.");
    next.phase = "workshop";
  }
  return next;
}
