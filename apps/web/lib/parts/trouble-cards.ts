import type { CircuitComponent, LocalProject } from "../project-types";
import { findCard, type PartCard } from "./catalog";

// Problem cards picked by condition, not written per step by the model. Each
// normal range carries its source; a check without a sourced range says so
// and asks the person to report what they saw.

export type ExpectedRange =
  | { kind: "number"; min: number | null; max: number | null; unit: string }
  | { kind: "boolean"; expect: string }
  | { kind: "derived_resistance" };
export type LibraryCard = {
  id: string;
  appliesWhen: { catalogIds?: string[]; partTypes?: PartCard["type"][]; boardHasPin?: "power_5v" | "power_3v3"; boardLogic?: number };
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
