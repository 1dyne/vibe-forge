import type { BuildBlueprint, CircuitNet } from "./project-types";

// 학습 모드에서 보여주는 설명. 하드웨어가 처음인 사람이 "시키는 대로"에서 끝나지 않고
// 다음에는 스스로 정할 수 있게 하는 것이 목적이다. 그래서 낱말마다 세 가지를 적는다:
// 한 줄 뜻(oneLine), 왜 신경 써야 하는지(why), 다음에 내가 정하려면 무엇을 보면 되는지(decide).
// 틀린 설명은 없는 것보다 나쁘다. 일반적으로 성립하는 것만 적고, 부품마다 다른 숫자는
// "그 부품의 데이터시트에서 확인"으로 돌린다.

export type LearnNote = { term: string; aliases?: string[]; oneLine: string; why: string; decide: string };

export const LEARN_NOTES: Record<string, LearnNote> = {
  board: { term: "보드", aliases: ["마이크로컨트롤러", "개발 보드", "메인 보드"], oneLine: "센서 값을 읽고 LED·모터를 움직이는 작은 컴퓨터예요.", why: "모든 부품이 이 보드에 연결돼요. 보드를 잘못 고르면 필요한 기능(와이파이, 핀 수)이 없어서 처음부터 다시 사야 해요.", decide: "무선이 필요한지, 연결할 부품이 몇 개인지, 3.3V인지 5V인지 세 가지를 먼저 보면 돼요." },
  firmware: { term: "펌웨어", oneLine: "보드 안에서 도는 프로그램이에요.", why: "부품을 맞게 연결해도 펌웨어를 올리지 않으면 아무 일도 일어나지 않아요. 선 연결과 펌웨어의 핀 번호가 서로 같아야 해요.", decide: "\"무엇을 읽고, 어떤 조건에서, 무엇을 한다\"를 한 문장으로 적어 보면 그게 펌웨어의 뼈대예요." },
  voltage: { term: "전압", oneLine: "전기를 밀어내는 힘이에요. 단위는 V(볼트)예요.", why: "부품마다 견디는 전압이 정해져 있어요. 3.3V용 부품에 5V를 넣으면 고장 나고, 되돌릴 수 없어요.", decide: "부품의 동작 전압과 보드가 내주는 전압이 같은지 연결하기 전에 꼭 견줘 보세요." },
  current: { term: "전류", oneLine: "실제로 흐르는 전기의 양이에요. 단위는 A(암페어), 작은 부품은 mA를 써요.", why: "부품들이 쓰는 전류를 다 더한 값이 전원이 줄 수 있는 양보다 크면 꺼지거나 다시 켜지기를 반복해요.", decide: "부품마다 쓰는 전류를 더해 보고, 전원이 낼 수 있는 값의 70~80% 안에 들어오는지 보면 돼요." },
  gnd: { term: "GND", aliases: ["그라운드", "접지"], oneLine: "전기가 돌아오는 길이자 모든 전압을 재는 기준점(0V)이에요.", why: "부품들의 GND가 서로 이어져 있지 않으면 신호를 서로 다르게 읽어서 값이 엉뚱하게 나와요. 가장 흔한 실수예요.", decide: "새 부품을 붙일 때마다 \"이 부품의 GND가 보드의 GND와 이어져 있나\"부터 확인하세요." },
  polarity: { term: "극성", oneLine: "+와 −의 방향이에요.", why: "LED, 배터리, 일부 콘덴서는 방향이 있어요. 거꾸로 꽂으면 안 켜지거나 부품이 망가져요.", decide: "부품에 표시(긴 다리, 빨간 선, + 기호)가 있는지 보고, 표시가 있으면 방향이 있는 부품이에요." },
  resistor: { term: "저항", oneLine: "전류를 줄여 주는 부품이에요. 단위는 Ω(옴)이에요.", why: "LED를 저항 없이 바로 연결하면 전류가 너무 많이 흘러 LED나 보드의 핀이 망가져요.", decide: "LED에는 보통 220Ω~1kΩ을 써요. 정확한 값은 (전원 전압 − LED 전압) ÷ 원하는 전류로 계산해요." },
  pullup: { term: "풀업", aliases: ["풀업 저항", "풀다운"], oneLine: "아무것도 안 눌렀을 때 핀의 값을 한쪽으로 정해 주는 저항이에요.", why: "버튼을 뗀 상태의 핀은 값이 정해지지 않아 제멋대로 0과 1을 오가요. 풀업이 있어야 \"안 눌림\"이 분명해져요.", decide: "버튼이나 스위치를 달 때는 보드의 내장 풀업을 켤 수 있는지 먼저 보세요. 대부분 저항을 따로 달 필요가 없어요." },
  digital_pin: { term: "디지털 핀", oneLine: "켜짐(1)과 꺼짐(0) 두 가지만 다루는 핀이에요.", why: "버튼, LED처럼 두 상태만 있는 부품에 써요. 밝기나 거리처럼 중간값이 필요한 부품은 디지털 핀만으로는 읽을 수 없어요.", decide: "부품이 \"켜짐/꺼짐\"만 알려주면 디지털, \"얼마나\"를 알려주면 아날로그나 통신(I2C)을 봐요." },
  analog_pin: { term: "아날로그 핀", oneLine: "0과 1 사이의 중간값(전압의 크기)을 읽는 핀이에요.", why: "압력, 밝기, 가변저항처럼 값이 연속으로 변하는 부품은 아날로그 핀에 연결해야 해요. 보드마다 아날로그로 쓸 수 있는 핀이 정해져 있어요.", decide: "보드의 핀 배치도에서 ADC나 A0 같은 표시가 있는 핀을 고르세요." },
  pwm: { term: "PWM", oneLine: "아주 빠르게 켰다 껐다 해서 밝기나 속도를 조절하는 방법이에요.", why: "LED 밝기, 모터 속도, 서보 각도를 조절하려면 PWM이 되는 핀에 연결해야 해요.", decide: "\"세기를 조절하고 싶다\"면 PWM이 되는 핀인지 핀 배치도에서 확인하세요." },
  i2c: { term: "I2C", oneLine: "선 두 가닥(SDA, SCL)으로 여러 부품과 대화하는 통신 방식이에요.", why: "센서와 작은 화면 대부분이 I2C를 써요. 같은 두 선에 여러 부품을 함께 달 수 있어 핀을 아껴요.", decide: "부품 설명에 I2C라고 적혀 있으면 보드의 SDA·SCL 핀에 연결하고, 전원과 GND까지 선은 모두 네 가닥이에요." },
  i2c_address: { term: "I2C 주소", oneLine: "같은 선에 달린 부품들을 구별하는 번호예요.", why: "주소가 같은 부품 두 개를 같은 선에 달면 서로 겹쳐서 둘 다 제대로 읽히지 않아요.", decide: "부품을 두 개 이상 달 때는 각 부품의 주소(예: 0x3C)를 데이터시트에서 찾아 겹치지 않는지 보세요." },
  serial_monitor: { term: "시리얼 모니터", oneLine: "보드가 보내는 글자를 컴퓨터 화면에서 보는 창이에요.", why: "보드 안에서 무슨 일이 일어나는지 볼 수 있는 유일한 창이에요. 문제가 생기면 여기에 찍힌 값이 가장 큰 단서예요.", decide: "값이 이상하면 먼저 시리얼 모니터에 그 값을 찍어 보세요. 속도(예: 115200)가 코드와 같아야 글자가 깨지지 않아요." },
  breadboard: { term: "브레드보드", oneLine: "납땜 없이 부품을 꽂아서 연결해 보는 판이에요.", why: "틀려도 뽑아서 다시 꽂으면 되니 연습과 시험에 좋아요. 대신 흔들리면 접촉이 떨어져서, 들고 다니는 완성품에는 맞지 않아요.", decide: "처음 해 보는 연결은 브레드보드에서 먼저 확인하고, 동작이 확인된 뒤에 납땜으로 옮기세요." },
  soldering: { term: "납땜", oneLine: "녹인 납으로 부품과 선을 단단히 붙이는 일이에요.", why: "한 번 붙이면 흔들려도 떨어지지 않아 완성품에 써요. 대신 고치기 어렵고, 뜨거운 인두를 쓰므로 환기와 화상에 주의해야 해요.", decide: "\"들고 쓰거나 흔들리는가\"가 기준이에요. 책상 위에서만 쓰는 시험용이면 납땜 없이도 돼요." },
  jumper_wire: { term: "점퍼선", oneLine: "양 끝에 핀이 달려 꽂기만 하면 되는 짧은 전선이에요.", why: "브레드보드와 보드를 납땜 없이 잇는 데 써요. 끝이 수(핀)인지 암(구멍)인지에 따라 꽂을 수 있는 곳이 달라요.", decide: "연결할 양쪽이 핀인지 구멍인지 보고 수-수, 수-암, 암-암 가운데 고르세요." },
  regulator: { term: "레귤레이터", oneLine: "들쑥날쑥한 전압을 일정한 전압으로 바꿔 주는 부품이에요.", why: "배터리 전압은 쓰는 동안 계속 내려가요. 레귤레이터가 있어야 부품에 늘 같은 전압이 들어가요. 바꾸는 과정에서 열이 나요.", decide: "전원의 전압과 부품이 필요한 전압이 다르면 레귤레이터가 필요해요. 보드에 이미 들어 있는 경우가 많으니 먼저 확인하세요." },
  battery_protection: { term: "배터리 보호회로", oneLine: "리튬 배터리가 너무 충전되거나 너무 방전되지 않게 막아 주는 회로예요.", why: "리튬 배터리는 과충전·과방전·합선이 되면 부풀거나 불이 날 수 있어요. 보호회로 없는 배터리를 직접 충전하면 안 돼요.", decide: "배터리를 쓴다면 보호회로가 달린 것인지, 충전 모듈에 보호 기능이 있는지 판매 페이지에서 꼭 확인하세요." },
  multimeter_dc: { term: "DC 전압 모드", aliases: ["멀티미터 DC 전압"], oneLine: "멀티미터로 두 지점 사이의 전압을 재는 모드예요.", why: "\"전원이 제대로 들어오는가\"를 확인하는 가장 확실한 방법이에요. 대부분의 문제는 여기서 걸러져요.", decide: "빨간 리드는 재려는 곳, 검은 리드는 GND에 대요. 예상 전압보다 큰 범위(예: 20V)를 골라요." },
  multimeter_continuity: { term: "통전 모드", aliases: ["통전", "통전 검사"], oneLine: "두 지점이 전기로 이어져 있으면 삐 소리가 나는 멀티미터 모드예요.", why: "선이 끊겼는지, 납땜이 붙었는지, 붙으면 안 되는 곳이 붙었는지(합선)를 전원을 넣기 전에 알 수 있어요.", decide: "반드시 전원을 뺀 상태에서 재요. 이어져야 할 곳은 소리가 나고, 떨어져야 할 곳(전원과 GND)은 소리가 나지 않아야 해요." },
  multimeter_resistance: { term: "저항 모드", aliases: ["멀티미터 저항"], oneLine: "부품의 저항값(Ω)을 재는 멀티미터 모드예요.", why: "저항의 색 띠를 읽기 어려울 때 실제 값을 확인할 수 있어요.", decide: "전원을 뺀 상태에서, 가능하면 부품을 회로에서 떼고 재야 값이 정확해요." },
  tolerance: { term: "공차", oneLine: "만든 것이 설계 치수와 달라질 수 있는 여유예요.", why: "3D 프린트는 구멍이 조금 작게, 기둥이 조금 굵게 나와요. 24mm 부품을 24mm 자리에 넣으면 들어가지 않아요.", decide: "끼우는 자리는 한쪽에 0.2~0.3mm쯤 여유를 두고, 작은 조각을 먼저 뽑아 끼워 본 뒤 전체를 출력하세요." },
  print_orientation: { term: "출력 방향", aliases: ["서포트", "출력 방향·서포트"], oneLine: "3D 프린터에 물건을 어느 면으로 눕혀 뽑을지와, 허공에 뜨는 부분을 받치는 임시 기둥(서포트)이에요.", why: "방향에 따라 강도, 표면, 출력 시간이 달라져요. 서포트가 많으면 떼어낸 자리가 거칠고 시간도 늘어요.", decide: "넓고 평평한 면을 바닥에 두고, 45도보다 더 누운 돌출이 없게 방향을 잡으면 서포트를 줄일 수 있어요." },
  slicer: { term: "슬라이서", oneLine: "3D 모양 파일을 프린터가 따라 그릴 층으로 나눠 주는 프로그램이에요.", why: "출력 시간과 재료 양이 여기서 정해져요. 설계가 끝났더라도 슬라이서에 넣어 봐야 실제로 몇 시간 걸리는지 알 수 있어요.", decide: "프린터 회사가 주는 슬라이서를 쓰고, 처음에는 기본 설정에서 층 높이와 채움 정도만 바꿔 보세요." },
  stl: { term: "STL", oneLine: "3D 프린터용으로 가장 널리 쓰는 모양 파일 형식이에요.", why: "설계 프로그램이 무엇이든 STL로 내보내면 슬라이서가 읽을 수 있어요. 단, 크기 단위 정보가 없어서 mm로 맞춰졌는지 확인해야 해요.", decide: "슬라이서에 넣었을 때 표시되는 크기가 설계 치수와 같은지 먼저 보세요." },
  bom: { term: "부품목록", aliases: ["BOM"], oneLine: "만드는 데 필요한 부품과 수량, 값을 적은 표예요. 영어로 BOM이라고 해요.", why: "빠뜨린 부품 하나 때문에 배송을 다시 기다리게 돼요. 가격을 더해 보면 예산 안에 드는지도 미리 알 수 있어요.", decide: "부품마다 정확한 모델명, 수량, 어디에 쓰는지를 적고, 잘 망가지는 작은 부품은 한두 개 여유 있게 넣으세요." },
  net: { term: "net", aliases: ["배선 묶음"], oneLine: "전기로 서로 이어져 있는 핀들의 묶음이에요.", why: "회로도는 결국 \"어떤 핀들이 한 묶음인가\"의 목록이에요. 같은 묶음의 핀은 선으로 모두 이어야 하고, 다른 묶음과는 닿으면 안 돼요.", decide: "회로를 읽을 때 선을 하나씩 따라가지 말고 \"이 묶음에는 어떤 핀들이 있나\"로 보면 훨씬 쉬워요." },
  datasheet: { term: "데이터시트", oneLine: "부품을 만든 회사가 내는 공식 설명서예요.", why: "동작 전압, 쓰는 전류, 핀 배치, 치수의 기준이에요. 판매 페이지나 블로그와 다르면 데이터시트가 맞아요.", decide: "\"부품 모델명 datasheet\"로 검색해서 전압·전류·핀 배치·치수 네 가지만 찾아보면 돼요." }
};

export type StageWhy = { stage: string; why: string; learn: string };
/** 단계마다: 왜 이 단계가 있는지, 여기서 어떤 결정을 배우는지 */
export const STAGE_WHY: Record<"checklist" | "form" | "plan" | "circuit" | "mockup" | "assembly" | "verify" | "housing", StageWhy> = {
  checklist: { stage: "체크리스트", why: "가진 도구와 경험에 따라 같은 물건도 만드는 길이 달라져요. 납땜 인두가 없는데 납땜이 필요한 설계를 받으면 거기서 멈추게 돼요.", learn: "\"내가 가진 것으로 할 수 있는 방법이 무엇인가\"를 먼저 묻는 습관을 배워요." },
  form: { stage: "완성품 모양", why: "모양과 크기가 먼저 정해져야 그 안에 들어갈 부품을 고를 수 있어요. 회로를 다 만든 뒤에 \"안 들어가네\"를 알게 되면 부품을 다시 사야 해요.", learn: "\"어디에 두고, 어떻게 쥐고, 어느 면을 보는가\"에서 크기와 부품 자리가 나온다는 걸 배워요." },
  plan: { stage: "설계도와 보드 고르기", why: "전체를 한 번에 만들면 어디서 틀렸는지 알 수 없어요. 부품 하나씩 따로 동작시키고 마지막에 합치는 순서를 미리 정해요.", learn: "무선이 필요한지, 연결할 부품이 몇 개인지, 전압이 몇 V인지로 보드를 고르는 법을 배워요." },
  circuit: { stage: "회로", why: "어떤 핀을 어디에 잇는지 정하는 단계예요. 전압이 맞지 않거나 핀이 겹치면 부품이 망가질 수 있어서, 사기 전에 종이 위에서 먼저 걸러요.", learn: "전원 → GND → 신호 순서로 회로를 읽고, 전압과 전류가 맞는지 스스로 견줘 보는 법을 배워요." },
  mockup: { stage: "정밀 목업", why: "부품을 실제 치수로 놓아 보고 겹치는 곳을 숫자로 찾아요. 출력은 몇 시간이 걸리니, 뽑기 전에 화면에서 틀린 곳을 잡는 게 훨씬 싸요.", learn: "실제 부품을 재고, 끼우는 자리에 여유(공차)를 두는 법을 배워요." },
  assembly: { stage: "조립 가이드", why: "한 번에 한 동작씩, 무엇을 어디에 꽂는지 정해 두면 틀린 곳을 바로 찾을 수 있어요.", learn: "하나 붙이고, 확인하고, 다음으로 가는 순서를 배워요. 이 순서가 고장 찾기의 기본이에요." },
  verify: { stage: "검증", why: "\"될 것 같다\"와 \"쟀더니 맞다\"는 달라요. 전원을 넣기 전에 합선을 보고, 전압을 재고, 부품을 하나씩 확인해요.", learn: "증상에서 출발해 무엇을 재면 원인이 좁혀지는지 배워요." },
  housing: { stage: "하우징", why: "부품을 담는 몸통이에요. 프린터가 없으면 다른 방법(판 자르기, 기성 케이스)도 있고, 방법에 따라 비용과 시간이 크게 달라져요.", learn: "출력 방향, 서포트, 끼움 여유를 보고 \"한 번에 뽑힐 모양인가\"를 판단하는 법을 배워요." }
};

// ── 글 속의 낱말 찾기 ────────────────────────────────────────────────────────

type TermIndex = Array<{ key: string; word: string }>;
/** 긴 낱말부터 찾아야 "I2C 주소"가 "I2C"로 먼저 잡히지 않는다 */
const TERMS: TermIndex = Object.entries(LEARN_NOTES).flatMap(([key, note]) => [note.term, ...(note.aliases ?? [])].map((word) => ({ key, word }))).sort((a, b) => b.word.length - a.word.length);

export const noteFor = (term: string): LearnNote | null => {
  const wanted = term.trim().toLowerCase();
  if (LEARN_NOTES[wanted]) return LEARN_NOTES[wanted];
  const hit = TERMS.find((t) => t.word.toLowerCase() === wanted);
  return hit ? LEARN_NOTES[hit.key] : null;
};

export type LearnSegment = { text: string; note?: LearnNote };
const isWordChar = (ch: string | undefined) => !!ch && /[A-Za-z0-9]/.test(ch);

/**
 * 글을 조각으로 나눈다. 설명이 있는 낱말이 "처음 나온 자리"에만 note를 붙인다.
 * 같은 낱말에 매번 i를 달면 글을 읽을 수가 없다.
 */
export function splitLearnText(text: string): LearnSegment[] {
  const used = new Set<string>();
  const out: LearnSegment[] = [];
  let plain = "";
  let i = 0;
  const lower = text.toLowerCase();
  while (i < text.length) {
    let matched: { key: string; word: string } | null = null;
    for (const t of TERMS) {
      if (used.has(t.key)) continue;
      const w = t.word.toLowerCase();
      if (!lower.startsWith(w, i)) continue;
      // 영문 낱말은 다른 영문 낱말의 일부일 때 잡지 않는다 (PWM ⊄ "PWMX", net ⊄ "internet")
      const ascii = /^[A-Za-z0-9 ]+$/.test(t.word);
      if (ascii && (isWordChar(text[i - 1]) || isWordChar(text[i + w.length]))) continue;
      matched = t; break;
    }
    if (!matched) { plain += text[i]; i++; continue; }
    if (plain) { out.push({ text: plain }); plain = ""; }
    out.push({ text: text.slice(i, i + matched.word.length), note: LEARN_NOTES[matched.key] });
    used.add(matched.key);
    i += matched.word.length;
  }
  if (plain) out.push({ text: plain });
  return out;
}

// ── 이 회로를 읽는 순서 ─────────────────────────────────────────────────────

export type ReadingStep = { order: number; kind: CircuitNet["kind"]; title: string; body: string; pins: string[]; net: string };

const partName = (blueprint: BuildBlueprint, member: string) => {
  const [ref, pin] = member.split(".");
  const part = blueprint.components.find((c) => c.ref === ref);
  return part ? `${part.valueOrModel || part.type}${pin ? `의 ${pin} 핀` : ""}` : member;
};
const joined = (names: string[]) => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")}와(과) ${names.at(-1)}`;

/**
 * 회로도는 전원 → GND → 신호 순으로 읽는다. 전원과 GND가 맞아야 신호를 볼 의미가 있고,
 * 고장도 대부분 그 순서로 찾는다. 신호는 묶음(net) 하나씩 "무엇을 어디로 나르는지"로 읽는다.
 */
export function circuitReadingGuide(blueprint: BuildBlueprint): ReadingStep[] {
  const rank = { power: 0, ground: 1, signal: 2 } as const;
  const nets = blueprint.nets.map((net, index) => ({ net, index })).sort((a, b) => rank[a.net.kind] - rank[b.net.kind] || a.index - b.index).map((x) => x.net);
  return nets.map((net, index) => {
    const names = net.members.map((m) => partName(blueprint, m));
    const who = joined(names) || "아직 연결된 핀이 없어요";
    if (net.kind === "power") return { order: index + 1, kind: net.kind, net: net.name, pins: net.members, title: `전원부터 봐요: ${net.name}`, body: `전기가 들어가는 길이에요. ${who}이(가) 이 선으로 전기를 받아요. 여기 이어진 부품이 모두 같은 전압(이 회로는 ${blueprint.supplyVoltage}V 기준)을 견디는지 먼저 확인해요.` };
    if (net.kind === "ground") return { order: index + 1, kind: net.kind, net: net.name, pins: net.members, title: `다음은 GND: ${net.name}`, body: `전기가 돌아오는 길이자 기준점(0V)이에요. ${who}이(가) 여기에 모여요. 전원을 받는 부품은 빠짐없이 GND에도 이어져 있어야 해요.` };
    const assigned = blueprint.firmware.pinAssignments.find((p) => net.name.toLowerCase().includes(p.symbol.toLowerCase()) || net.members.some((m) => m.toLowerCase().includes(p.symbol.toLowerCase())));
    const role = assigned ? { digital_input: "켜짐/꺼짐을 보드가 읽는 선", analog_input: "값의 크기를 보드가 읽는 선", digital_output: "보드가 켜고 끄는 선", pwm_output: "보드가 세기를 조절하는 선", servo: "보드가 각도를 정해 주는 선" }[assigned.role] : "신호가 오가는 선";
    return { order: index + 1, kind: net.kind, net: net.name, pins: net.members, title: `신호: ${net.name}`, body: `${role}이에요. ${who}을(를) 이어요. 이 선이 무엇을 어디에서 어디로 나르는지 한 문장으로 말할 수 있으면 읽은 거예요.` };
  });
}
