import type { LocalProject } from "./project-types";

// 프로젝트가 무엇을 만드는 일인지에 따라 처음 카드가 달라야 한다.
// "모바일 게임"에 "보유 도구 · 펌웨어 경험 · 회로 계획"을 묻는 것은 틀린 질문이다.
// 설계도(buildPlan.track)가 있으면 그것을 따르고, 없으면 아이디어 글에서 조심스럽게 짐작한다.
// 양쪽 낱말이 다 있거나 아무것도 없으면 unknown으로 두고 대장 달그락이 먼저 묻게 한다.
export type ProjectKind = "hardware" | "software" | "both" | "unknown";

// 손에 잡히는 물건·부품·감지·움직임을 가리키는 말
const HARD = /센서|보드|아두이노|라즈베리|esp32|회로|배터리|전지|모터|서보|led|엘이디|버튼을 누르|스위치|납땜|3d ?프린|하우징|케이스|로봇|웨어러블|측정기|저울|무게|조명|램프|부저|스피커|마이크|카메라 모듈|디스플레이 모듈|기기|장치|iot|블루투스|착용|화분|키보드|리모컨|usb/i;
// 화면 안에서만 도는 것을 가리키는 말
const SOFT = /모바일 게임|게임|앱|어플|웹사이트|홈페이지|웹 ?페이지|웹앱|사이트|챗봇|크롬 확장|확장 프로그램|플러그인|스크립트|자동화|대시보드|쇼핑몰|블로그|프로그램|소프트웨어|api|서버/i;

export function projectKind(project: Pick<LocalProject, "idea" | "buildPlan"> | null | undefined): ProjectKind {
  if (!project) return "unknown";
  if (project.buildPlan?.track) return project.buildPlan.track;
  const idea = project.idea ?? "";
  const hard = HARD.test(idea); const soft = SOFT.test(idea);
  if (hard && soft) return "both";
  if (hard) return "hardware";
  if (soft) return "software";
  return "unknown";
}

export type StageCard = {
  kind: ProjectKind;
  title: string;
  description: string;
  /** 체크 표시로 보여줄 항목. key는 화면이 채워졌는지 판단할 때 쓴다 */
  checklist: Array<{ key: "coreBehavior" | "tools" | "firmwareExperience" | "whatToMake" | "whereToRun" | "codingExperience"; label: string }>;
  /** 체크리스트 버튼의 글 */
  action: string;
  /** 입력창에 흐리게 띄울 다음 말 */
  nextSentence: string;
  /** 준비가 됐을 때 무엇이라고 말하면 되는지 */
  readyHint: string;
};

/** 아이디어 단계의 첫 카드. 종류에 맞는 질문만 보여준다. */
export function stageCardFor(project: Pick<LocalProject, "idea" | "buildPlan"> | null | undefined): StageCard {
  const kind = projectKind(project);
  if (kind === "software") return {
    kind, title: "만들기 전에, 함께 확인할 것",
    description: "화면 안에서 도는 것을 만드시네요. 무엇을 어디서 쓰는지와 코딩 경험을 알려주세요. 경험은 설명을 맞추는 데만 써요.",
    checklist: [{ key: "whatToMake", label: "무엇을 만드는지" }, { key: "whereToRun", label: "어디서 쓰는지 (휴대폰·컴퓨터)" }, { key: "codingExperience", label: "코딩 경험" }],
    action: "코딩 경험 알려주기", nextSentence: "어떤 화면부터 만들지 같이 정하자", readyHint: "준비가 되면 “어떤 화면부터 만들지 같이 정하자”라고 말해주세요."
  };
  if (kind === "unknown") return {
    kind, title: "먼저, 무엇을 만드는지",
    description: "손에 잡히는 물건인지, 화면 안에서 도는 것인지에 따라 가는 길이 달라요. 대장 달그락에게 만들고 싶은 것을 조금 더 들려주세요.",
    checklist: [{ key: "whatToMake", label: "무엇을 만드는지" }],
    action: "가진 장비·경험 알려주기", nextSentence: "이게 물건인지 앱인지부터 같이 정하자", readyHint: "대장 달그락이 먼저 물어볼 거예요."
  };
  return {
    kind, title: "설계 전, 함께 확인할 것",
    description: kind === "both" ? "물건과 앱을 함께 만드시네요. 무엇이 어떻게 반응하는지, 가진 도구, 보드에 코드를 올려 본 경험을 알려주세요. 경험은 설명을 맞추는 데만 써요." : "무엇이 어떻게 반응하는지, 가진 도구, 보드에 코드를 올려 본 경험을 알려주세요. 경험은 설명을 맞추는 데만 써요.",
    checklist: [{ key: "coreBehavior", label: "핵심 동작" }, { key: "tools", label: "가진 도구" }, { key: "firmwareExperience", label: "보드에 코드 올려 본 경험" }],
    action: "체크리스트 작성하기", nextSentence: "체크리스트부터 같이 채워줘", readyHint: "준비가 되면 “완성품이 어떤 모양일지 같이 정하자”라고 말해주세요."
  };
}
