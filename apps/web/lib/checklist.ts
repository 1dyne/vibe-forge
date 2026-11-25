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
  { key: "budgetKRW", question: "이 프로젝트에 투자하고 싶은 예산은요? (선택)", kind: "single", required: false, options: [{ value: "50000", label: "5만 원 이하" }, { value: "100000", label: "5~10만 원" }, { value: "200000", label: "10~20만 원" }, { value: "400000", label: "20~40만 원" }, { value: "custom", label: "직접 입력" }], hint: "정확하지 않아도 돼요. 쓰고 싶은 만큼(심리적 비용)을 적어주세요. 도구가 없으면 처음 한 번 개발 환경 세팅 비용이 따로 들어요" },
  { key: "timelineWeeks", question: "언제까지 만들고 싶나요? (선택)", kind: "single", required: false, options: [{ value: "1", label: "1주 안에" }, { value: "2", label: "2주 안에" }, { value: "4", label: "한 달 안에" }, { value: "12", label: "3개월 안에" }, { value: "", label: "정하지 않았어요" }], hint: "실력에 비해 짧으면 목표는 유지하고, 왜 어려운지와 어떤 순서로 가야 하는지 알려드려요" },
  { key: "travelRange", question: "메이커스페이스까지 어디까지 갈 수 있나요?", kind: "single", required: false, options: [{ value: "walk", label: "걸어서" }, { value: "transit30", label: "대중교통 30분" }, { value: "transit60", label: "대중교통 1시간" }, { value: "car", label: "차로 이동 가능" }] },
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

// ── 추가 질문 ────────────────────────────────────────────────────────────────
// 설계가 틀어지는 이유의 상당수는 "묻지 않아서 몰랐던 것"이다(캘리퍼스가 없는데 0.1mm
// 실측을 부탁한다, 학교 컴퓨터라 프로그램을 못 까는데 설치부터 안내한다).
// 한꺼번에 물으면 처음 온 사람이 질려 나가므로, 답이 필요한 단계 직전에만 묻는다(askWhen).
// 전부 선택형이고 전부 선택 사항이다. 답은 profile.extras[id]에 들어간다.
// scope가 project인 것은 프로젝트마다 다르므로 profile.projectExtras[id]에 둔다.

export type AskWhen = "start" | "before_form" | "before_circuit" | "before_first_measure" | "before_housing" | "before_firmware" | "before_buy";
export type ExtraQuestion = {
  id: string;
  question: string;
  kind: "single" | "multi";
  options: Array<{ value: string; label: string }>;
  /** 내 계정의 어느 탭에 두는가. project는 계정이 아니라 프로젝트 설정에 둔다 */
  tab: "skill" | "gear" | "place" | "project";
  scope: "person" | "project";
  askWhen: AskWhen;
  /** 이 답으로 달그락이 무엇을 달리 하는지. 화면과 모델 양쪽에 보인다 */
  hint: string;
};
export type ExtraAnswers = Record<string, string | string[]>;
/** 프로젝트마다 다른 추가 답까지 가진 프로필 */
export type ProfileWithProjectExtras = MakerProfile & { projectExtras?: ExtraAnswers };

const o = (value: string, label: string) => ({ value, label });
const UNSURE = o("unsure", "잘 모르겠어요");

export const EXTRA_QUESTIONS: ExtraQuestion[] = [
  // 장비·부품
  { id: "measureTools", tab: "gear", scope: "person", askWhen: "before_first_measure", kind: "multi", question: "치수나 값을 잴 수 있는 도구가 있나요?", hint: "없는 도구로 재 달라고 하지 않고, 사진이나 판매 페이지로 대신할 방법을 안내해요.",
    options: [o("ruler", "자 (mm 눈금)"), o("caliper", "버니어 캘리퍼스"), o("multimeter", "멀티미터"), o("scale", "저울 (g 단위)"), o("none", "아직 없어요")] },
  // 경험
  { id: "computer", tab: "skill", scope: "person", askWhen: "before_firmware", kind: "single", question: "어떤 컴퓨터로 작업하나요?", hint: "보드에 코드를 올리는 방법과 설치 안내가 컴퓨터마다 달라요.",
    options: [o("windows", "윈도우"), o("mac", "맥"), o("chromebook", "크롬북"), o("phone_only", "컴퓨터 없이 휴대폰·태블릿만")] },
  { id: "installRights", tab: "skill", scope: "person", askWhen: "before_firmware", kind: "single", question: "그 컴퓨터에 프로그램을 설치할 수 있나요?", hint: "설치가 막혀 있으면 설치 없이 쓰는 방법(웹에서 올리기)을 먼저 찾아요.",
    options: [o("yes", "네, 자유롭게 설치해요"), o("no", "아니요 (학교·회사 컴퓨터라 막혀 있어요)"), UNSURE] },
  { id: "usbPort", tab: "skill", scope: "person", askWhen: "before_buy", kind: "multi", question: "컴퓨터에 어떤 USB 구멍이 있나요?", hint: "보드와 맞는 케이블을 부품 목록에 넣어요.",
    options: [o("usb_a", "넓적한 네모 (USB-A)"), o("usb_c", "작고 둥근 모서리 (USB-C)"), UNSURE] },
  { id: "modeling3d", tab: "skill", scope: "person", askWhen: "before_housing", kind: "single", question: "3D 모양을 만드는 프로그램을 써 봤나요?", hint: "써 본 적이 없으면 달그락이 만든 파일을 받아 출력만 하도록 안내해요.",
    options: [o("none", "써 본 적 없어요"), o("tinkercad", "틴커캐드 정도"), o("fusion", "퓨전·온셰이프 같은 프로그램"), o("other", "다른 프로그램 (블렌더 등)")] },
  { id: "programsUsed", tab: "skill", scope: "person", askWhen: "before_firmware", kind: "multi", question: "써 본 프로그램을 모두 골라주세요", hint: "처음 쓰는 프로그램은 설치부터 한 단계씩 같이 가요.",
    options: [o("slicer", "슬라이서 (3D 프린터용 파일을 만드는 프로그램)"), o("arduino_ide", "아두이노 IDE (보드에 코드를 올리는 프로그램)"), o("circuit_tool", "회로 그리는 프로그램 (팅커캐드 회로, KiCad 등)"), o("none", "아무것도 써 본 적 없어요")] },
  { id: "electricBasics", tab: "skill", scope: "person", askWhen: "before_circuit", kind: "multi", question: "전기에 대해 아는 것을 모두 골라주세요", hint: "모르는 것은 회로를 보여줄 때 먼저 풀어서 설명해요.",
    options: [o("voltage_current", "전압과 전류가 무엇인지 알아요"), o("polarity", "+와 −를 거꾸로 꽂으면 안 된다는 걸 알아요"), o("used_multimeter", "멀티미터로 전압을 재 봤어요"), o("read_schematic", "회로도를 읽어 봤어요"), o("none", "전부 처음이에요")] },
  // 만드는 곳
  { id: "sessionTime", tab: "place", scope: "person", askWhen: "start", kind: "single", question: "한 번 앉으면 얼마나 작업할 수 있나요?", hint: "한 번에 끝낼 수 있는 크기로 일을 나눠요.",
    options: [o("30m", "30분쯤"), o("1h", "1시간쯤"), o("2h", "2~3시간"), o("half_day", "반나절 이상")] },
  { id: "solderSpace", tab: "place", scope: "person", askWhen: "before_circuit", kind: "single", question: "납땜을 할 수 있는 곳이 있나요?", hint: "없으면 납땜 없이 꽂아 쓰는 부품과 연결 방식을 먼저 골라요.",
    options: [o("home_ventilated", "집에서 창문 열고 할 수 있어요"), o("makerspace", "메이커스페이스에서 할 수 있어요"), o("none", "할 수 있는 곳이 없어요"), UNSURE] },
  { id: "ageGuardian", tab: "place", scope: "person", askWhen: "start", kind: "single", question: "만드는 분은 누구인가요?", hint: "뜨거운 인두·칼·배터리를 쓰는 단계에서 어른과 함께 하도록 안내해요.",
    options: [o("adult", "성인이에요"), o("minor_with_adult", "미성년자이고 어른이 함께해요"), o("minor_alone", "미성년자이고 혼자 해요")] },
  { id: "overseasOrder", tab: "place", scope: "person", askWhen: "before_buy", kind: "single", question: "해외 쇼핑몰에서 주문해도 괜찮나요?", hint: "안 되면 국내에서 구할 수 있는 부품으로만 골라요.",
    options: [o("ok", "괜찮아요"), o("domestic_only", "국내에서만 살게요"), UNSURE] },
  { id: "deliveryWait", tab: "place", scope: "person", askWhen: "before_buy", kind: "single", question: "부품을 얼마나 기다릴 수 있나요?", hint: "기다릴 수 있는 기간 안에 오는 부품과 판매처를 골라요.",
    options: [o("2d", "이틀 안에 와야 해요"), o("1w", "일주일쯤"), o("3w", "2~3주도 괜찮아요")] },
  { id: "helper", tab: "place", scope: "person", askWhen: "start", kind: "multi", question: "주변에 도와줄 사람이 있나요?", hint: "도와줄 사람이 있는 일은 그 사람과 함께 하는 순서로 짜요.",
    options: [o("solder", "납땜을 도와줄 사람"), o("code", "코딩을 도와줄 사람"), o("print", "3D 출력을 도와줄 사람"), o("none", "혼자 해요")] },
  { id: "stuckBefore", tab: "place", scope: "person", askWhen: "start", kind: "multi", question: "전에 무언가 만들다가 막힌 적이 있다면 어디였나요?", hint: "막혔던 곳은 더 잘게 나누고 먼저 확인해요.",
    options: [o("where_to_start", "어디서부터 시작할지"), o("parts", "무슨 부품을 사야 할지"), o("wiring", "선 연결"), o("upload", "보드에 코드 올리기"), o("case", "케이스 만들기"), o("never_tried", "처음 만들어 봐요")] },
  // 프로젝트마다 다른 것
  { id: "whereUsed", tab: "project", scope: "project", askWhen: "before_form", kind: "single", question: "완성품을 어디서 쓰나요?", hint: "재질과 구멍 위치, 방수 여부가 달라져요.",
    options: [o("indoor", "실내"), o("outdoor", "실외"), o("both", "둘 다")] },
  { id: "exposure", tab: "project", scope: "project", askWhen: "before_form", kind: "multi", question: "완성품이 닿게 되는 것을 모두 골라주세요", hint: "안전 검토와 재질, 틈을 막는 방법을 여기에 맞춰요.",
    options: [o("water", "물이나 비"), o("sweat", "땀"), o("heat", "열 (햇볕 아래 차 안, 난로 옆)"), o("kids_pets", "아이나 반려동물이 만져요"), o("skin", "몸에 계속 닿아요"), o("none", "해당 없어요")] },
  { id: "finishLevel", tab: "project", scope: "project", askWhen: "before_form", kind: "single", question: "어느 정도로 완성하고 싶나요?", hint: "목표는 낮추지 않아요. 어디에 시간을 더 쓸지만 정해요.",
    options: [o("works", "동작만 하면 돼요"), o("showable", "남에게 보여줄 수 있는 정도"), o("sellable", "팔 수 있는 정도")] },
  { id: "howMany", tab: "project", scope: "project", askWhen: "before_buy", kind: "single", question: "몇 개를 만드나요?", hint: "여러 개면 반복하기 쉬운 조립 방식과 예비 부품을 계산해요.",
    options: [o("1", "1개"), o("2_5", "2~5개"), o("6_20", "6~20개"), o("20_plus", "그보다 많이")] }
];

export const ASK_WHEN_LABEL: Record<AskWhen, string> = {
  start: "처음에", before_form: "완성품 모양을 정하기 전에", before_circuit: "회로를 정하기 전에", before_first_measure: "처음 무언가를 재 달라고 하기 전에",
  before_housing: "하우징(케이스)을 만들기 전에", before_firmware: "보드에 코드를 올리기 전에", before_buy: "부품을 사기 전에"
};

export const extraQuestionsFor = (tab: ExtraQuestion["tab"]) => EXTRA_QUESTIONS.filter((q) => q.tab === tab);
const answered = (value: string | string[] | undefined) => (Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.length > 0);
const answersFor = (profile: ProfileWithProjectExtras, q: ExtraQuestion): ExtraAnswers => (q.scope === "project" ? profile.projectExtras : profile.extras) ?? {};

/** 그 단계 직전에 물어야 하는데 아직 답이 없는 추가 질문 */
export function extrasMissing(profile: ProfileWithProjectExtras, when: AskWhen): ExtraQuestion[] {
  return EXTRA_QUESTIONS.filter((q) => q.askWhen === when && !answered(answersFor(profile, q)[q.id]));
}

/** 고른 값들을 사람이 읽는 글로 (모델에게 주는 요약, 화면의 요약 줄) */
export function extraAnswerText(q: ExtraQuestion, value: string | string[] | undefined): string {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((v) => q.options.find((x) => x.value === v)?.label ?? v).join(", ");
}

/** 모델이 그대로 물을 수 있는 번호 붙은 선택지. when을 주면 그 단계의 질문만 */
export function extrasText(when?: AskWhen): string {
  const list = EXTRA_QUESTIONS.filter((q) => !when || q.askWhen === when);
  return list.map((q, i) => {
    const head = `${i + 1}. ${q.question} [${q.id} · ${q.kind === "multi" ? "여러 개 선택" : "하나 선택"} · ${ASK_WHEN_LABEL[q.askWhen]}]`;
    return [head, ...q.options.map((opt, j) => `   ${"①②③④⑤⑥⑦⑧⑨⑩"[j]} ${opt.label} (${opt.value})`)].join("\n");
  }).join("\n");
}

/** 저장 전에 거른다: 모르는 질문, 선택지에 없는 값은 버린다 */
export function cleanExtras(input: unknown, scope: ExtraQuestion["scope"]): ExtraAnswers {
  const out: ExtraAnswers = {};
  if (!input || typeof input !== "object") return out;
  for (const q of EXTRA_QUESTIONS.filter((x) => x.scope === scope)) {
    const raw = (input as Record<string, unknown>)[q.id];
    const allowed = new Set(q.options.map((x) => x.value));
    if (q.kind === "multi") {
      const values = (Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : []).filter((v): v is string => typeof v === "string" && allowed.has(v));
      if (values.length) out[q.id] = [...new Set(values)];
    } else if (typeof raw === "string" && allowed.has(raw)) out[q.id] = raw;
  }
  return out;
}
