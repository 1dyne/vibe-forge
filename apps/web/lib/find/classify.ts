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
const ROOT_MAX = 10;

/** 입력과 관련 있는 뿌리 장작을 갈래마다 2~3개 고른다. 관련 있는 게 없으면 기본 순서로 채운다. */
export function chipTree(idea: string): ChipTree {
  const text = normalize(idea);
  const picked: typeof ROOTS = [];
  for (const cat of CATS) {
    const scored = ROOTS.filter((r) => r.cat === cat)
      .map((r) => ({ r, score: r.keywords.filter((k) => text.includes(k)).length }))
      .sort((a, b) => b.score - a.score || (a.r.fallbackRank ?? 99) - (b.r.fallbackRank ?? 99));
    const relevant = scored.filter((s) => s.score > 0).slice(0, ROOT_PER_CAT);
    const fill = scored.filter((s) => s.score === 0).slice(0, Math.max(0, 2 - relevant.length));
    picked.push(...[...relevant, ...fill].map((s) => s.r));
  }
  // 10개를 넘으면 관련 없는 채움 장작부터 뺀다. 갈래마다 2개는 남긴다.
  while (picked.length > ROOT_MAX) {
    const counts = new Map(CATS.map((c) => [c, picked.filter((p) => p.cat === c).length]));
    const idx = [...picked].reverse().findIndex((p) => (counts.get(p.cat) ?? 0) > 2);
    if (idx < 0) break;
    picked.splice(picked.length - 1 - idx, 1);
  }
  // 화면에서는 갈래가 섞여 보이도록 형태·반응·감지·누구를 번갈아 놓는다.
  const lanes = CATS.map((c) => picked.filter((p) => p.cat === c));
  const root = [];
  for (let i = 0; root.length < picked.length; i++) for (const lane of lanes) if (lane[i]) root.push(toChip(lane[i]));
  const follow = Object.fromEntries(root.filter((r) => FOLLOW[r.id]).map((r) => [r.id, FOLLOW[r.id]]));
  return { root, follow };
}

export function analyzeFind(idea: string, forceHardware = false): FindAnalysis {
  const base = classify(idea);
  return { ...base, kind: forceHardware ? "hardware" : base.kind, chips: chipTree(idea), engine: "rules" };
}
