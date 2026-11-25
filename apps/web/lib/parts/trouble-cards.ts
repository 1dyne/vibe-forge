import type { CircuitComponent, LocalProject } from "../project-types";
import { findCard, type PartCard } from "./catalog";

// Problem cards picked by condition, not written per step by the model. Each
// normal range carries its source; a check without a sourced range says so
// and asks the person to report what they saw.

export type ExpectedRange =
  | { kind: "number"; min: number | null; max: number | null; unit: string }
  | { kind: "boolean"; expect: string }
  | { kind: "derived_resistance" };
export type LadderStage = "prepower" | "power" | "upload" | "parts" | "together";
export type CardInput = "number" | "yes_no" | "serial_line" | "photo" | "observe";
export type LibraryCard = {
  id: string;
  // always·interface·needsAny는 검증 사다리(verify-ladder.ts)만 쓴다. 조립 단계 카드(libraryCardsForStep)는
  // 예전 조건(catalogIds·board·boardHasPin·boardLogic)만 보므로 조립 화면은 그대로다.
  appliesWhen: { catalogIds?: string[]; partTypes?: PartCard["type"][]; boardHasPin?: "power_5v" | "power_3v3"; boardLogic?: number;
    /** 회로가 있으면 언제나 */ always?: true;
    /** 이 인터페이스를 쓰는 부품이 회로에 있을 때 (부품 카드의 interface) */ interface?: string;
    /** 이 부품 카드 중 하나라도 회로에 있을 때 (부품마다가 아니라 한 번만) */ needsAny?: string[] };
  /** 사다리에서의 자리. 없으면 stage로 정한다(power→전원, upload→업로드, 나머지→부품 하나씩) */
  ladderStage?: LadderStage;
  /** 처음 하는 사람에게 이 확인이 왜 필요한지 한 문장 */
  why?: string;
  /** 사람이 돌려줘야 하는 값의 종류. 없으면 계측 모드와 정상 범위로 정한다 */
  input?: CardInput;
  /** 멀티미터 없이 할 수 있는 확인이 정직하게 있을 때만 */
  noMeter?: { how: string; expect: string };
  /** 숫자 범위를 어디서 가져왔는지(부품 카드 등). sourceUrl과 함께 쓴다 */
  sourceNote?: string;
  stage: "power" | "upload" | "wiring" | "sensor" | "actuator" | "display";
  symptom: string;
  cause: string;
  checkMethod: string;
  meterMode: "DC 전압" | "저항(Ω)" | "통전(삐 소리)" | "다이오드" | null;
  probePoints: string;
  expectedRange: ExpectedRange | null;
  ifNormal: string;
  ifAbnormal: string;
  severity: "info" | "warning" | "blocked";
  sourceUrl: string | null;
  verifiedAt: string | null;
};

// 부품 카드에 적힌 공급 전압 범위를 그대로 가져온다. 카드에 값이나 출처가 없으면 숫자를 두지 않는다.
function supplyFromCard(catalogId: string): Pick<LibraryCard, "expectedRange" | "sourceUrl" | "verifiedAt" | "sourceNote"> {
  const card = findCard(catalogId);
  const sourceUrl = card?.sourceUrls[0] ?? null;
  if (!card || card.voltageMin == null || card.voltageMax == null || !sourceUrl) return { expectedRange: null, sourceUrl: null, verifiedAt: null };
  return { expectedRange: { kind: "number", min: card.voltageMin, max: card.voltageMax, unit: "V" }, sourceUrl, verifiedAt: card.verifiedAt, sourceNote: `부품 카드(${card.model})의 공급 전압 범위` };
}

export const TROUBLE_CARDS: LibraryCard[] = [
  {
    id: "usb-5v-rail", appliesWhen: { boardHasPin: "power_5v" }, stage: "power",
    symptom: "USB를 꽂아도 보드 전원 LED가 안 켜져요", cause: "충전 전용 케이블, USB 포트 전원 부족, 보드 손상",
    checkMethod: "멀티미터를 DC 전압(20V 범위)에 두고 빨간 리드를 보드 5V 핀, 검은 리드를 GND 핀에 대요.", meterMode: "DC 전압", probePoints: "{board}.5V ↔ {board}.GND",
    expectedRange: { kind: "number", min: 4.75, max: 5.25, unit: "V" },
    ifNormal: "전원은 정상이에요. LED가 안 보이면 보드의 전원 LED 위치를 다시 확인하고 업로드 단계로 넘어가요.",
    ifAbnormal: "0V면 데이터 케이블·다른 USB 포트로 바꿔 다시 재요. 4.4V 근처면 USB 허브를 빼고 컴퓨터에 직접 꽂아요. 그래도 같으면 결과를 보내주세요.",
    severity: "warning", sourceUrl: "https://www.usb.org/sites/default/files/power_delivery_motherboards.pdf", verifiedAt: "2026-11-02"
  },
  {
    id: "board-3v3-rail", appliesWhen: { boardHasPin: "power_3v3" }, stage: "power",
    symptom: "3.3V로 쓰는 부품이 안 켜져요", cause: "3V3 핀 연결 실수, 레귤레이터 과부하",
    checkMethod: "DC 전압(20V 범위)으로 빨간 리드를 보드 3V3 핀, 검은 리드를 GND에 대요.", meterMode: "DC 전압", probePoints: "{board}.3V3 ↔ {board}.GND",
    expectedRange: null,
    ifNormal: "3V3 근처 값이면 전원은 들어오고 있어요. 부품 쪽 배선을 확인해요.",
    ifAbnormal: "0V 근처면 USB 전원부터 확인하고, 부품을 하나씩 빼며 다시 재요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "upload-fails", appliesWhen: { partTypes: ["board"] }, stage: "upload",
    symptom: "코드 업로드가 안 돼요 (포트가 안 보이거나 오류)", cause: "데이터가 안 되는 USB 케이블, 보드·포트 선택, 드라이버, 보드 패키지",
    checkMethod: "순서대로 확인해요: ① 데이터 전송되는 USB 케이블인지 ② Arduino IDE에서 보드 종류 ③ 포트 ④ USB 드라이버(CH340 등) ⑤ 보드 패키지 설치.", meterMode: null, probePoints: "Arduino IDE · 도구 메뉴",
    expectedRange: { kind: "boolean", expect: "업로드 완료 메시지가 떠요" },
    ifNormal: "업로드됐어요. 시리얼 모니터 속도(코드의 Serial.begin 값)를 맞추고 출력을 확인해요.",
    ifAbnormal: "어느 번호에서 막혔는지와 오류 문구를 그대로 보내주세요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "button-continuity", appliesWhen: { catalogIds: ["tact-switch-12mm"] }, stage: "wiring",
    symptom: "버튼을 눌러도 반응이 없어요", cause: "같은 쪽(이미 연결된) 다리를 사용, 덜 꽂힘",
    checkMethod: "멀티미터를 통전(삐 소리) 모드에 두고, 버튼을 누른 채 연결한 두 다리에 리드를 대요.", meterMode: "통전(삐 소리)", probePoints: "{part}의 연결한 두 다리",
    expectedRange: { kind: "boolean", expect: "누를 때만 삐 소리가 나요" },
    ifNormal: "버튼은 정상이에요. 코드의 pinMode가 INPUT_PULLUP인지 확인해요.",
    ifAbnormal: "누르지 않아도 울리면 이미 연결된 다리예요. 대각선 다리로 옮겨요. 눌러도 안 울리면 다리가 끝까지 꽂혔는지 봐요.",
    severity: "info", sourceUrl: "https://github.com/wokwi/wokwi-elements", verifiedAt: null
  },
  {
    id: "led-no-light", appliesWhen: { catalogIds: ["led-5mm"] }, stage: "wiring",
    symptom: "LED가 안 켜져요", cause: "방향이 반대(긴 다리 A가 +), 저항이 다른 줄에 꽂힘",
    checkMethod: "멀티미터를 다이오드 모드에 두고 빨간 리드를 긴 다리(A), 검은 리드를 짧은 다리(C)에 대요.", meterMode: "다이오드", probePoints: "{part}.A ↔ {part}.C",
    expectedRange: { kind: "boolean", expect: "LED가 희미하게 켜지거나 숫자가 표시돼요" },
    ifNormal: "LED는 살아 있어요. 방향과 저항이 회로대로 같은 줄에 꽂혔는지 확인해요.",
    ifAbnormal: "반대로 대도 안 켜지면 LED가 손상됐을 수 있어요. 다른 LED로 바꿔봐요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "resistor-value", appliesWhen: { catalogIds: ["resistor"] }, stage: "wiring",
    symptom: "저항값이 맞는지 모르겠어요", cause: "색띠를 잘못 읽음",
    checkMethod: "보드에서 빼거나 한쪽 다리를 띄운 상태로 멀티미터를 저항(Ω) 모드에 두고 양 끝에 대요.", meterMode: "저항(Ω)", probePoints: "{part} 양 끝",
    expectedRange: { kind: "derived_resistance" },
    ifNormal: "회로에 적힌 저항이 맞아요.", ifAbnormal: "다른 저항이에요. 회로에 적힌 값의 저항으로 바꿔요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "fsr-standoff", appliesWhen: { catalogIds: ["fsr-402"] }, stage: "sensor",
    symptom: "누르지 않았는데도 값이 높게 나와요", cause: "센서 손상, 다리 사이 합선, 굽힘",
    checkMethod: "센서를 회로에서 빼고 누르지 않은 채 멀티미터 저항(Ω) 최대 범위로 두 다리를 재요. 그다음 손가락으로 눌러 다시 재요.", meterMode: "저항(Ω)", probePoints: "{part}.1 ↔ {part}.2",
    expectedRange: { kind: "number", min: 10_000_000, max: null, unit: "Ω" },
    ifNormal: "센서는 정상이에요(안 누르면 범위 초과 OL). 분압 저항과 아날로그 핀 배선을 확인해요.",
    ifAbnormal: "안 눌렀는데 수십 kΩ 이하면 다리 사이 합선이나 굽힘을 확인하고, 그래도 같으면 센서를 바꿔요.",
    severity: "info", sourceUrl: "https://pololu.com/file/0J749/FSR400-Series-Integration-Guide-13.pdf", verifiedAt: "2026-11-02"
  },
  {
    id: "servo-brownout", appliesWhen: { catalogIds: ["sg90-servo"] }, stage: "actuator",
    symptom: "서보가 움직일 때 보드가 꺼지거나 리셋돼요", cause: "서보가 순간적으로 큰 전류를 써서 전압이 떨어짐",
    checkMethod: "서보가 움직이는 동안 DC 전압(20V 범위)으로 서보 V+와 GND 사이를 재요.", meterMode: "DC 전압", probePoints: "{part}.V+ ↔ {part}.GND",
    expectedRange: { kind: "number", min: 4.8, max: 6, unit: "V" },
    ifNormal: "서보 전원은 범위 안이에요. 신호선(PWM)이 PWM 핀에 있는지 확인해요.",
    ifAbnormal: "4.8V보다 떨어지면 서보를 별도 5V 전원에 연결하고 GND만 보드와 공통으로 이어요.",
    severity: "warning", sourceUrl: "https://datasheetspdf.com/pdf/791970/TowerPro/SG90/1", verifiedAt: "2026-11-02"
  },
  {
    id: "oled-blank", appliesWhen: { catalogIds: ["ssd1306-oled-128x64"] }, stage: "display",
    symptom: "OLED 화면에 아무것도 안 나와요", cause: "I2C 주소 불일치, SDA/SCL 반대, 전원 핀 착오",
    checkMethod: "I2C 스캐너 예제를 업로드하고 시리얼 모니터에 찍히는 주소를 확인해요.", meterMode: null, probePoints: "시리얼 모니터",
    expectedRange: { kind: "boolean", expect: "0x3C 또는 0x3D가 찍혀요" },
    ifNormal: "찍힌 주소를 코드의 display.begin(…, 0x3C/0x3D)에 똑같이 넣어요.",
    ifAbnormal: "아무 주소도 안 나오면 SDA·SCL을 서로 바꿔 보고, VCC·GND를 다시 확인해요.",
    severity: "info", sourceUrl: "https://wiki.elegoo.com/oshw-getting-started-&-kits/oled", verifiedAt: "2026-11-02"
  },
  {
    id: "signal-over-3v3", appliesWhen: { boardLogic: 3.3 }, stage: "wiring",
    symptom: "센서를 연결한 뒤 보드가 이상하거나 뜨거워요", cause: "5V 신호가 3.3V 보드 핀에 직접 들어감",
    checkMethod: "보드를 켠 상태에서 DC 전압으로 그 신호선(보드 핀 쪽)과 GND 사이를 재요.", meterMode: "DC 전압", probePoints: "{board}.신호 핀 ↔ {board}.GND",
    expectedRange: { kind: "number", min: null, max: 3.6, unit: "V" },
    ifNormal: "신호 전압은 보드 허용 범위 안이에요.",
    ifAbnormal: "3.6V를 넘으면 바로 전원을 빼요. 레벨 시프터나 분압 저항을 넣어야 해요.",
    severity: "warning", sourceUrl: "https://documentation.espressif.com/esp32_datasheet_en.pdf", verifiedAt: "2026-11-02"
  }  ,
  // ── 여기부터는 검증 사다리를 위해 더한 카드 ──────────────────────────────
  // 숫자 범위는 부품 카드의 공급 전압(출처 있음)에서 온 것만 둔다. 나머지는 눈·귀·시리얼로
  // 확인하고, 숫자를 재더라도 정상 범위를 지어내지 않는다(값만 받아 달그락이 함께 본다).
  {
    id: "prepower-short", appliesWhen: { always: true }, stage: "power", ladderStage: "prepower", input: "yes_no",
    why: "전원(+)과 GND가 어딘가에서 붙어 있으면 전원을 넣는 순간 부품이나 USB 포트가 상할 수 있어요.",
    symptom: "전원을 넣기 전에 합선이 없는지 확인해요", cause: "전원선과 GND선이 같은 줄에 꽂힘, 납땜 다리끼리 붙음, 벗겨진 전선끼리 닿음",
    checkMethod: "USB와 전지를 모두 뺀 상태에서 멀티미터를 통전(삐 소리) 모드에 두고, 검은 리드를 GND 선에, 빨간 리드를 전원(+) 선에 대요.", meterMode: "통전(삐 소리)", probePoints: "전원(+) 선 ↔ GND 선 (전원은 모두 뺀 상태)",
    expectedRange: { kind: "boolean", expect: "삐 소리가 계속 나지 않아요" },
    noMeter: { how: "전원을 넣지 않은 채로, 빨간 선(전원)과 검은 선(GND)이 브레드보드의 같은 줄에 꽂혀 있지 않은지, 납땜한 다리끼리 붙은 곳이 없는지 하나씩 따라가며 봐요.", expect: "전원선과 GND선이 만나는 곳이 없어요" },
    ifNormal: "합선은 보이지 않아요. 다음으로 방향(극성)을 확인해요.",
    ifAbnormal: "전원을 넣지 마세요. 삐 소리가 나는 상태로 부품을 하나씩 빼 보면, 소리가 멈추는 순간 뺀 부품이나 그 선이 원인이에요. 어디서 멈췄는지 알려주세요.",
    severity: "blocked", sourceUrl: null, verifiedAt: null
  },
  {
    id: "prepower-polarity", appliesWhen: { always: true }, stage: "power", ladderStage: "prepower", input: "yes_no",
    why: "방향이 있는 부품을 거꾸로 꽂으면 전원을 넣자마자 망가질 수 있어요.",
    symptom: "방향이 있는 부품이 맞게 꽂혔는지 확인해요", cause: "모듈의 VCC·GND를 반대로 연결, LED·전지·전해 콘덴서의 방향 착오",
    checkMethod: "회로도를 옆에 두고, 각 부품에 인쇄된 글자(VCC·VIN·5V·3V3·GND·+·−)와 연결한 선이 회로도와 같은지 부품마다 손으로 짚어가며 확인해요.", meterMode: null, probePoints: "각 부품의 전원 핀과 GND 핀",
    expectedRange: { kind: "boolean", expect: "모든 부품의 전원·GND가 회로도와 같아요" },
    ifNormal: "방향은 맞아요. 전원을 넣을 준비가 됐어요.",
    ifAbnormal: "다른 곳을 고친 뒤 다시 확인해요. 헷갈리는 부품은 사진을 찍어 보내주세요.",
    severity: "blocked", sourceUrl: null, verifiedAt: null
  },
  {
    id: "prepower-seated", appliesWhen: { always: true }, stage: "wiring", ladderStage: "prepower", input: "yes_no",
    why: "덜 꽂힌 선 하나 때문에 '아무 반응이 없는' 상황이 가장 많이 생겨요.",
    symptom: "선과 부품이 끝까지 꽂혀 있는지 확인해요", cause: "점퍼선이 반쯤 꽂힘, 핀헤더 납땜이 덜 됨, 선이 옆 줄에 꽂힘",
    checkMethod: "선을 하나씩 살짝 당겨 보고(빠지면 덜 꽂힌 거예요), 회로도의 연결을 한 줄씩 손으로 짚으며 같은 핀에 꽂혀 있는지 봐요.", meterMode: null, probePoints: "모든 점퍼선과 부품 다리",
    expectedRange: { kind: "boolean", expect: "당겨도 빠지는 선이 없고, 연결이 회로도와 같아요" },
    ifNormal: "배선은 회로도와 같아요.", ifAbnormal: "빠지거나 다른 핀에 꽂힌 선을 고치고 다시 확인해요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "board-power-led", appliesWhen: { always: true }, stage: "power", input: "observe",
    why: "보드에 전원이 들어오는지부터 봐야, 뒤의 문제를 배선 탓인지 전원 탓인지 가를 수 있어요.",
    symptom: "보드에 전원이 들어오는지 확인해요", cause: "충전 전용 USB 케이블, 헐거운 단자, 합선으로 전원이 꺼짐",
    checkMethod: "다른 부품은 그대로 둔 채 USB를 꽂고, 보드의 전원 표시등(보통 PWR·ON이라고 적힌 작은 LED)을 봐요.", meterMode: null, probePoints: "보드의 전원 표시등",
    expectedRange: { kind: "boolean", expect: "전원 표시등이 켜진 채로 있어요" },
    ifNormal: "전원이 들어와요.",
    ifAbnormal: "바로 USB를 빼요. 부품을 모두 뺀 보드만으로 다시 꽂아 켜지면 배선 쪽 합선이고, 그래도 안 켜지면 케이블(데이터 전송용)과 USB 포트를 바꿔 봐요. 표시등이 없는 보드라면 그렇다고 알려주세요.",
    severity: "warning", sourceUrl: null, verifiedAt: null
  },
  {
    id: "upload-blink", appliesWhen: { always: true }, stage: "upload", input: "observe",
    why: "가장 단순한 예제가 돌아가야, 내 코드가 안 될 때 코드 문제인지 보드 문제인지 알 수 있어요.",
    symptom: "깜빡이기(Blink) 예제가 도는지 확인해요", cause: "보드·포트 선택이 다름, 업로드는 됐지만 다른 보드에 올라감",
    checkMethod: "Arduino IDE의 파일 → 예제 → 01.Basics → Blink를 열어 업로드하고, 보드에 붙어 있는 작은 LED를 봐요.", meterMode: null, probePoints: "보드에 붙어 있는 LED",
    expectedRange: { kind: "boolean", expect: "보드의 LED가 1초마다 켜졌다 꺼져요" },
    ifNormal: "보드와 업로드는 정상이에요. 이제 부품을 하나씩 확인해요.",
    ifAbnormal: "업로드 완료 메시지가 떴는지, 오류 문구가 있었는지 그대로 알려주세요. 보드에 내장 LED가 없는 모델이면 그렇다고 알려주세요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "upload-serial", appliesWhen: { always: true }, stage: "upload", input: "serial_line",
    why: "보드가 보내는 글자를 컴퓨터에서 읽을 수 있어야, 뒤에서 센서 값을 눈으로 확인할 수 있어요.",
    symptom: "시리얼 모니터에 글자가 찍히는지 확인해요", cause: "시리얼 모니터 속도가 코드와 다름, 다른 포트를 열어 둠",
    checkMethod: "받은 펌웨어(보드에 올리는 코드)를 업로드한 뒤 도구 → 시리얼 모니터를 열고, 오른쪽 아래 속도를 코드의 Serial.begin(…) 숫자와 같게 맞춰요. 찍히는 줄 하나를 그대로 복사해 보내주세요.", meterMode: null, probePoints: "Arduino IDE · 시리얼 모니터",
    expectedRange: null,
    ifNormal: "보드와 컴퓨터가 글자를 주고받아요.",
    ifAbnormal: "아무것도 안 찍히면 속도 숫자와 포트를 다시 확인해요. 깨진 글자(□, ?)가 찍히면 속도가 다른 거예요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "i2c-scan", appliesWhen: { interface: "I2C" }, stage: "sensor", input: "serial_line",
    why: "I2C 부품은 저마다 주소가 있어요. 주소가 보이면 전원과 두 신호선(SDA·SCL)이 맞게 이어졌다는 뜻이에요.",
    symptom: "I2C 부품이 보드에 보이는지 확인해요", cause: "SDA·SCL을 서로 바꿔 꽂음, 전원·GND 누락, 주소가 코드와 다름",
    checkMethod: "I2C 스캐너 예제(파일 → 예제 → Wire → i2c_scanner)를 업로드하고, 시리얼 모니터에 찍히는 주소(0x로 시작)를 그대로 보내주세요.", meterMode: null, probePoints: "시리얼 모니터",
    expectedRange: null,
    ifNormal: "찍힌 주소를 코드에 똑같이 넣어요.",
    ifAbnormal: "아무 주소도 안 나오면 SDA와 SCL을 서로 바꿔 꽂아 보고, 그 부품의 전원·GND를 다시 확인해요. 다른 주소가 나오면 그 주소를 그대로 알려주세요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "aht20-reading", appliesWhen: { catalogIds: ["aht20-module"] }, stage: "sensor", input: "observe",
    why: "숫자가 나오는 것만으로는 부족해요. 실제 변화에 따라 움직여야 센서가 살아 있는 거예요.",
    symptom: "온습도 값이 실제 변화를 따라가는지 확인해요", cause: "센서 초기화 실패, 다른 주소의 부품을 읽음",
    checkMethod: "시리얼 모니터를 보면서 센서에 입김을 2~3초 불어요.", meterMode: null, probePoints: "시리얼 모니터의 습도 값",
    expectedRange: { kind: "boolean", expect: "입김을 불면 습도 값이 올라갔다가 천천히 내려와요" },
    ifNormal: "센서가 동작해요.", ifAbnormal: "값이 전혀 안 변하거나 같은 숫자만 나오면, I2C 주소 확인 결과와 찍히는 줄을 그대로 알려주세요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "mpu6050-reading", appliesWhen: { catalogIds: ["mpu6050-gy521"] }, stage: "sensor", input: "observe",
    why: "기울일 때 값이 따라 움직여야 센서와 배선이 살아 있는 거예요.",
    symptom: "기울기 값이 움직임을 따라가는지 확인해요", cause: "센서 초기화 실패(절전 상태), 주소 불일치(AD0 핀)",
    checkMethod: "시리얼 모니터를 보면서 모듈을 천천히 앞뒤·좌우로 기울여요.", meterMode: null, probePoints: "시리얼 모니터의 가속도 값",
    expectedRange: { kind: "boolean", expect: "기울이는 방향에 따라 값이 커졌다 작아졌다 해요" },
    ifNormal: "센서가 동작해요.", ifAbnormal: "값이 0이나 한 숫자로 멈춰 있으면, I2C 주소 확인 결과(0x68인지 0x69인지)와 찍히는 줄을 알려주세요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "hcsr04-supply", appliesWhen: { catalogIds: ["hc-sr04"] }, stage: "sensor", ...supplyFromCard("hc-sr04"),
    why: "이 센서는 5V 근처에서만 제대로 재요. 전압이 모자라면 거리가 0이나 엉뚱한 값으로 나와요.",
    symptom: "초음파 센서에 전압이 맞게 들어가는지 확인해요", cause: "3.3V 핀에 연결, 전원선 접촉 불량",
    checkMethod: "전원을 켠 상태에서 멀티미터를 DC 전압(20V 범위)에 두고 빨간 리드를 센서의 VCC, 검은 리드를 센서의 GND에 대요.", meterMode: "DC 전압", probePoints: "{part}.VCC ↔ {part}.GND",
    ifNormal: "센서 전원은 범위 안이에요.", ifAbnormal: "범위보다 낮으면 VCC가 보드의 5V 핀에 꽂혔는지 확인해요. 잰 값을 그대로 알려주세요.",
    severity: "warning"
  },
  {
    id: "hcsr04-reading", appliesWhen: { catalogIds: ["hc-sr04"] }, stage: "sensor", input: "observe",
    why: "손을 움직일 때 거리가 따라 변해야 Trig·Echo 두 선이 맞게 이어진 거예요.",
    symptom: "거리 값이 손 움직임을 따라가는지 확인해요", cause: "Trig와 Echo를 바꿔 꽂음, 3.3V 보드에서 Echo 분압 누락",
    checkMethod: "시리얼 모니터를 보면서 센서 앞 10cm쯤에 손바닥을 댔다가 30cm쯤으로 천천히 멀리해요.", meterMode: null, probePoints: "시리얼 모니터의 거리 값",
    expectedRange: { kind: "boolean", expect: "손을 멀리하면 숫자가 커지고 가까이하면 작아져요" },
    ifNormal: "센서가 동작해요.", ifAbnormal: "항상 0이거나 같은 값이면 Trig·Echo 선을 서로 바꿔 보고, 찍히는 줄을 그대로 알려주세요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "pot-sweep", appliesWhen: { catalogIds: ["potentiometer-10k"] }, stage: "sensor", input: "observe",
    why: "손잡이를 끝에서 끝까지 돌릴 때 값이 고르게 변해야 세 다리가 맞게 이어진 거예요.",
    symptom: "가변저항 값이 0이나 최대에서 멈춰 있지 않은지 확인해요", cause: "가운데 다리(신호)가 아날로그 핀이 아닌 곳에 꽂힘, 양 끝 다리 중 하나가 빠짐",
    checkMethod: "시리얼 모니터를 보면서 손잡이를 한쪽 끝에서 반대쪽 끝까지 천천히 돌려요.", meterMode: null, probePoints: "시리얼 모니터의 아날로그 값",
    expectedRange: { kind: "boolean", expect: "돌리는 만큼 숫자가 가장 작은 값에서 가장 큰 값까지 이어서 변해요" },
    ifNormal: "가변저항과 배선은 정상이에요.",
    ifAbnormal: "계속 0이면 전원 쪽 다리가, 계속 최대면 GND 쪽 다리가 빠졌을 가능성이 커요. 제멋대로 흔들리면 가운데 다리가 아날로그 핀에 꽂혔는지 봐요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "fsr-press", appliesWhen: { catalogIds: ["fsr-402"] }, stage: "sensor", input: "observe",
    why: "누르는 힘에 따라 값이 변해야 센서와 분압 저항이 맞게 이어진 거예요.",
    symptom: "누를 때 압력 값이 변하는지 확인해요", cause: "분압 저항 누락(값이 최대나 0에 붙음), 신호선이 아날로그 핀이 아닌 곳에 꽂힘",
    checkMethod: "시리얼 모니터를 보면서 센서의 둥근 부분을 손가락으로 살살 눌렀다가 떼요.", meterMode: null, probePoints: "시리얼 모니터의 아날로그 값",
    expectedRange: { kind: "boolean", expect: "누르면 숫자가 변하고 떼면 처음 값으로 돌아와요" },
    ifNormal: "센서가 동작해요.", ifAbnormal: "눌러도 값이 0이나 최대에 붙어 있으면 분압 저항이 회로도대로 들어갔는지 확인해요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "button-floating", appliesWhen: { catalogIds: ["tact-switch-12mm"] }, stage: "wiring", input: "observe",
    why: "아무것도 잇지 않은 입력 핀은 주변 잡음에 따라 값이 제멋대로 바뀌어요. 기준 전압을 잡아 주는 풀업이 필요해요.",
    symptom: "버튼을 안 눌렀는데 값이 제멋대로 바뀌지 않는지 확인해요", cause: "풀업(안 누를 때 값을 한쪽으로 잡아 주는 설정)이 빠짐",
    checkMethod: "시리얼 모니터를 보면서 버튼에 손을 대지 않고 5초쯤 지켜본 뒤, 버튼을 눌렀다 떼요.", meterMode: null, probePoints: "시리얼 모니터의 버튼 값",
    expectedRange: { kind: "boolean", expect: "가만히 두면 값이 한 가지로 유지되고, 누를 때만 바뀌어요" },
    ifNormal: "버튼 입력은 안정적이에요.",
    ifAbnormal: "가만히 둬도 값이 왔다 갔다 하면 코드의 pinMode가 INPUT_PULLUP인지 확인해요. 그래도 같으면 찍히는 줄을 알려주세요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "slide-switch-continuity", appliesWhen: { catalogIds: ["slide-switch-spdt"] }, stage: "wiring",
    why: "전원 스위치는 가운데 다리와 한쪽 다리만 이어져요. 엉뚱한 두 다리를 쓰면 항상 꺼져 있거나 항상 켜져 있어요.",
    symptom: "스위치가 밀 때만 이어지는지 확인해요", cause: "가운데(COM)가 아닌 양 끝 다리 두 개를 사용",
    checkMethod: "전원을 뺀 상태에서 멀티미터를 통전(삐 소리) 모드에 두고, 가운데 다리와 연결한 쪽 끝 다리에 리드를 댄 채 스위치를 양쪽으로 밀어 봐요.", meterMode: "통전(삐 소리)", probePoints: "{part}.COM ↔ 연결한 끝 다리",
    expectedRange: { kind: "boolean", expect: "한쪽으로 밀었을 때만 삐 소리가 나요" },
    ifNormal: "스위치는 정상이에요.", ifAbnormal: "어느 쪽으로 밀어도 소리가 안 나면 가운데 다리를 쓰고 있는지 확인해요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "buzzer-beep", appliesWhen: { catalogIds: ["active-buzzer"] }, stage: "actuator", input: "observe",
    why: "능동 부저는 전압만 주면 소리가 나요. 소리가 안 나면 방향이나 핀이 다른 거예요.",
    symptom: "부저에서 소리가 나는지 확인해요", cause: "+ 다리(긴 다리)와 − 다리를 반대로 꽂음, 다른 핀에 연결",
    checkMethod: "부저를 울리는 코드를 올리고 귀로 들어요. 부저 윗면의 + 표시가 신호 핀 쪽인지도 봐요.", meterMode: null, probePoints: "부저의 + 다리와 신호 핀",
    expectedRange: { kind: "boolean", expect: "코드가 울릴 때 삐 소리가 나요" },
    ifNormal: "부저가 동작해요.", ifAbnormal: "소리가 안 나면 부저를 180도 돌려 꽂아 보고, 그래도 안 나면 연결한 핀 번호를 알려주세요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "inmp441-supply-pin", appliesWhen: { catalogIds: ["inmp441-i2s-mic"] }, stage: "sensor", ladderStage: "prepower", input: "yes_no",
    why: "이 마이크는 3.3V 전용이에요. 5V에 꽂으면 전원을 넣는 순간 망가질 수 있어요.",
    symptom: "마이크의 전원이 3V3 핀에 꽂혀 있는지 확인해요", cause: "VDD를 5V 핀에 연결",
    checkMethod: "전원을 넣기 전에, 마이크의 VDD 선이 보드의 3V3(3.3V)이라고 적힌 핀에 꽂혀 있는지 눈으로 따라가 봐요.", meterMode: null, probePoints: "{part}.VDD → 보드의 3V3 핀",
    expectedRange: { kind: "boolean", expect: "VDD가 3V3 핀에 꽂혀 있어요 (5V 아님)" },
    ifNormal: "전원 핀은 맞아요.", ifAbnormal: "5V에 꽂혀 있으면 전원을 넣지 말고 3V3 핀으로 옮겨요.",
    severity: "blocked", sourceUrl: findCard("inmp441-i2s-mic")?.sourceUrls[0] ?? null, verifiedAt: null
  },
  {
    id: "inmp441-sound", appliesWhen: { catalogIds: ["inmp441-i2s-mic"] }, stage: "sensor", input: "observe",
    why: "소리를 낼 때 값이 흔들려야 마이크와 세 신호선(SCK·WS·SD)이 맞게 이어진 거예요.",
    symptom: "소리에 따라 마이크 값이 변하는지 확인해요", cause: "SCK·WS·SD 핀 번호가 코드와 다름, L/R 핀 미연결",
    checkMethod: "도구 → 시리얼 플로터를 열고 마이크 가까이에서 손뼉을 두세 번 쳐요.", meterMode: null, probePoints: "시리얼 플로터의 선",
    expectedRange: { kind: "boolean", expect: "손뼉을 칠 때마다 선이 크게 튀어요" },
    ifNormal: "마이크가 동작해요.", ifAbnormal: "선이 0에서 안 움직이면 SCK·WS·SD가 코드에 적힌 핀 번호와 같은지 확인하고, 연결한 핀 번호를 알려주세요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "ws2812-first-pixel", appliesWhen: { catalogIds: ["ws2812b-ring-12"] }, stage: "actuator", input: "observe",
    why: "LED 링은 신호가 들어가는 쪽(DIN)이 정해져 있어요. 반대쪽(DOUT)에 꽂으면 하나도 안 켜져요.",
    symptom: "LED 링이 켜지는지 확인해요", cause: "DOUT에 신호선을 꽂음, 코드의 LED 개수·핀 번호가 다름, 전원 부족",
    checkMethod: "밝기를 낮게 둔 테스트 코드(한 칸씩 켜지는 예제)를 올리고 링을 봐요.", meterMode: null, probePoints: "LED 링 · {part}.DIN",
    expectedRange: { kind: "boolean", expect: "LED가 한 칸씩 차례로 켜져요" },
    ifNormal: "LED 링이 동작해요.", ifAbnormal: "하나도 안 켜지면 신호선이 DIN(들어가는 쪽)에 꽂혔는지 확인해요. 일부만 켜지거나 색이 이상하면 본 그대로 알려주세요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "drv8833-supply", appliesWhen: { catalogIds: ["drv8833-driver"] }, stage: "actuator", ...supplyFromCard("drv8833-driver"),
    why: "모터 드라이버는 모터용 전원(VM)이 따로 필요해요. 이 전압이 범위를 벗어나면 모터가 안 돌거나 드라이버가 상해요.",
    symptom: "모터 드라이버의 모터 전원(VM)이 맞는지 확인해요", cause: "VM에 전원을 안 이음, 전지 전압이 너무 낮거나 높음",
    checkMethod: "모터 전원을 켠 상태에서 멀티미터를 DC 전압(20V 범위)에 두고 빨간 리드를 VM, 검은 리드를 GND에 대요.", meterMode: "DC 전압", probePoints: "{part}.VM ↔ {part}.GND",
    ifNormal: "모터 전원은 범위 안이에요.", ifAbnormal: "0V면 모터 전원선이 VM에 이어졌는지, 범위를 벗어나면 전원(전지)의 전압을 확인해요. 잰 값을 그대로 알려주세요.",
    severity: "warning"
  },
  {
    id: "drv8833-spin", appliesWhen: { catalogIds: ["drv8833-driver"] }, stage: "actuator", input: "observe",
    why: "정방향·역방향이 모두 돌아야 드라이버의 입력 두 개가 맞게 이어진 거예요.",
    symptom: "모터가 양쪽 방향으로 도는지 확인해요", cause: "SLP(절전) 핀이 꺼져 있음, 입력 핀 한쪽 누락, 보드와 GND를 공통으로 안 이음",
    checkMethod: "모터를 2초씩 앞으로·뒤로 돌리는 테스트 코드를 올리고 모터를 봐요.", meterMode: null, probePoints: "모터 축",
    expectedRange: { kind: "boolean", expect: "모터가 한 방향으로 돌다가 반대 방향으로 돌아요" },
    ifNormal: "모터와 드라이버가 동작해요.", ifAbnormal: "전혀 안 돌면 SLP 핀이 HIGH(켜짐)인지와 보드·드라이버의 GND가 이어졌는지 확인해요. 한 방향만 돌면 입력 핀 두 개의 연결을 확인해요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  },
  {
    id: "tp4056-input", appliesWhen: { catalogIds: ["tp4056-protected"] }, stage: "power", ...supplyFromCard("tp4056-protected"),
    why: "충전 모듈에 들어가는 전압이 범위 안이어야 전지를 안전하게 충전해요.",
    symptom: "충전 모듈에 들어가는 전압이 맞는지 확인해요", cause: "USB 전원 부족, IN+·IN− 반대로 연결",
    checkMethod: "USB를 꽂은 상태에서 멀티미터를 DC 전압(20V 범위)에 두고 빨간 리드를 IN+, 검은 리드를 IN−에 대요.", meterMode: "DC 전압", probePoints: "{part}.IN+ ↔ {part}.IN-",
    noMeter: { how: "USB를 꽂고 모듈의 표시등을 봐요. 표시등 색은 모듈마다 다르니 켜지는지만 봐요.", expect: "모듈의 표시등이 켜져요" },
    ifNormal: "입력 전압은 범위 안이에요.", ifAbnormal: "0V면 케이블과 USB 포트를 바꿔 봐요. 숫자 앞에 −가 붙으면 선이 반대예요. 잰 값을 그대로 알려주세요.",
    severity: "warning"
  },
  {
    id: "lipo-voltage", appliesWhen: { catalogIds: ["lipo-1s-jstph"] }, stage: "power", ladderStage: "prepower", ...supplyFromCard("lipo-1s-jstph"),
    why: "너무 많이 방전된 리튬 전지는 충전하거나 쓰면 위험해요. 연결하기 전에 전압부터 봐요.",
    symptom: "리튬 전지의 전압이 쓸 수 있는 범위인지 확인해요", cause: "오래 방치해 과방전됨, 커넥터의 +·− 배열이 모듈과 반대",
    checkMethod: "전지를 아무 데도 꽂지 않은 채, 멀티미터를 DC 전압(20V 범위)에 두고 빨간 리드를 전지 커넥터의 + 선(보통 빨강), 검은 리드를 − 선(보통 검정)에 대요. 리드끼리 닿지 않게 조심해요.", meterMode: "DC 전압", probePoints: "{part}.+ ↔ {part}.-",
    ifNormal: "전지 전압은 범위 안이에요. 숫자 앞에 −가 없었는지도 함께 알려주세요.",
    ifAbnormal: "범위보다 낮으면 그 전지는 쓰지 말고 알려주세요. 숫자 앞에 −가 붙으면 커넥터 방향이 반대라서 그대로 꽂으면 안 돼요. 부풀었거나 상처가 있는 전지는 쓰지 않아요.",
    severity: "blocked"
  },
  {
    id: "holder-polarity", appliesWhen: { catalogIds: ["holder-18650"] }, stage: "power", ladderStage: "prepower",
    why: "전지 홀더는 보호회로가 없어서, 방향이 반대면 연결하는 순간 부품이 상해요.",
    symptom: "전지 홀더의 +·− 방향이 맞는지 확인해요", cause: "전지를 거꾸로 넣음, 빨강·검정 선을 반대로 연결",
    checkMethod: "전지를 넣고 홀더의 선을 아무 데도 잇지 않은 채, 멀티미터를 DC 전압(20V 범위)에 두고 빨간 리드를 빨간 선, 검은 리드를 검은 선에 대요.", meterMode: "DC 전압", probePoints: "{part}.+ ↔ {part}.-",
    expectedRange: { kind: "boolean", expect: "숫자 앞에 −(마이너스)가 붙지 않아요" },
    ifNormal: "방향은 맞아요. 잰 전압도 함께 알려주세요.", ifAbnormal: "−가 붙으면 전지를 반대로 넣었거나 선 색이 반대예요. 연결하지 말고 고친 뒤 다시 재요.",
    severity: "blocked", sourceUrl: null, verifiedAt: null
  },
  {
    id: "mt3608-output", appliesWhen: { catalogIds: ["mt3608-boost"] }, stage: "power", input: "number",
    why: "승압 모듈은 나사를 돌려 출력 전압을 맞추는 부품이에요. 맞추기 전에 보드를 이으면 너무 높은 전압이 들어갈 수 있어요.",
    symptom: "승압 모듈의 출력 전압을 맞췄는지 확인해요", cause: "출력을 맞추지 않은 채 연결, 조절 나사를 반대로 돌림",
    checkMethod: "출력(VOUT)에는 아무것도 잇지 않고 입력만 연결한 채, 멀티미터를 DC 전압(20V 범위)에 두고 빨간 리드를 VOUT+, 검은 리드를 VOUT−에 대요. 작은 드라이버로 조절 나사를 돌려 설계에 적힌 전압으로 맞추고, 맞춘 값을 알려주세요.", meterMode: "DC 전압", probePoints: "{part}.VOUT+ ↔ {part}.VOUT-",
    expectedRange: null,
    ifNormal: "맞춘 값이 설계의 전압과 같으면 이제 출력을 이어도 돼요.", ifAbnormal: "나사를 여러 바퀴 돌려야 값이 움직이기 시작하는 모듈이 많아요. 그래도 안 변하면 잰 값을 알려주세요.",
    severity: "blocked", sourceUrl: null, verifiedAt: null
  },
  {
    id: "ams1117-output", appliesWhen: { catalogIds: ["ams1117-3v3"] }, stage: "power", input: "number",
    why: "이 모듈이 내보내는 전압으로 3.3V 부품이 돌아가요. 부품을 잇기 전에 출력부터 봐요.",
    symptom: "3.3V 레귤레이터의 출력을 확인해요", cause: "입력 전압이 모자람, VIN·VOUT을 바꿔 연결",
    checkMethod: "출력에 부품을 잇기 전에, 멀티미터를 DC 전압(20V 범위)에 두고 빨간 리드를 VOUT, 검은 리드를 GND에 대요. 잰 값을 그대로 알려주세요.", meterMode: "DC 전압", probePoints: "{part}.VOUT ↔ {part}.GND",
    expectedRange: null,
    ifNormal: "3.3V 근처면 출력이 나오고 있어요.", ifAbnormal: "0V 근처거나 입력과 같은 값이면 VIN·VOUT 연결과 입력 전압을 확인해요.",
    severity: "warning", sourceUrl: null, verifiedAt: null
  },
  {
    id: "regulator-hot", appliesWhen: { needsAny: ["ams1117-3v3", "mt3608-boost", "tp4056-protected"] }, stage: "power", ladderStage: "together", input: "yes_no",
    why: "전원 부품이 못 만질 만큼 뜨거우면 감당 못 할 전류가 흐르고 있다는 신호예요.",
    symptom: "전원 모듈이 너무 뜨겁지 않은지 확인해요", cause: "부품들이 쓰는 전류가 모듈의 한계를 넘음, 어딘가 합선",
    checkMethod: "모든 부품을 동작시킨 채 1분쯤 둔 뒤, 전원 모듈의 검은 칩에 손끝을 1초만 살짝 대 봐요.", meterMode: null, probePoints: "전원 모듈의 칩",
    expectedRange: { kind: "boolean", expect: "따뜻하지만 손을 못 댈 만큼 뜨겁지는 않아요" },
    ifNormal: "발열은 괜찮아요.", ifAbnormal: "바로 전원을 빼요. 어떤 부품이 동작할 때 뜨거워지는지 알려주세요.",
    severity: "warning", sourceUrl: null, verifiedAt: null
  },
  {
    id: "together-brownout", appliesWhen: { always: true }, stage: "power", ladderStage: "together", input: "observe",
    why: "하나씩은 되는데 같이 켜면 꺼지는 경우가 많아요. 모터나 LED가 순간적으로 전류를 많이 써서 전압이 떨어지기 때문이에요.",
    symptom: "모두 함께 동작시켜도 보드가 꺼지거나 다시 시작하지 않는지 확인해요", cause: "모터·서보·LED 링이 움직이거나 켜지는 순간 전압이 떨어짐, USB 전원 부족",
    checkMethod: "모든 부품을 연결하고 실제로 쓰는 것처럼 2~3분 동작시켜요. 모터가 돌거나 LED가 밝게 켜지는 순간에 보드의 전원 표시등과 시리얼 모니터를 봐요.", meterMode: null, probePoints: "보드의 전원 표시등 · 시리얼 모니터",
    expectedRange: { kind: "boolean", expect: "꺼지거나 처음부터 다시 시작하지 않고 계속 동작해요" },
    ifNormal: "함께 동작해도 전원이 버텨요.", ifAbnormal: "어떤 부품이 움직이는 순간에 꺼지는지 알려주세요. 그 부품을 별도 전원에 잇고 GND만 공통으로 잇는 방법을 함께 볼게요.",
    severity: "warning", sourceUrl: null, verifiedAt: null
  },
  {
    id: "together-noise", appliesWhen: { always: true }, stage: "sensor", ladderStage: "together", input: "observe",
    why: "모터나 LED가 동작할 때 센서 값이 튀면, 완성품에서 엉뚱하게 반응해요.",
    symptom: "다른 부품이 동작할 때 센서 값이 튀지 않는지 확인해요", cause: "전원선을 함께 써서 잡음이 섞임, 신호선이 모터 선 옆을 지나감",
    checkMethod: "센서는 가만히 둔 채, 다른 부품(모터·LED·부저)을 켰다 껐다 하면서 시리얼 모니터의 센서 값을 봐요.", meterMode: null, probePoints: "시리얼 모니터의 센서 값",
    expectedRange: { kind: "boolean", expect: "다른 부품을 켜고 꺼도 센서 값이 크게 흔들리지 않아요" },
    ifNormal: "서로 방해하지 않아요.", ifAbnormal: "어떤 부품을 켤 때 값이 얼마나 튀는지 숫자와 함께 알려주세요.",
    severity: "info", sourceUrl: null, verifiedAt: null
  }
];

const boardOf = (components: CircuitComponent[]) => components.find((c) => findCard(c.catalogId)?.type === "board");

// Cards for one assembly step: by the parts it places or wires, plus board
// power/upload cards on the step that first places the board.
export function libraryCardsForStep(project: LocalProject, stepIndex: number): Array<LibraryCard & { libId: string; probe: string; resolvedRange: ExpectedRange | null; partRef: string | null }> {
  const guide = project.assembly;
  const components = project.build?.blueprint.components ?? [];
  if (!guide || !guide.steps[stepIndex]) return [];
  const step = guide.steps[stepIndex];
  const refs = new Set([...step.place, ...step.wires.flatMap((w) => [w.from.split(".")[0], w.to.split(".")[0]])]);
  const firstPlaced = (ref: string) => guide.steps.findIndex((s) => s.place.includes(ref));
  const catalogOf = (ref: string) => guide.parts.find((p) => p.ref === ref)?.catalogId ?? components.find((c) => c.ref === ref)?.catalogId;
  const board = boardOf(components);
  const boardRef = guide.parts.find((p) => p.ref === board?.ref)?.ref ?? board?.ref ?? null;
  const boardCard = findCard(board?.catalogId);
  const out: Array<LibraryCard & { libId: string; probe: string; resolvedRange: ExpectedRange | null; partRef: string | null }> = [];
  for (const card of TROUBLE_CARDS) {
    const w = card.appliesWhen;
    const boardStep = boardRef ? firstPlaced(boardRef) === stepIndex || (firstPlaced(boardRef) === -1 && stepIndex === 0) : false;
    let partRef: string | null = null;
    if (w.catalogIds) partRef = [...refs].find((ref) => w.catalogIds!.includes(catalogOf(ref) ?? "")) ?? null;
    const matches = w.catalogIds ? partRef != null
      : w.partTypes?.includes("board") ? boardStep && !!boardCard
      : w.boardHasPin ? boardStep && !!boardCard?.pins.some((p) => p.roles.includes(w.boardHasPin!))
      : w.boardLogic != null ? boardCard?.logicVoltage === w.boardLogic && step.wires.length > 0
      : false;
    if (!matches) continue;
    let resolvedRange = card.expectedRange;
    if (resolvedRange?.kind === "derived_resistance") {
      const value = parseOhms(components.find((c) => c.ref === partRef)?.valueOrModel ?? "");
      resolvedRange = value ? { kind: "number", min: Math.round(value * 0.95), max: Math.round(value * 1.05), unit: "Ω" } : null;
    }
    out.push({ ...card, libId: `lib:${card.id}`, partRef, resolvedRange, probe: card.probePoints.replace("{board}", boardRef ?? "보드").replace("{part}", partRef ?? "부품") });
  }
  return out;
}

export function parseOhms(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(k|K|M)?\s*(Ω|옴|ohm)/i);
  if (!m) return null;
  return Number(m[1]) * (m[2] === "M" ? 1_000_000 : m[2] ? 1000 : 1);
}

// Compares a reading with the card's sourced range.
export function judgeReading(range: ExpectedRange | null, value: number | null, yes: boolean | null): "normal" | "abnormal" | "unknown" {
  if (!range) return "unknown";
  if (range.kind === "boolean") return yes == null ? "unknown" : yes ? "normal" : "abnormal";
  if (range.kind !== "number" || value == null || !Number.isFinite(value)) return "unknown";
  if (range.min != null && value < range.min) return "abnormal";
  if (range.max != null && value > range.max) return "abnormal";
  return "normal";
}
