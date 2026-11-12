// 3D 작업대의 쉬운 말 사전. 하드웨어를 처음 만지는 사람이 모를 수 있는 말에 ⓘ를 붙이고,
// 누르면 짧은 설명을 보여 준다. HW 달그락 서랍의 빠른 질문으로도 쓴다.

export type GlossaryEntry = {
  term: string;
  /** 같은 뜻으로 쓰는 다른 말 (본문에서 이 말도 찾는다) */
  aliases?: string[];
  /** 한두 문장. 해요체 */
  short: string;
};

export const GLOSSARY: GlossaryEntry[] = [
  { term: "만능기판", short: "구멍이 바둑판처럼 뚫린 연습용 판이에요. 구멍마다 동그란 구리(패드)가 있어서, 부품 다리를 꽂고 납으로 붙여요." },
  { term: "패드", short: "구멍 둘레의 작은 동그란 구리예요. 납은 이 구리와 부품 다리에만 붙어요." },
  { term: "구리 면", aliases: ["납땜 면"], short: "기판 뒤쪽, 반짝이는 구리 동그라미가 보이는 면이에요. 부품은 반대쪽(글자 면)에 꽂고, 납땜은 이 면에서 해요." },
  { term: "인두", short: "끝이 300℃ 넘게 뜨거워지는 펜 모양 도구예요. 납을 녹일 때 써요. 손잡이만 잡고, 쉴 때는 꼭 받침에 꽂아요." },
  { term: "실납", short: "실처럼 가늘게 감긴 납이에요. 인두로 데운 곳에 대면 녹아서 부품과 기판을 붙여요. 속에 플럭스가 들어 있어요." },
  { term: "플럭스", short: "실납 속에 든 송진 같은 약이에요. 녹을 때 금속 표면을 깨끗하게 해서 납이 잘 붙게 해요. 납땜할 때 나는 연기는 대부분 이거예요." },
  { term: "예비납", short: "붙이기 전에 전선 끝이나 패드에 납을 미리 살짝 입혀 두는 거예요. 나중에 대기만 하면 금방 붙어요." },
  { term: "냉납", short: "열이 모자라거나, 굳는 동안 움직여서 생긴 나쁜 납땜이에요. 회색이고 울퉁불퉁해요. 전기가 잘 안 통하거나 나중에 떨어져요." },
  { term: "납 부족", short: "납이 덜 들어가서 구멍 둘레가 다 안 덮인 상태예요. 다시 데우고 납을 조금 더 넣으면 돼요." },
  { term: "브리지", aliases: ["납 다리"], short: "납이 넘쳐 옆 구멍까지 이어 붙은 거예요. 전기가 가면 안 되는 길(합선)이 생겨요." },
  { term: "합선", aliases: ["단락"], short: "전기가 가면 안 되는 지름길로 흐르는 거예요. 부품이 안 켜지거나 뜨거워지고, 전지는 위험할 수 있어요." },
  { term: "니퍼", short: "전선이나 부품 다리를 자르는 작은 가위 같은 공구예요. 납땜 위로 길게 남은 다리를 짧게 잘라요." },
  { term: "와이어 스트리퍼", short: "전선 겉의 비닐(피복)만 벗기고 속 구리는 남기는 공구예요. 전선 굵기에 맞는 홈에 끼우고 당겨요." },
  { term: "피복 벗기기", short: "전선 끝 비닐을 조금 잘라 내서 속 구리를 드러내는 일이에요. 구리가 보여야 납이 붙어요." },
  { term: "피복", short: "전선을 감싼 비닐 껍질이에요. 전기가 밖으로 새지 않게 막아 줘요." },
  { term: "헤더 핀", aliases: ["헤더"], short: "검은 플라스틱에 쇠 핀이 한 줄로 박힌 부품이에요. 모듈에 납땜해 두면 브레드보드에 꽂았다 뺐다 할 수 있어요." },
  { term: "브레드보드", short: "납땜 없이 부품을 꽂아 회로를 만드는 구멍 판이에요. 여기서는 핀을 곧게 잡아 주는 받침으로 써요." },
  { term: "극성", short: "+와 − 방향이 정해져 있다는 뜻이에요. LED·전지처럼 극성이 있는 부품은 거꾸로 꽂으면 안 돼요." },
  { term: "저항", short: "전기가 너무 많이 흐르지 않게 막아 주는 작은 부품이에요. 방향은 상관없어요." },
  { term: "LED", short: "전기가 흐르면 빛나는 작은 전구예요. 극성이 있어서 긴 다리가 +예요." },
  { term: "모듈", short: "작은 기판에 필요한 부품이 미리 붙어 있는 덩어리예요. 핀 몇 개만 연결하면 써요." },
  { term: "멀티미터", short: "전압이나 두 점이 이어졌는지를 재는 측정기예요. 빨간·검은 바늘(프로브)을 대서 재요." },
  { term: "통전", short: "두 점이 전기로 이어져 있는지 보는 거예요. 멀티미터가 ‘삐’ 하면 이어진 거고, 조용하면 끊어진 거예요." },
  { term: "열수축 튜브", short: "데우면 쪼그라드는 튜브예요. 납땜한 곳에 씌우고 데우면 맨 금속을 꼭 감싸 줘요." },
  { term: "솔더윅", short: "납을 빨아들이는 구리 그물 줄이에요. 잘못 붙은 납 위에 대고 인두로 누르면 납이 줄로 스며들어요." },
  { term: "스루홀", short: "부품 다리를 구멍에 꽂아 반대편에서 납땜하는 방식이에요. 처음 연습하기 가장 쉬워요." },
  { term: "JST 커넥터", aliases: ["JST"], short: "배터리 선 끝에 달린 작고 흰 플러그예요. 판매처마다 빨간·검은 선 위치가 반대일 때가 있어요." },
  { term: "캡톤 테이프", short: "열에 강한 얇은 노란 테이프예요. 전기가 통하지 않아서 맨 금속을 덮을 때 써요." },
  { term: "지그", short: "부품을 곧게 잡아 주는 받침이에요. 손 대신 잡아 줘서 두 손을 쓸 수 있어요." }
];

const BY_WORD = new Map<string, GlossaryEntry>();
for (const e of GLOSSARY) for (const w of [e.term, ...(e.aliases ?? [])]) BY_WORD.set(w.toLowerCase(), e);
// 긴 말부터 찾아야 "피복 벗기기"가 "피복"보다 먼저 잡힌다
const WORDS = [...BY_WORD.keys()].sort((a, b) => b.length - a.length);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PATTERN = new RegExp(WORDS.map(escape).join("|"), "gi");

/** 말(또는 다른 이름)로 사전 항목을 찾는다. 없으면 null */
export function lookupGlossary(word: string): GlossaryEntry | null {
  return BY_WORD.get(word.trim().toLowerCase()) ?? null;
}

export type GlossSegment = string | { text: string; entry: GlossaryEntry };

/**
 * 글을 보통 글자와 사전 말로 나눈다. 같은 항목은 한 번만 표시한다.
 * seen을 넘기면 여러 문단에 걸쳐 한 번만 표시한다 (안에 표시한 항목을 더한다).
 */
export function splitGlossary(text: string, seen: Set<string> = new Set()): GlossSegment[] {
  const out: GlossSegment[] = [];
  let at = 0;
  for (const m of text.matchAll(PATTERN)) {
    const entry = BY_WORD.get(m[0].toLowerCase());
    if (!entry || seen.has(entry.term)) continue;
    seen.add(entry.term);
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push({ text: m[0], entry });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** 여러 글에 나오는 사전 항목 (나온 순서, 중복 없이) */
export function glossaryIn(texts: string[]): GlossaryEntry[] {
  const seen = new Set<string>();
  const out: GlossaryEntry[] = [];
  for (const t of texts) for (const s of splitGlossary(t, seen)) if (typeof s !== "string") out.push(s.entry);
  return out;
}
