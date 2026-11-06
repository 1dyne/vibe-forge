import { CATS, FOLLOW, ROOTS, toChip, type ChipTree } from "./chips";

// HANDOFF §4의 AI 응답과 같은 모양. 지금은 규칙 기반이고, 나중에 AI 호출로 바꿔도 화면은 그대로 쓴다.
export type FindAnalysis = {
  kind: "hardware" | "software";
  reason: string;
  safety: { ok: boolean; note: string };
  chips: ChipTree;
  engine: "rules";
};

const SOFTWARE = ["앱", "어플", "웹", "사이트", "홈페이지", "챗봇", "프로그램", "엑셀", "스프레드시트", "노션", "자동화", "크롤링", "대시보드", "블로그", "쇼핑몰", "게임", "소프트웨어", "확장 프로그램", "gpt", "api", "가계부", "일정 관리", "예약"];
// 손에 잡히는 물건이라는 단서. 하나라도 있으면 소프트웨어 단어가 있어도 하드웨어로 본다.
const PHYSICAL = ["화분", "식물", "고양이", "강아지", "현관", "문이", "문을", "문에", "택배", "우편", "컵", "물 마시", "책상", "침대", "손목", "몸에", "불빛", "불 끄", "불 켜", "스위치", "센서", "led", "버튼", "진동", "소리", "온도", "습도", "건조", "공기", "미세먼지", "아두이노", "esp32", "라즈베리", "기기", "장치", "만지", "들고 다니", "벽에", "흙", "밥그릇", "사료", "자세", "스트레칭", "걸음"];
// 저전압 범위를 넘는 것. 정중하게 거절하고 이유를 알려준다.
const UNSAFE: Array<{ words: string[]; note: string }> = [
  { words: ["220v", "220 v", "110v", "콘센트를 개조", "전선을 직접", "누전", "고전압", "차단기"], note: "콘센트 전기(220V)를 직접 다루는 건 감전·화재 위험이 있어서 여긴 아직 저전압만 다뤄." },
  { words: ["히터", "전기장판", "열선", "가열", "인두기를 만들", "토치"], note: "뜨겁게 데우는 장치는 화재 위험이 커서 여긴 아직 저전압 센서·불빛·작은 모터만 다뤄." },
  { words: ["혈압", "혈당", "진단", "치료", "심전도", "인슐린", "약을 대신"], note: "몸 상태를 판단하는 의료 기기는 검증이 필요해서 여긴 아직 다루지 않아." },
  { words: ["전기충격", "무기", "총", "폭발", "몰래 촬영", "도청"], note: "남을 다치게 하거나 몰래 엿보는 물건은 만들지 않아." }
];

function has(text: string, words: string[]) {
  return words.some((w) => text.includes(w));
}

export function normalize(idea: string) {
  return idea.toLowerCase().replace(/\s+/g, " ").trim();
}

export function classify(idea: string): Pick<FindAnalysis, "kind" | "reason" | "safety"> {
  const text = normalize(idea);
  const unsafe = UNSAFE.find((u) => has(text, u.words));
  const physical = has(text, PHYSICAL);
  const software = has(text, SOFTWARE);
  const kind = software && !physical ? "software" : "hardware";
  return {
    kind,
    reason: kind === "software" ? "화면 안에서 끝나는 일이라 앱이나 웹으로 충분해 보여." : "손에 잡히는 물건으로 풀면 화면을 안 봐도 돼.",
    safety: unsafe ? { ok: false, note: unsafe.note } : { ok: true, note: "" }
  };
}

const ROOT_PER_CAT = 3;
const ROOT_FIRST = 10;

/**
 * 뿌리 장작 전체를 첫 입력과 관련 있는 순서로 돌려준다.
 * 앞 10개는 갈래마다 2~3개씩 섞여 있고(첫 화면), 나머지는 고를 때마다 빈자리를 채우는 예비 장작이다.
 */
export function chipTree(idea: string): ChipTree {
  const text = normalize(idea);
  const score = (r: (typeof ROOTS)[number]) => r.keywords.filter((k) => text.includes(k)).length;
  const lanes = CATS.map((cat) => ROOTS.filter((r) => r.cat === cat)
    .map((r) => ({ r, s: score(r) }))
    .sort((a, b) => b.s - a.s || (a.r.fallbackRank ?? 99) - (b.r.fallbackRank ?? 99)));
  // 첫 화면: 갈래마다 관련 있는 것 최대 3개, 없으면 기본 2개
  const first = lanes.map((lane) => {
    const relevant = lane.filter((x) => x.s > 0).slice(0, ROOT_PER_CAT);
    return [...relevant, ...lane.filter((x) => x.s === 0).slice(0, Math.max(0, 2 - relevant.length))];
  });
  while (first.flat().length > ROOT_FIRST) {
    const biggest = first.reduce((a, b) => (b.length > a.length ? b : a));
    if (biggest.length <= 2) break;
    biggest.pop();
  }
  const firstIds = new Set(first.flat().map((x) => x.r.id));
  // 화면에서는 형태·반응·감지·누구를 번갈아 놓는다
  const ordered: typeof ROOTS = [];
  for (let i = 0; ordered.length < firstIds.size; i++) for (const lane of first) if (lane[i]) ordered.push(lane[i].r);
  // 예비 장작: 입력과 관련 있는 것 먼저, 그다음 갈래를 번갈아
  const rest = lanes.map((lane) => lane.filter((x) => !firstIds.has(x.r.id)));
  const reserve: typeof ROOTS = [];
  for (const x of rest.flat().filter((x) => x.s > 0).sort((a, b) => b.s - a.s)) reserve.push(x.r);
  const leftover = rest.map((lane) => lane.filter((x) => x.s === 0));
  for (let i = 0; leftover.some((l) => l[i]); i++) for (const lane of leftover) if (lane[i]) reserve.push(lane[i].r);
  const root = [...ordered, ...reserve].map(toChip);
  // 후속 장작은 고른 장작 아래로 몇 단계든 이어진다
  const follow: ChipTree["follow"] = {};
  const queue = root.map((r) => r.id);
  while (queue.length) {
    const id = queue.shift()!;
    if (follow[id] || !FOLLOW[id]) continue;
    follow[id] = FOLLOW[id];
    queue.push(...FOLLOW[id].map((c) => c.id));
  }
  return { root, follow };
}

export function analyzeFind(idea: string, forceHardware = false): FindAnalysis {
  const base = classify(idea);
  return { ...base, kind: forceHardware ? "hardware" : base.kind, chips: chipTree(idea), engine: "rules" };
}
