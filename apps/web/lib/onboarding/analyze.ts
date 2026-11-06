import { CAPABILITY_BY_ID, capabilityWeight, extractCapabilities, normalizeIdea } from "./capabilities";
import { CATALOG, CATALOG_VERIFIED_AT, type CatalogEntry } from "./catalog";

export type IdeaKind = "hardware" | "software" | "unclear";

export type MatchedProject = {
  repo: string;
  url: string;
  name: string;
  summary: string;
  matchPercent: number;
  covered: string[];
  missing: string[];
};

export type DesignGap = {
  capability: string;
  label: string;
  design: string;
  helper: { name: string; url: string } | null;
};

export type IdeaAnalysis = {
  kind: IdeaKind;
  /** 하드웨어지만 앱·웹 화면도 필요한 경우 */
  needsSoftwareToo: boolean;
  capabilities: Array<{ id: string; label: string }>;
  matches: MatchedProject[];
  gaps: DesignGap[];
  openQuestions: string[];
  vibePrompt: string | null;
  catalogVerifiedAt: string;
};

const HARDWARE_WORDS = ["기기", "장치", "센서", "아두이노", "arduino", "라즈베리", "raspberry", "esp32", "회로", "납땜", "3d 프린", "케이스", "부착", "붙여서", "하드웨어", "만지면", "작동하는", "물건", "가젯", "전자"];
const SOFTWARE_WORDS = ["앱", "어플", "웹", "사이트", "홈페이지", "서비스", "플랫폼", "챗봇", "봇", "자동화", "엑셀", "스프레드시트", "크롬 확장", "확장 프로그램", "프로그램", "게임", "대시보드", "데이터베이스", "예약", "쇼핑몰", "블로그", "노션", "슬랙", "gpt", "크롤링", "api", "소프트웨어", "관리 시스템", "가계부", "일정 관리"];

// 이 정도로 덮으면 "그대로 쓸 수 있다"가 아니라 "출발점으로 좋다"는 뜻이다. 실제로 빌드해보기 전에는 100%라고 말하지 않는다.
const MAX_PERCENT = 92;
const MIN_PERCENT_TO_SHOW = 20;

function hits(text: string, words: string[]) {
  return words.filter((w) => text.includes(w)).length;
}

function repoUrl(repo: string) {
  return `https://github.com/${repo}`;
}

function score(required: string[], entry: CatalogEntry) {
  const total = required.reduce((sum, id) => sum + capabilityWeight(id), 0);
  const covered = required.filter((id) => entry.tags.includes(id));
  const got = covered.reduce((sum, id) => sum + capabilityWeight(id), 0);
  const ratio = total ? got / total : 0;
  const senses = covered.filter((id) => CAPABILITY_BY_ID.get(id)!.group === "sense").length;
  const core = covered.filter((id) => ["sense", "act"].includes(CAPABILITY_BY_ID.get(id)!.group)).length;
  return { covered, senses, core, missing: required.filter((id) => !entry.tags.includes(id)), percent: Math.min(MAX_PERCENT, Math.round(ratio * 100)) };
}

export function classifyIdea(idea: string, capabilities = extractCapabilities(idea)): { kind: IdeaKind; needsSoftwareToo: boolean } {
  const text = normalizeIdea(idea);
  const physical = capabilities.filter((id) => ["sense", "act"].includes(CAPABILITY_BY_ID.get(id)!.group)).length;
  const hw = hits(text, HARDWARE_WORDS) + physical * 2 + (capabilities.length - physical);
  const sw = hits(text, SOFTWARE_WORDS);
  if (physical > 0 || (hw > 0 && hw >= sw)) return { kind: "hardware", needsSoftwareToo: sw > 0 };
  if (sw > 0) return { kind: "software", needsSoftwareToo: false };
  return { kind: "unclear", needsSoftwareToo: false };
}

export function vibeCodingPrompt(idea: string): string {
  const trimmed = idea.replace(/\s+/g, " ").trim().slice(0, 300);
  return [
    `나는 개발자가 아니야. "${trimmed}"를 만들고 싶어.`,
    "1) 내가 하루 만에 써볼 수 있는 가장 작은 버전을 핵심 기능 3개 이내로 제안해줘.",
    "2) 내가 모르는 용어는 풀어서 설명하고, 결정해야 할 것은 선택지로 물어봐줘.",
    "3) 동작하는 첫 화면을 먼저 만들고, 하나씩 기능을 붙여가자."
  ].join("\n");
}

export function analyzeIdea(idea: string, forcedKind?: Exclude<IdeaKind, "unclear">): IdeaAnalysis {
  const required = extractCapabilities(idea);
  const classified = classifyIdea(idea, required);
  const kind = forcedKind ?? classified.kind;
  const capabilities = required.map((id) => ({ id, label: CAPABILITY_BY_ID.get(id)!.label }));
  const base = { kind, needsSoftwareToo: classified.needsSoftwareToo, capabilities, catalogVerifiedAt: CATALOG_VERIFIED_AT };

  if (kind !== "hardware") {
    return { ...base, matches: [], gaps: [], openQuestions: [], vibePrompt: kind === "software" ? vibeCodingPrompt(idea) : null };
  }

  const matches = CATALOG
    .filter((entry) => entry.kind === "project")
    .map((entry) => ({ entry, ...score(required, entry) }))
    // 연결·전원·형태만 겹치는 프로젝트는 출발점이 못 된다. 감지나 반응 중 하나는 해결해줘야 보여준다.
    .filter((m) => m.percent >= MIN_PERCENT_TO_SHOW && m.core > 0)
    // 같은 점수면 감지(가장 어려운 부분)를 해결해주는 쪽, 그다음 군더더기 기능이 적은 쪽을 앞에 둔다.
    .sort((a, b) => b.percent - a.percent || b.senses - a.senses || a.entry.tags.length - b.entry.tags.length)
    .slice(0, 3)
    .map(({ entry, covered, missing, percent }) => ({
      repo: entry.repo,
      url: repoUrl(entry.repo),
      name: entry.name,
      summary: entry.summary,
      matchPercent: percent,
      covered: covered.map((id) => CAPABILITY_BY_ID.get(id)!.label),
      missing: missing.map((id) => CAPABILITY_BY_ID.get(id)!.label)
    }));

  // 가장 잘 맞는 프로젝트에 없는 기능 = 더 설계해야 하는 부분. 매칭이 없으면 요구 기능 전부가 새 설계다.
  const top = matches[0] ? CATALOG.find((e) => e.repo === matches[0].repo)! : null;
  const gapIds = required.filter((id) => !top?.tags.includes(id));
  const gaps: DesignGap[] = gapIds.map((id) => {
    const capability = CAPABILITY_BY_ID.get(id)!;
    const helper = CATALOG.find((e) => e.kind === "library" && e.tags.includes(id));
    return { capability: id, label: capability.label, design: capability.design, helper: helper ? { name: helper.name, url: repoUrl(helper.repo) } : null };
  });

  const openQuestions: string[] = [];
  const groups = new Set(required.map((id) => CAPABILITY_BY_ID.get(id)!.group));
  if (!groups.has("sense")) openQuestions.push("무엇을 감지하거나 입력받나요? (예: 온도, 움직임, 버튼)");
  if (!groups.has("act")) openQuestions.push("감지한 뒤 어떻게 반응하나요? (예: 불빛, 화면, 소리, 폰 알림)");
  if (!groups.has("power")) openQuestions.push("콘센트에 꽂아두나요, 배터리로 들고 다니나요?");
  if (!groups.has("form")) openQuestions.push("어디에 두고 쓰나요? (책상, 몸에 착용, 야외)");

  return { ...base, matches, gaps, openQuestions: openQuestions.slice(0, 3), vibePrompt: classified.needsSoftwareToo ? vibeCodingPrompt(idea) : null };
}
