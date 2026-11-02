import type { MakerProfile } from "./project-types";
import { TOOL_OPTIONS, intakeMissing } from "./workflow";

// The maker checklist as explicit choices, shared by the Claude tool (which
// must ask exactly these options) and the dashboard form. No Node imports.

export type ChecklistQuestion = { key: keyof MakerProfile; question: string; kind: "single" | "multi" | "text" | "number"; required: boolean; options?: Array<{ value: string; label: string }>; hint?: string };

export const CHECKLIST: ChecklistQuestion[] = [
  { key: "coreBehavior", question: "완성되면 무엇을 감지하고, 어떻게 반응하나요? (한 문장)", kind: "text", required: true, hint: "예: 말을 걸면 눈을 깜빡이고 로봇 소리로 대답해요" },
  { key: "tools", question: "지금 쓸 수 있는 제작 도구를 모두 골라주세요", kind: "multi", required: true, options: [...TOOL_OPTIONS.map((t) => ({ value: t, label: t })), { value: "", label: "아직 없어요" }] },
  { key: "firmwareExperience", question: "보드에 코드를 올려본 적 있나요?", kind: "single", required: true, options: [{ value: "none", label: "처음이에요 · 단계마다 안내가 필요해요" }, { value: "guided", label: "안내를 보며 해본 적 있어요" }, { value: "independent", label: "보드 설정과 업로드를 직접 할 수 있어요" }] },
  { key: "solderingSkill", question: "납땜을 해본 적 있나요?", kind: "single", required: false, options: [{ value: "none", label: "해본 적 없어요" }, { value: "tried", label: "한두 번 해봤어요" }, { value: "comfortable", label: "익숙해요" }] },
  { key: "printerAccess", question: "3D 프린터를 쓸 수 있나요?", kind: "single", required: false, options: [{ value: "own", label: "내 프린터가 있어요" }, { value: "makerspace", label: "메이커스페이스를 이용할 수 있어요/알아보고 싶어요" }, { value: "service", label: "출력 대행 서비스를 쓸게요" }, { value: "none", label: "아직 모르겠어요" }] },
  { key: "region", question: "어느 지역에서 만드나요? (시·구, 메이커스페이스 안내용)", kind: "text", required: false, hint: "예: 서울 마포구" },
  { key: "budgetKRW", question: "부품에 쓸 수 있는 총 예산은요?", kind: "single", required: false, options: [{ value: "50000", label: "5만 원 이하" }, { value: "100000", label: "5~10만 원" }, { value: "200000", label: "10~20만 원" }, { value: "400000", label: "20~40만 원" }, { value: "custom", label: "직접 입력" }], hint: "선택지의 값은 범위의 상한이에요" },
  { key: "purpose", question: "무엇을 위해 만드나요?", kind: "single", required: false, options: [{ value: "personal", label: "내가 쓰려고" }, { value: "gift", label: "선물하려고" }, { value: "sell", label: "팔려고 (판매가를 알려주세요)" }, { value: "lecture", label: "수업·강연용" }] }
];

export function checklistMissing(profile: MakerProfile): { required: string[]; recommended: string[] } {
  const recommended = [
    (profile.solderingSkill ?? "unanswered") === "unanswered" && "납땜 경험",
    (profile.printerAccess ?? "unanswered") === "unanswered" && "3D 프린터",
    profile.budgetKRW == null && "예산",
    (profile.purpose ?? "unanswered") === "unanswered" && "목적",
    profile.purpose === "sell" && profile.targetPriceKRW == null && "판매가"
  ].filter(Boolean) as string[];
  return { required: intakeMissing(profile), recommended };
}

export function checklistText(): string {
  return CHECKLIST.map((q, i) => {
    const head = `${i + 1}. ${q.question}${q.required ? " (필수)" : ""}`;
    const opts = q.options?.map((o, j) => `   ${"①②③④⑤⑥⑦⑧⑨⑩"[j]} ${o.label}`).join("\n");
    return [head, opts ?? `   ${q.hint ?? "직접 입력"}`].join("\n");
  }).join("\n");
}
