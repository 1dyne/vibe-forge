import type { BenchFaq, BenchKit, BenchMistake } from "./types";

// 온보딩 '미리 만들어보기' 연습 키트 (명세서 2차 v0.1 §5).
// AI 호출 없이 정해진 데이터로만 돈다. 값은 일반적인 취미 납땜 기준이며,
// 실제 부품은 판매처 데이터시트를 따른다.

const COLD: BenchMistake = { kind: "cold", title: "냉납", looks: "회색이고 울퉁불퉁, 공처럼 얹혀 있음", fix: "인두를 다리와 패드에 같이 1초 대서 다시 녹이고, 납을 아주 조금 더한다" };
const BRIDGE: BenchMistake = { kind: "bridge", title: "브리지(납 다리)", looks: "이웃 구멍까지 납이 이어져 붙어 있음", fix: "깨끗한 인두 끝으로 두 패드 사이를 쓸어 떼거나, 솔더윅(납 흡수선)으로 걷어낸다" };
const STARVED: BenchMistake = { kind: "starved", title: "납 부족", looks: "구멍 둘레가 다 안 덮이고 틈이 보임", fix: "인두를 다시 대고 납을 조금 더 녹여 원뿔이 되게 한다" };

const SOLDER_FAQ: BenchFaq[] = [
  { q: "냉납 같아요", a: "회색이고 울퉁불퉁하면 냉납이야. 인두 끝을 다리와 패드에 '같이' 1초 대고, 납을 반대쪽에서 살짝 대서 다시 녹여 봐. 납이 다리를 타고 올라가 반짝이는 원뿔이 되면 성공." },
  { q: "납이 안 붙고 굴러다녀요", a: "패드가 충분히 안 데워진 거야. 납을 인두에 바로 대지 말고, 인두로 패드를 먼저 1초 데운 다음 '패드'에 납을 대. 인두 끝이 검게 탔으면 젖은 스펀지나 황동솔로 닦고 납을 조금 입혀(팁 예비납)." },
  { q: "옆 구멍이랑 붙었어요", a: "브리지야. 깨끗한 인두 끝으로 두 패드 사이를 바깥쪽으로 쓸어내면 대부분 떨어져. 안 되면 솔더윅을 대고 인두로 눌러 납을 빨아들이게 해." },
  { q: "LED가 안 켜져요", a: "① LED 방향: 긴 다리(+)가 저항 쪽이어야 해. ② 전지 방향과 전압(1.5V × 2 = 약 3V). ③ 브리지나 냉납. 멀티미터 통전 모드로 빨간 선 → 저항 → LED 긴 다리까지 '삐' 소리가 이어지는지 확인해 봐." },
  { q: "연기·냄새가 나요", a: "납 속 플럭스가 타는 연기라 조금은 정상이야. 얼굴을 연기 위에 두지 말고 창문을 열어. 부품에서 연기가 나거나 뜨거우면 바로 전지를 빼." },
  { q: "인두 온도는 몇 도?", a: "유연납(Sn63/Pb37) 기준 330~350℃가 무난해. 무연납이면 350~370℃. 너무 뜨거우면 패드가 들뜨고, 너무 낮으면 냉납이 돼." }
];

export const KITS: BenchKit[] = [
  {
    id: "solder-basics",
    title: "납땜 첫걸음: LED 켜기",
    subtitle: "만능기판에 저항과 LED를 납땜해서 불을 켜 봐요",
    level: "처음",
    minutes: 15,
    learn: ["만능기판의 부품 면과 납땜 면", "스루홀 납땜 (반짝이는 원뿔)", "다리 자르기", "전선 피복 벗기기·예비납", "이웃 패드 잇기와 브리지 구분", "LED 극성"],
    parts: [
      { ref: "PB", kind: "perfboard", label: "만능기판", about: "구멍마다 구리 패드가 있는 연습용 기판. 글자가 있는 면에 부품을 꽂고, 구리 면에서 납땜해요.", spec: { cols: 18, rows: 14 } },
      { ref: "R1", kind: "resistor", label: "저항 220Ω", about: "LED에 흐르는 전류를 줄여 타지 않게 해요. 띠 색: 빨강·빨강·갈색·금색.", spec: { ohms: 220 } },
      { ref: "D1", kind: "led", label: "LED 5mm 빨강", about: "긴 다리가 +(애노드), 짧은 다리와 테두리가 깎인 쪽이 −(캐소드).", spec: { color: "#ff3b2f" } },
      { ref: "BT", kind: "battery_holder_2aa", label: "AA 전지 홀더 2개용", about: "1.5V × 2 = 약 3V. 빨간 선이 +, 검은 선이 −.", spec: {} },
      { ref: "B1", kind: "aa_battery", label: "AA 전지 ×2", about: "마지막에 넣어요. 납땜하는 동안에는 넣지 않아요.", spec: {} }
    ],
    tools: ["인두 (온도 조절형)", "실납 0.8mm", "니퍼", "와이어 스트리퍼", "인두 받침·스펀지", "멀티미터"],
    safety: ["인두 끝은 330℃ 이상이에요. 받침에만 내려놓기", "창문 열기 — 연기는 얼굴 아래로", "다리 자를 때 조각이 튀어요. 손으로 감싸거나 보안경", "납을 만진 손은 꼭 씻기", "납땜하는 동안 전지는 넣지 않기"],
    steps: [
      { phase: "준비", title: "부품 확인", action: "트레이의 **부품 5가지**를 확인해요.", why: "시작 전에 빠진 부품이 없는지 보면 중간에 멈추지 않아요.", ops: [{ op: "check", how: "look", targets: ["PB", "R1", "D1", "BT", "B1"], expected: "만능기판·저항·LED·전지 홀더·전지" }], view: "34", tapHint: "트레이의 부품을 아무거나 눌러 봐", doneWhen: "다섯 가지가 다 있다" },
      { phase: "준비", title: "만능기판 놓기", action: "**만능기판**을 글자 있는 면이 위로 오게 매트 가운데에 놓아요.", why: "글자 면(부품 면)에 부품을 꽂고, 아래 구리 면에서 납땜해요.", ops: [{ op: "place", ref: "PB", at: [0, -6] }], view: "34", tapHint: "매트 가운데 빛나는 자리를 눌러", doneWhen: "A~R 글자와 1~14 숫자가 보인다" },
      { phase: "꽂기", title: "저항 꽂기", action: "**저항** 다리를 직각으로 구부려 **C5**와 **G5** 구멍에 꽂아요.", why: "저항은 방향이 없어요. 몸통이 기판에 닿게 꽂아야 흔들리지 않아요.", ops: [{ op: "insert", ref: "R1", into: "PB", holes: ["PB.C5", "PB.G5"] }], view: "top", tapHint: "C5 구멍을 눌러", doneWhen: "저항 몸통이 기판에 붙어 있고 다리가 아래로 나와 있다" },
      { phase: "꽂기", title: "LED 꽂기", action: "**LED**의 긴 다리(+)를 **H5**, 짧은 다리(−)를 **I5**에 꽂아요.", why: "LED는 방향이 있어요. 거꾸로 꽂으면 켜지지 않아요. 긴 다리가 저항 쪽이에요.", ops: [{ op: "insert", ref: "D1", into: "PB", holes: ["PB.H5", "PB.I5"] }], view: "top", tapHint: "긴 다리가 들어갈 H5를 눌러", doneWhen: "LED 테두리의 깎인 면이 I5(오른쪽) 쪽이다" },
      { phase: "납땜", title: "저항 납땜", action: "기판을 뒤집어 **C5·G5** 패드를 납땜해요. 인두를 다리와 패드에 같이 1초, 납을 반대쪽에서 대고 녹으면 납 먼저 떼고 인두를 떼요.", why: "다리와 패드를 둘 다 데워야 납이 둘을 감싸며 붙어요.", ops: [{ op: "solder", joints: ["PB.C5", "PB.G5"], side: "bottom" }], view: "bottom", tapHint: "C5 패드를 눌러", caution: "한 곳에 2~3초 이상 대지 않기", mistakes: [COLD, STARVED], doneWhen: "패드를 다 덮은 반짝이는 원뿔(화산) 모양" },
      { phase: "납땜", title: "LED 납땜", action: "**H5·I5** 패드를 납땜해요. 두 패드가 붙지 않게 조심!", why: "LED는 열에 약해요. 빨리, 깔끔하게.", ops: [{ op: "solder", joints: ["PB.H5", "PB.I5"], side: "bottom" }], view: "bottom", tapHint: "H5 패드를 눌러", caution: "LED 다리는 3초 이내. 뜨거우면 식혔다가 다시", mistakes: [BRIDGE, COLD], doneWhen: "두 원뿔 사이에 틈이 보인다" },
      { phase: "다듬기", title: "다리 자르기", action: "니퍼로 **저항과 LED 다리**를 납땜 위 1mm만 남기고 잘라요.", why: "긴 다리는 이웃과 닿아 합선을 만들 수 있어요.", ops: [{ op: "trim", refs: ["R1", "D1"] }], view: "bottom", tapHint: "튀어나온 다리를 눌러", caution: "잘린 다리가 튀어요. 손으로 감싸고 자르기", doneWhen: "다리가 납땜 바로 위에서 잘려 있다" },
      { phase: "전선", title: "전선 준비", action: "전지 홀더의 **빨간 선·검은 선** 끝 피복을 5mm 벗기고, 가닥을 꼬아 납을 살짝 입혀요(예비납).", why: "가닥이 풀리면 구멍에 안 들어가고 이웃과 닿아요. 예비납이 있으면 금방 붙어요.", ops: [{ op: "place", ref: "BT", at: [-92, -6], rotation: 0 }, { op: "prep_wire", wires: ["BT.RED", "BT.BLK"], stripMm: 5, tin: true }], view: "34", tapHint: "전선 끝을 눌러", doneWhen: "전선 끝이 은색으로 단단하게 뭉쳐 있다" },
      { phase: "전선", title: "전선 꽂고 납땜", action: "**빨간 선을 B5**, **검은 선을 J5**에 위에서 꽂고 아래에서 납땜해요.", why: "빨간 선(+)은 저항으로, 검은 선(−)은 LED 짧은 다리로 가요.", ops: [{ op: "insert_wire", wire: "BT.RED", hole: "PB.B5" }, { op: "insert_wire", wire: "BT.BLK", hole: "PB.J5" }, { op: "solder", joints: ["PB.B5", "PB.J5"], side: "bottom" }], view: "bottom", tapHint: "B5 패드를 눌러", mistakes: [COLD], doneWhen: "전선을 살짝 당겨도 빠지지 않는다" },
      { phase: "납땜", title: "이웃 패드 잇기", action: "납을 조금 더해 **B5–C5**, **G5–H5**, **I5–J5**를 각각 이어요. **H5–I5는 절대 잇지 않아요.**", why: "만능기판은 구멍끼리 안 이어져 있어요. 납으로 길을 만들어 회로를 완성해요.", ops: [{ op: "bridge", pairs: [["PB.B5", "PB.C5"], ["PB.G5", "PB.H5"], ["PB.I5", "PB.J5"]] }], view: "bottom", tapHint: "B5와 C5 사이를 눌러", caution: "H5–I5가 붙으면 LED가 합선돼 안 켜져요", mistakes: [BRIDGE], doneWhen: "이어진 곳 3군데, H5–I5 사이는 틈" },
      { phase: "검사", title: "합선 검사", action: "멀티미터를 통전(삐 소리) 모드로 두고 **H5–I5**에 대 봐요. **소리가 안 나야** 정상.", why: "전지를 넣기 전에 합선을 찾으면 부품이 안 상해요.", ops: [{ op: "check", how: "continuity", targets: ["PB.H5", "PB.I5"], expected: "소리 없음 (OL)" }], view: "bottom", tapHint: "H5–I5 사이를 눌러", doneWhen: "H5–I5는 소리 없음, B5–C5는 삐" },
      { phase: "검사", title: "전지 넣고 켜기", action: "**AA 전지 2개**를 방향(+ −) 맞춰 넣어요. LED가 켜지면 완성!", why: "전류: (3V − LED 2V) ÷ 220Ω ≈ 4.5mA. 밝기는 충분하고 LED는 안전해요.", ops: [{ op: "batteries", ref: "BT" }, { op: "check", how: "power_on", targets: ["D1"], expected: "LED 켜짐" }], view: "34", tapHint: "전지 홀더를 눌러", doneWhen: "LED가 빨갛게 켜진다" }
    ],
    faq: SOLDER_FAQ
  },
  {
    id: "header-pins",
    title: "모듈에 헤더 핀 달기",
    subtitle: "센서 모듈에 핀을 납땜해서 브레드보드에 꽂을 수 있게 해요",
    level: "처음",
    minutes: 10,
    learn: ["브레드보드로 헤더를 곧게 고정하기", "첫 핀 → 반대쪽 끝 핀 → 나머지 순서", "좁은 간격(2.54mm)에서 브리지 피하기"],
    parts: [
      { ref: "BB", kind: "breadboard", label: "브레드보드", about: "핀을 곧게 잡아 주는 지그로 써요. 납땜은 하지 않아요.", spec: { cols: 10, rows: 30 } },
      { ref: "J1", kind: "header_male", label: "수 헤더 8핀", about: "짧은 쪽이 모듈 위로 나오고, 긴 쪽이 브레드보드에 꽂혀요.", spec: { pins: 8 } },
      { ref: "U1", kind: "sensor_module", label: "6축 센서 모듈 (GY-521 형)", about: "가속도·자이로 센서. 핀 8개: VCC GND SCL SDA XDA XCL AD0 INT.", spec: { pinNames: ["VCC", "GND", "SCL", "SDA", "XDA", "XCL", "AD0", "INT"], silk: "GY-521" } }
    ],
    tools: ["인두", "실납 0.8mm", "인두 받침·스펀지", "확대경(있으면)"],
    safety: ["인두 끝은 330℃ 이상이에요. 받침에만 내려놓기", "창문 열기", "납을 만진 손은 꼭 씻기"],
    steps: [
      { phase: "준비", title: "부품 확인", action: "**브레드보드·헤더 8핀·센서 모듈**을 확인해요.", why: "헤더 핀 수가 모듈 구멍 수와 같아야 해요.", ops: [{ op: "check", how: "look", targets: ["BB", "J1", "U1"], expected: "3가지" }], view: "34", tapHint: "트레이의 부품을 눌러", doneWhen: "모듈 구멍 8개, 헤더 핀 8개" },
      { phase: "준비", title: "브레드보드 놓기", action: "**브레드보드**를 매트 가운데에 놓아요.", why: "브레드보드가 핀을 곧게 세워 주는 지그가 돼요.", ops: [{ op: "place", ref: "BB", at: [0, -6] }], view: "34", tapHint: "매트 가운데를 눌러", doneWhen: "평평한 곳에 놓였다" },
      { phase: "꽂기", title: "헤더 꽂기", action: "헤더의 **긴 쪽을 아래로** 해서 **C8~C15**에 꽂아요.", why: "긴 쪽이 나중에 브레드보드에 꽂히는 쪽이에요.", ops: [{ op: "insert", ref: "J1", into: "BB", holes: ["BB.C8", "BB.C9", "BB.C10", "BB.C11", "BB.C12", "BB.C13", "BB.C14", "BB.C15"] }], view: "top", tapHint: "C8 구멍을 눌러", doneWhen: "검은 플라스틱이 브레드보드에 닿아 있다" },
      { phase: "꽂기", title: "모듈 얹기", action: "**모듈**을 글자 면이 위로 오게 헤더 짧은 쪽에 끼워요.", why: "글자가 보여야 핀 이름을 보며 연결할 수 있어요.", ops: [{ op: "mount_on", ref: "U1", onto: "J1", holes: ["U1.VCC", "U1.GND", "U1.SCL", "U1.SDA", "U1.XDA", "U1.XCL", "U1.AD0", "U1.INT"] }], view: "34", tapHint: "헤더 위 빛나는 자리를 눌러", doneWhen: "모듈이 수평이고 핀 끝이 구멍 위로 나와 있다" },
      { phase: "납땜", title: "첫 핀 납땜", action: "끝의 **VCC 핀 하나만** 먼저 납땜해요.", why: "하나만 붙여 두면 모듈이 기울었을 때 그 한 곳만 다시 녹여 바로잡을 수 있어요.", ops: [{ op: "solder", joints: ["U1.VCC"], side: "top" }], view: "top", tapHint: "VCC 핀을 눌러", mistakes: [COLD], doneWhen: "모듈이 수평이다 (기울면 VCC만 다시 녹여 맞추기)" },
      { phase: "납땜", title: "반대쪽 끝 핀", action: "수평을 확인하고 반대쪽 끝 **INT 핀**을 납땜해요.", why: "양 끝이 고정되면 더 이상 기울지 않아요.", ops: [{ op: "solder", joints: ["U1.INT"], side: "top" }], view: "top", tapHint: "INT 핀을 눌러", doneWhen: "양 끝이 반짝이는 원뿔" },
      { phase: "납땜", title: "나머지 6핀", action: "**GND부터 AD0까지** 나머지 6핀을 차례로 납땜해요.", why: "간격이 2.54mm라 납을 조금만 써야 이웃과 안 붙어요.", ops: [{ op: "solder", joints: ["U1.GND", "U1.SCL", "U1.SDA", "U1.XDA", "U1.XCL", "U1.AD0"], side: "top" }], view: "top", tapHint: "GND 핀을 눌러", caution: "핀마다 2~3초, 납은 조금만", mistakes: [BRIDGE, STARVED], doneWhen: "8개 모두 원뿔, 서로 떨어져 있다" },
      { phase: "검사", title: "브리지 검사", action: "이웃 핀 사이에 **납 다리**가 없는지 밝은 곳에서 봐요.", why: "VCC–GND가 붙으면 전원이 합선돼요.", ops: [{ op: "check", how: "look", targets: ["U1.VCC", "U1.GND"], expected: "모든 핀 사이에 틈" }], view: "top", tapHint: "VCC와 GND 사이를 눌러", mistakes: [BRIDGE], doneWhen: "핀 사이 7군데 모두 틈이 보인다" }
    ],
    faq: SOLDER_FAQ
  },
  {
    id: "wire-to-pad",
    title: "모듈 패드에 전선 직접 달기",
    subtitle: "헤더 없이 얇은 전선을 센서 패드에 바로 납땜해요 (착용형·작은 하우징에 필요)",
    level: "조금 해봄",
    minutes: 12,
    learn: ["패드 예비납", "전선 피복 짧게 벗기고 예비납", "겹쳐 녹이기 (납을 더하지 않고)", "당겨서 확인과 열수축"],
    parts: [
      { ref: "U1", kind: "sensor_module", label: "6축 센서 모듈 (GY-521 형)", about: "핀 8개 중 VCC·GND·SDA 세 개만 써요.", spec: { pinNames: ["VCC", "GND", "SCL", "SDA", "XDA", "XCL", "AD0", "INT"], silk: "GY-521" } },
      { ref: "W1", kind: "wire", label: "빨간 전선 (AWG26)", about: "VCC(+)에 달아요.", spec: { color: "#d8322a", widthMm: 50 } },
      { ref: "W2", kind: "wire", label: "검은 전선 (AWG26)", about: "GND(−)에 달아요.", spec: { color: "#1c1c1e", widthMm: 50 } },
      { ref: "W3", kind: "wire", label: "노란 전선 (AWG26)", about: "SDA(데이터)에 달아요.", spec: { color: "#e8b62e", widthMm: 50 } }
    ],
    tools: ["인두", "실납 0.6~0.8mm", "와이어 스트리퍼", "열수축 튜브 1.5mm", "핀셋 또는 마스킹테이프"],
    safety: ["인두 끝은 330℃ 이상이에요. 받침에만 내려놓기", "전선이 짧아 손가락이 인두에 가까워요. 핀셋이나 테이프로 잡기", "열수축은 불꽃을 직접 대지 말고 인두 몸통이나 히트건으로"],
    steps: [
      { phase: "준비", title: "부품 확인", action: "**센서 모듈**과 **전선 3가닥**(빨강·검정·노랑)을 확인해요.", why: "색을 정해 두면 나중에 어느 선이 어디인지 헷갈리지 않아요.", ops: [{ op: "check", how: "look", targets: ["U1", "W1", "W2", "W3"], expected: "모듈 1, 전선 3" }], view: "34", tapHint: "트레이의 부품을 눌러", doneWhen: "빨강=VCC, 검정=GND, 노랑=SDA로 정했다" },
      { phase: "준비", title: "모듈 고정", action: "**모듈**을 글자 면이 위로 오게 놓고 테이프로 매트에 붙여요.", why: "작은 모듈은 인두를 대면 밀려요. 고정해야 손이 자유로워요.", ops: [{ op: "place", ref: "U1", at: [0, -14] }], view: "34", tapHint: "매트 가운데를 눌러", doneWhen: "모듈이 움직이지 않는다" },
      { phase: "납땜", title: "패드 예비납", action: "**VCC·GND·SDA** 패드에 납을 조금씩 녹여 얇은 언덕을 만들어요.", why: "패드에 미리 납이 있으면 나중에 전선을 대고 녹이기만 하면 돼요.", ops: [{ op: "solder", joints: ["U1.VCC", "U1.GND", "U1.SDA"], side: "top" }], view: "top", tapHint: "VCC 패드를 눌러", caution: "패드마다 2초 이내. 이웃 패드(SCL)와 붙지 않게", mistakes: [{ kind: "bridge", title: "브리지", looks: "GND와 SCL 사이까지 납이 이어짐", fix: "깨끗한 인두로 쓸어내거나 솔더윅" }], doneWhen: "세 패드가 반짝이는 작은 언덕" },
      { phase: "전선", title: "전선 준비", action: "전선 끝 피복을 **3mm**만 벗기고 가닥을 꼬아 납을 입혀요. **열수축 튜브**를 먼저 끼워 둬요.", why: "패드가 작아 피복을 길게 벗기면 이웃과 닿아요. 튜브는 납땜 뒤에는 못 끼워요.", ops: [{ op: "place", ref: "W1", at: [-80, 30] }, { op: "place", ref: "W2", at: [-80, 40] }, { op: "place", ref: "W3", at: [-80, 50] }, { op: "prep_wire", wires: ["W1.END", "W2.END", "W3.END"], stripMm: 3, tin: true }], view: "34", tapHint: "전선 끝을 눌러", doneWhen: "전선 끝 3mm가 은색으로 단단하다" },
      { phase: "납땜", title: "빨간 선 → VCC", action: "빨간 선 끝을 **VCC** 패드 위에 눕혀 대고, 인두로 위에서 1초 눌러 함께 녹여요. 납은 더하지 않아요.", why: "양쪽에 이미 납이 있어서 녹이기만 하면 붙어요.", ops: [{ op: "insert_wire", wire: "W1.END", hole: "U1.VCC" }, { op: "solder", joints: ["U1.VCC"], side: "top" }], view: "top", tapHint: "VCC 패드를 눌러", caution: "녹이는 동안 전선이 움직이면 냉납이 돼요. 굳을 때까지 2초 그대로", mistakes: [{ kind: "cold", title: "냉납", looks: "회색·울퉁불퉁, 당기면 떨어짐", fix: "다시 녹이고 움직이지 않게 잡기" }], doneWhen: "전선이 패드에 반짝이며 붙었다" },
      { phase: "납땜", title: "검은 선 → GND", action: "검은 선을 **GND** 패드에 같은 방법으로 붙여요.", why: "VCC 바로 옆이라 브리지가 생기기 쉬워요.", ops: [{ op: "insert_wire", wire: "W2.END", hole: "U1.GND" }, { op: "solder", joints: ["U1.GND"], side: "top" }], view: "top", tapHint: "GND 패드를 눌러", mistakes: [{ kind: "bridge", title: "브리지", looks: "VCC와 GND가 납으로 이어짐 → 전원 합선", fix: "바로 떼기. 붙은 채로 전원을 넣지 않기" }], doneWhen: "VCC와 GND 사이에 틈" },
      { phase: "납땜", title: "노란 선 → SDA", action: "노란 선을 **SDA** 패드에 붙여요.", why: "데이터 선이에요. 보드의 SDA 핀으로 가요.", ops: [{ op: "insert_wire", wire: "W3.END", hole: "U1.SDA" }, { op: "solder", joints: ["U1.SDA"], side: "top" }], view: "top", tapHint: "SDA 패드를 눌러", doneWhen: "세 선이 모두 붙었다" },
      { phase: "검사", title: "당겨 보고 감싸기", action: "선을 하나씩 **살짝 당겨** 보고, VCC–GND를 멀티미터 통전 모드로 재요. 마지막에 열수축 튜브를 밀어 올려 데워요.", why: "착용형은 계속 휘어서 약한 납땜이 먼저 끊어져요.", ops: [{ op: "check", how: "continuity", targets: ["U1.VCC", "U1.GND"], expected: "소리 없음 (OL)" }], view: "top", tapHint: "VCC–GND 사이를 눌러", doneWhen: "당겨도 안 빠지고, VCC–GND는 소리 없음" }
    ],
    faq: SOLDER_FAQ
  },
  {
    id: "battery-safe",
    title: "배터리·충전 모듈 연결",
    subtitle: "리튬 전지를 충전 모듈(TP4056 보호형)에 안전하게 연결하고 스위치를 달아요",
    level: "조금 해봄",
    minutes: 15,
    learn: ["B+/B−는 전지, OUT+/OUT−는 회로", "JST 커넥터 극성 확인", "단락을 막는 절연", "전원 스위치는 + 선에", "출력 전압 재기"],
    parts: [
      { ref: "PL", kind: "plate", label: "작업판", about: "부품을 올려놓는 나무판이에요.", spec: { widthMm: 140, heightMm: 84 } },
      { ref: "CH", kind: "module", label: "TP4056 충전 모듈 (보호형)", about: "USB로 리튬 전지를 충전하고, 과충전·과방전을 막아요. 패드 위치는 판매처마다 조금 달라요.", spec: { catalogId: "tp4056-protected", partType: "power", model: "TP4056 충전 모듈", foot: { x: 52, y: 30, w: 26, h: 17, rotation: 0 }, pinXY: [{ name: "IN+", x: 54, y: 32 }, { name: "IN-", x: 54, y: 45 }, { name: "OUT+", x: 76, y: 31.5 }, { name: "B+", x: 76, y: 36 }, { name: "B-", x: 76, y: 41 }, { name: "OUT-", x: 76, y: 45.5 }] } },
      { ref: "B1", kind: "module", label: "LiPo 3.7V 500mAh", about: "빨간 선이 +, 검은 선이 −. 커넥터 배선이 판매처마다 반대일 수 있어요.", spec: { catalogId: "lipo-1s-jstph", partType: "power", model: "LiPo 3.7V", foot: { x: 96, y: 26, w: 36, h: 29, rotation: 0 }, pinXY: [{ name: "+", x: 97, y: 36 }, { name: "-", x: 97, y: 42 }] } },
      { ref: "S1", kind: "module", label: "슬라이드 스위치", about: "가운데(COM)와 한쪽 끝이 이어져요.", spec: { catalogId: "slide-switch-spdt", partType: "input", model: "슬라이드 스위치", foot: { x: 82, y: 64, w: 9, h: 4, rotation: 0 }, pinXY: [{ name: "1", x: 84, y: 66 }, { name: "COM", x: 86.5, y: 66 }, { name: "2", x: 89, y: 66 }] } }
    ],
    tools: ["인두", "실납", "와이어 스트리퍼", "열수축 튜브", "멀티미터", "USB 충전기"],
    safety: ["전지 +와 −가 절대 닿지 않게: 한 번에 한 선만 벗기기", "부풀거나 찍힌 전지는 쓰지 않기", "충전 중 자리 비우지 않기, 불연성 바닥에서", "납땜 중에는 USB를 빼기"],
    steps: [
      { phase: "준비", title: "부품 확인", action: "**작업판·충전 모듈·전지·스위치**를 확인해요. 전지가 부풀지 않았는지도 봐요.", why: "리튬 전지는 상처가 나면 위험해요. 시작 전에 상태부터.", ops: [{ op: "check", how: "look", targets: ["PL", "CH", "B1", "S1"], expected: "4가지, 전지 평평함" }], view: "34", tapHint: "전지를 눌러", doneWhen: "전지가 평평하고 상처가 없다" },
      { phase: "준비", title: "작업판 놓기", action: "**작업판**을 매트 가운데에 놓아요.", why: "전지를 금속 위에 두지 않아요. 나무판은 단락 위험이 없어요.", ops: [{ op: "place", ref: "PL", at: [0, -6] }], view: "34", tapHint: "매트 가운데를 눌러", doneWhen: "판이 평평하게 놓였다" },
      { phase: "꽂기", title: "충전 모듈 놓기", action: "**충전 모듈**을 USB가 왼쪽(바깥)을 보게 놓아요. **B+·B−**와 **OUT+·OUT−** 글자를 찾아요.", why: "B는 전지(Battery), OUT은 회로로 가는 출력이에요. 바꿔 달면 보호회로가 동작하지 않아요.", ops: [{ op: "seat", ref: "CH", onto: "PL" }], view: "34", tapHint: "모듈이 놓일 자리를 눌러", doneWhen: "USB 구멍이 판 바깥쪽" },
      { phase: "꽂기", title: "전지 놓고 극성 확인", action: "**전지**를 놓고 빨간 선이 **+**인지 확인해요.", why: "JST 커넥터 배선이 판매처마다 반대인 경우가 있어요. 색으로 한 번 더 확인해요.", ops: [{ op: "seat", ref: "B1", onto: "PL" }, { op: "check", how: "look", targets: ["B1.+"], expected: "빨간 선 = +" }], view: "34", tapHint: "전지 자리를 눌러", caution: "전지 두 선을 동시에 벗기지 않아요. 한 선씩", doneWhen: "빨간 선이 +로 표시된 쪽" },
      { phase: "납땜", title: "전지 → B+ · B−", action: "빨간 선을 **B+**, 검은 선을 **B−**에 납땜해요. 한 선씩!", why: "전지 쪽은 항상 전기가 살아 있어요. 두 선 끝이 닿으면 바로 합선이에요.", ops: [{ op: "jumper", from: "B1.+", to: "CH.B+", color: "#d8322a" }, { op: "solder", joints: ["CH.B+"], side: "top" }, { op: "jumper", from: "B1.-", to: "CH.B-", color: "#1c1c1e" }, { op: "solder", joints: ["CH.B-"], side: "top" }], view: "top", tapHint: "B+ 패드를 눌러", caution: "인두를 오래 대면 전지가 데워져요. 패드에 미리 예비납", mistakes: [{ kind: "bridge", title: "B+–B− 브리지", looks: "두 패드가 납으로 붙음 → 전지 단락", fix: "즉시 전지 선을 떼고 납을 걷어내기" }], doneWhen: "B+–B− 사이에 틈" },
      { phase: "다듬기", title: "절연하기", action: "B+·B− 납땜 위에 **열수축 튜브**나 캡톤 테이프를 덮어요.", why: "하우징 안에서 눌리거나 금속에 닿아도 합선이 안 나게.", ops: [{ op: "check", how: "look", targets: ["CH.B+", "CH.B-"], expected: "노출된 금속 없음" }], view: "top", tapHint: "B+ 패드를 눌러", doneWhen: "B+·B−에 맨 금속이 안 보인다" },
      { phase: "전선", title: "OUT+ → 스위치", action: "**스위치**를 놓고 **OUT+**를 스위치 가운데(**COM**)에 이어 납땜해요. 스위치 끝 핀에서 회로로 가요.", why: "스위치는 + 선에 달아요. 끄면 회로 전체가 꺼져요.", ops: [{ op: "seat", ref: "S1", onto: "PL" }, { op: "jumper", from: "CH.OUT+", to: "S1.COM", color: "#d8322a" }, { op: "solder", joints: ["CH.OUT+", "S1.COM"], side: "top" }], view: "top", tapHint: "OUT+ 패드를 눌러", doneWhen: "스위치를 켜면 끝 핀에서 전기가 나온다" },
      { phase: "검사", title: "출력 전압 재기", action: "멀티미터를 **DC 20V**에 두고 **OUT+–OUT−**를 재요.", why: "1셀 리튬은 3.0~4.2V예요. 0V면 보호회로가 잠겼거나 연결이 틀렸어요.", ops: [{ op: "check", how: "voltage", targets: ["CH.OUT+", "CH.OUT-"], expected: "3.0~4.2V" }], view: "top", tapHint: "OUT+–OUT− 사이를 눌러", doneWhen: "3.0~4.2V가 나온다" },
      { phase: "검사", title: "충전해 보기", action: "USB를 꽂아요. **빨간 LED**가 켜지면 충전 중, 다 차면 **파란(또는 초록) LED**예요.", why: "처음 충전은 옆에서 지켜봐요. 뜨거워지면 바로 빼요.", ops: [{ op: "check", how: "look", targets: ["CH"], expected: "충전 LED 켜짐" }], view: "34", tapHint: "충전 모듈을 눌러", caution: "충전 중 자리 비우지 않기", doneWhen: "충전 LED가 켜지고 모듈·전지가 미지근한 정도" }
    ],
    faq: [...SOLDER_FAQ, { q: "OUT에서 0V가 나와요", a: "보호회로가 잠긴 상태일 수 있어요(과방전 뒤). USB를 잠깐 꽂으면 풀리는 경우가 많아요. 그래도 0V면 B+/B−와 전지 극성을 다시 확인해요." }, { q: "모듈이 뜨거워요", a: "충전 전류가 전지에 비해 크면 뜨거워요(기본 1A). 500mAh 같은 작은 전지는 RPROG 저항을 바꿔 전류를 낮춰야 해요. 일단 USB를 빼요." }]
  }
];

export function kitById(id: string) {
  return KITS.find((k) => k.id === id) ?? null;
}

/** /find 관심 갈래 → 추천 키트 (명세서 §5.2). 결과 화면은 지금 목록으로 보낸다. */
export const KIT_FOR_CATEGORY: Record<string, string> = { react: "solder-basics", sense: "header-pins", form: "wire-to-pad", who: "solder-basics" };
