import { CATS, FOLLOW, ROOTS, toChip, type ChipTree, type ReactKind } from "./chips";

export type MakerKind = "hardware" | "software" | "twin" | "design";
/** 도깨비 그림의 민트(#96C6BC쯤)를 달그락 색으로 옮기는 값. CSS filter(hue-rotate → saturate → brightness)와 3D 셰이더가 같은 값을 쓴다. */
export type Tint = { deg: number; sat: number; bri: number };
/** 달그락 대장간에서 쓰는 색 그대로. tint는 도깨비 그림을 정확히 그 색으로 옮기도록 맞춘 값이다(색을 바꾸면 같이 다시 구한다). */
export const MAKER: Record<MakerKind, { name: string; color: string; tint: Tint; line: string }> = {
  hardware: { name: "하드웨어 달그락", color: "#B7B3D7", tint: { deg: 89.5, sat: 0.9, bri: 0.975 }, line: "손에 잡히는 물건이야. 회로와 몸체를 같이 짜야 해." },
  software: { name: "소프트웨어 달그락", color: "#AAC8DF", tint: { deg: 46.2, sat: 0.97, bri: 1.044 }, line: "화면 안에서 끝나는 일이야. 앱이나 웹으로 만들어." },
  twin: { name: "쌍둥이 달그락", color: "#B7B3D7", tint: { deg: 89.5, sat: 0.9, bri: 0.975 }, line: "물건과 화면이 같이 움직여야 해. 하드웨어와 소프트웨어 달그락이 함께 가." },
  design: { name: "디자인 달그락", color: "#F0DFA7", tint: { deg: -108.9, sat: 1.32, bri: 1.19 }, line: "생김새와 쓰임새가 먼저야. 모양부터 잡고 필요한 것을 채워." }
};
/** 아직 어느 달그락의 일인지 모를 때의 도깨비: 대장 민트 */
export const CHIEF_COLOR = "#9DD2C8";
const CHIEF_TINT: Tint = { deg: 1.4, sat: 1.045, bri: 1.058 };
export const isMaker = (v: unknown): v is MakerKind => typeof v === "string" && Object.prototype.hasOwnProperty.call(MAKER, v);
/** 달그락 종류 이름(또는 "none")으로 색 옮김 값을 찾는다. 모르는 값이면 대장 민트다. */
export const tintOf = (key?: string | null): Tint => (isMaker(key) ? MAKER[key].tint : CHIEF_TINT);
export const tintCss = (key?: string | null) => { const t = tintOf(key); return `hue-rotate(${t.deg}deg) saturate(${t.sat}) brightness(${t.bri})`; };
/** 같은 색 옮김을 3×3 행렬(행 순서)로. 밝기 · 채도 · 색상환 순으로 곱한 것이다. */
export function tintMatrix(key?: string | null): number[] {
  const { deg, sat, bri } = tintOf(key);
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const H = [
    [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
    [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283],
    [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072]
  ];
  const S = [
    [0.213 + 0.787 * sat, 0.715 - 0.715 * sat, 0.072 - 0.072 * sat],
    [0.213 - 0.213 * sat, 0.715 + 0.285 * sat, 0.072 - 0.072 * sat],
    [0.213 - 0.213 * sat, 0.715 - 0.715 * sat, 0.072 + 0.928 * sat]
  ];
  const out: number[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out.push(bri * (S[i][0] * H[0][j] + S[i][1] * H[1][j] + S[i][2] * H[2][j]));
  return out;
}

/** 불 하나를 어느 달그락이 맡는가. 새 불은 카드에 적혀 있고, 예전 불은 아이디어로 다시 가른다. */
export function fireMaker(f: { maker?: string | null; card?: { maker?: string } | null; idea?: string | null }): MakerKind {
  if (isMaker(f.maker)) return f.maker;
  const fromCard = f.card?.maker;
  if (isMaker(fromCard)) return fromCard;
  return f.idea ? classify(f.idea).kind : "hardware";
}
/** 도깨비 옆에 작은 도형으로 보여 줄 반응(빛·소리·움직임). 예전 불은 처음 고른 반응 하나만 안다. */
export function fireReacts(f: { card?: { reacts?: string[]; attr?: { kind?: string } } | null; reactKind?: string | null }): ReactKind[] {
  const list = f.card?.reacts ?? [f.card?.attr?.kind ?? f.reactKind ?? "none"];
  return [...new Set(list)].filter((k): k is ReactKind => k === "light" || k === "sound" || k === "move");
}

// HANDOFF §4의 AI 응답과 같은 모양. 지금은 규칙 기반이고, 나중에 AI 호출로 바꿔도 화면은 그대로 쓴다.
export type FindAnalysis = {
  /** 어느 달그락의 일인가. twin = 하드웨어와 소프트웨어가 같이 쓰이는 것(쌍둥이 달그락), design = 모양과 쓰임새가 먼저인 것 */
  kind: MakerKind;
  reason: string;
  /** ok=false는 남을 해치는 것뿐이다. 아이디어 단계에서는 그 밖의 것을 막지 않는다 */
  safety: { ok: boolean; note: string };
  /** 막지는 않지만 미리 알려 둘 것(콘센트 전기, 뜨거워지는 것, 몸 상태를 재는 것). 대장간에서 안전하게 만드는 길부터 같이 본다 */
  caution: string;
  chips: ChipTree;
  engine: "rules";
};

const SOFTWARE = ["앱", "어플", "웹", "사이트", "홈페이지", "챗봇", "프로그램", "엑셀", "스프레드시트", "노션", "자동화", "크롤링", "대시보드", "블로그", "쇼핑몰", "게임", "소프트웨어", "확장 프로그램", "gpt", "api", "가계부", "일정 관리", "예약",
  // 데이터·분석·글쓰기처럼 화면 안에서 끝나는 일
  "분석", "데이터", "통계", "리포트", "보고서", "시각화", "그래프", "차트", "설문", "투표", "선거", "여론", "주식", "코인", "파이썬", "코딩", "논문", "번역", "요약", "글쓰기", "마케팅", "sns", "유튜브", "인스타", "영상 편집"];
// 모양과 쓰임새가 먼저인 것
const DESIGN = ["디자인", "예쁜", "예쁘게", "귀여운", "인테리어", "소품", "굿즈", "피규어", "키링", "장식", "오브제", "캐릭터", "케이스", "거치대", "받침대", "정리함", "트레이", "꽃병", "액자"];
// 전기가 들어가는 단서. 있으면 디자인만의 일이 아니다.
const ELECTRIC = ["센서", "led", "불빛", "불 켜", "불 끄", "버튼", "진동", "소리", "알려", "알림", "감지", "측정", "재는", "자동", "모터", "움직", "충전", "배터리"];
// 손에 잡히는 물건이라는 단서. 하나라도 있으면 소프트웨어 단어가 있어도 하드웨어로 본다.
const PHYSICAL = ["화분", "식물", "고양이", "강아지", "현관", "문이", "문을", "문에", "택배", "우편", "컵", "물 마시", "책상", "침대", "손목", "몸에", "불빛", "불 끄", "불 켜", "스위치", "센서", "led", "버튼", "진동", "소리", "온도", "습도", "건조", "공기", "미세먼지", "아두이노", "esp32", "라즈베리", "기기", "장치", "만지", "들고 다니", "벽에", "흙", "밥그릇", "사료", "자세", "스트레칭", "걸음"];
// 아이디어 단계에서는 막지 않는다. 막으면 시작도 하기 전에 문턱이 생긴다.
// 조심해야 하는 것은 알려만 두고, 실제 설계는 대장간의 안전 검토가 다시 본다.
const CAUTION: Array<{ words: string[]; note: string }> = [
  { words: ["220v", "220 v", "110v", "콘센트", "누전", "고전압", "차단기"], note: "콘센트 전기(220V)가 닿는 부분은 위험해. 대장간에서는 이미 안전하게 만들어진 어댑터나 스마트 플러그를 쓰는 길부터 같이 볼 거야." },
  { words: ["히터", "전기장판", "열선", "가열", "데우", "토치", "인두"], note: "뜨거워지는 건 불이 날 수 있어. 대장간에서 온도를 지켜보고 스스로 꺼지는 안전장치부터 같이 짤 거야." },
  { words: ["혈압", "혈당", "진단", "치료", "심전도", "인슐린"], note: "몸 상태를 재는 건 참고용으로만 만들 수 있어. 판단이나 치료를 대신하지는 않아." }
];
// 남을 해치거나 몰래 엿보는 것만 받지 않는다. 낱말 단위로 본다("총 3개", "총무"는 걸리지 않는다).
const HARM = [/(^|[\s,.])(권총|소총|총기|총알|실탄)/, /(^|[\s,.])총(을|으로|\s*(쏘|만들|제작))/, /무기/, /폭발물|폭탄/, /전기\s*충격기/, /몰래\s*(촬영|찍|녹음|엿)/, /몰카|도청/];

function has(text: string, words: string[]) {
  return words.some((w) => text.includes(w));
}

export function normalize(idea: string) {
  return idea.toLowerCase().replace(/\s+/g, " ").trim();
}

export function classify(idea: string): Pick<FindAnalysis, "kind" | "reason" | "safety" | "caution"> {
  const text = normalize(idea);
  const physical = has(text, PHYSICAL);
  const software = has(text, SOFTWARE);
  const design = has(text, DESIGN) && !has(text, ELECTRIC);
  const kind: MakerKind = software && physical ? "twin" : software ? "software" : design ? "design" : "hardware";
  return {
    kind,
    reason: MAKER[kind].line,
    safety: HARM.some((r) => r.test(text)) ? { ok: false, note: "남을 다치게 하거나 몰래 엿보는 물건은 만들지 않아." } : { ok: true, note: "" },
    caution: CAUTION.find((c) => has(text, c.words))?.note ?? ""
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
  return { ...base, kind: forceHardware && base.kind === "software" ? "twin" : base.kind, chips: chipTree(idea), engine: "rules" };
}
