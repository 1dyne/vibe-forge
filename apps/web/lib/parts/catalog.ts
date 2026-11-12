import wokwi from "./wokwi-pins.json";

// Part cards: facts the rule engine and the assembly view rely on. A value we
// could not confirm against a source is null (shown as "확인 필요"), never a
// guess. Pin names/positions for Wokwi-rendered parts come from the
// @wokwi/elements sources (MIT); see THIRD_PARTY_NOTICES.md.

export type PinRole = "power_in" | "power_5v" | "power_3v3" | "ground" | "gpio" | "analog" | "pwm" | "i2c_sda" | "i2c_scl" | "spi" | "uart" | "signal" | "passive";
export type CardPin = { name: string; roles: PinRole[]; xMm: number | null; yMm: number | null };
export type PartCard = {
  id: string;
  model: string;
  aliases: string[];
  type: "board" | "display" | "sensor" | "actuator" | "input" | "indicator" | "passive" | "audio" | "power";
  boardCompatibility: string;
  voltageMin: number | null;
  voltageMax: number | null;
  logicVoltage: number | null;
  typicalCurrentMa: number | null;
  maxCurrentMa: number | null;
  interface: string[];
  i2cAddresses: string[];
  pins: CardPin[];
  dimensionsMm: [number, number, number | null] | null;
  renderer: { type: "wokwi"; ref: string } | { type: "fallback"; ref: null };
  warnings: string[];
  sourceUrls: string[];
  verifiedAt: string | null;
  // Boards only.
  board?: { platform: "arduino" | "micropython" | "linux"; ioRecommendedMa: number | null; ioAbsoluteMaxMa: number | null; rail3v3MaxMa: number | null; rail5vMaxMa: number | null; ioTolerates5V: boolean | null };
  // Passive parts that must sit in series with something (e.g. an LED).
  needsSeriesResistor?: boolean;
  isMotor?: boolean;
};

const VERIFIED = "2026-11-02";
type WokwiKey = keyof typeof wokwi;
function wokwiPins(key: WokwiKey, classify: (name: string, roles: string[]) => PinRole[]): CardPin[] {
  return wokwi[key].pins.map((pin) => ({ name: pin.name, xMm: pin.xMm, yMm: pin.yMm, roles: classify(pin.name, pin.roles) }));
}
const wokwiSize = (key: WokwiKey, depth: number | null): [number, number, number | null] => [wokwi[key].widthMm, wokwi[key].heightMm, depth];

function boardRoles(power5: string[], power3: string[], vin: string[]) {
  return (name: string, roles: string[]): PinRole[] => {
    if (/^GND/.test(name)) return ["ground"];
    if (power5.includes(name)) return ["power_5v"];
    if (power3.includes(name)) return ["power_3v3"];
    if (vin.includes(name)) return ["power_in"];
    const out: PinRole[] = ["gpio"];
    for (const role of roles) if (role === "analog" || role === "pwm" || role === "i2c_sda" || role === "i2c_scl" || role === "spi" || role === "uart") out.push(role);
    return out;
  };
}

// Two rows of 2.54 mm pitch headers along the long edges, for fallback boards.
function headerRows(left: string[], right: string[], width: number, top: number, roleOf: (name: string) => PinRole[]): CardPin[] {
  return [
    ...left.map((name, i) => ({ name, roles: roleOf(name), xMm: 1.3, yMm: Number((top + i * 2.54).toFixed(2)) })),
    ...right.map((name, i) => ({ name, roles: roleOf(name), xMm: Number((width - 1.3).toFixed(2)), yMm: Number((top + i * 2.54).toFixed(2)) }))
  ];
}

const xiaoRoles = (name: string): PinRole[] => name === "5V" ? ["power_5v"] : name === "3V3" ? ["power_3v3"] : name === "GND" ? ["ground"] : name === "D4" ? ["gpio", "i2c_sda"] : name === "D5" ? ["gpio", "i2c_scl"] : ["gpio"];
const picoRoles = (name: string): PinRole[] => {
  if (name === "GND") return ["ground"];
  if (name === "VBUS") return ["power_5v"];
  if (name === "VSYS") return ["power_in"];
  if (name === "3V3(OUT)") return ["power_3v3"];
  if (/^GP(26|27|28)$/.test(name)) return ["gpio", "analog", "pwm"];
  if (/^GP\d+$/.test(name)) return ["gpio", "pwm"];
  return ["signal"];
};
const two = (a: string, b: string): CardPin[] => [{ name: a, roles: ["passive"], xMm: null, yMm: null }, { name: b, roles: ["passive"], xMm: null, yMm: null }];

export const PART_CARDS: PartCard[] = [
  {
    id: "arduino-uno-r3", model: "Arduino UNO R3", aliases: ["UNO R3", "Arduino Uno", "아두이노 우노"], type: "board", boardCompatibility: "Arduino IDE · 입문 자료가 많음",
    voltageMin: 7, voltageMax: 12, logicVoltage: 5, typicalCurrentMa: null, maxCurrentMa: null, interface: ["GPIO", "I2C", "SPI", "UART", "USB-B"], i2cAddresses: [],
    pins: wokwiPins("arduino-uno", boardRoles(["5V"], ["3.3V"], ["VIN"])), dimensionsMm: [68.6, 53.4, null],
    renderer: { type: "wokwi", ref: "wokwi-arduino-uno" },
    warnings: ["voltageMin/Max는 DC 잭(VIN) 권장 입력 7~12V예요. USB로 쓰면 5V가 들어가요.", "I/O 핀당 권장 20mA, 40mA를 넘으면 칩이 손상될 수 있어요.", "UNO R3에는 무선이 없어요."],
    board: { platform: "arduino", ioRecommendedMa: 20, ioAbsoluteMaxMa: 40, rail3v3MaxMa: 50, rail5vMaxMa: null, ioTolerates5V: true },
    sourceUrls: ["https://store.arduino.cc/products/arduino-uno-rev3", "https://docs.arduino.cc/tutorials/uno-rev3/intro-to-board"], verifiedAt: VERIFIED
  },
  {
    id: "arduino-nano", model: "Arduino Nano", aliases: ["Nano", "아두이노 나노"], type: "board", boardCompatibility: "Arduino IDE · 브레드보드에 바로 꽂힘",
    voltageMin: null, voltageMax: null, logicVoltage: 5, typicalCurrentMa: null, maxCurrentMa: null, interface: ["GPIO", "I2C", "SPI", "UART"], i2cAddresses: [],
    pins: wokwiPins("arduino-nano", boardRoles(["5V"], ["3.3V"], ["VIN"])), dimensionsMm: wokwiSize("arduino-nano", null),
    renderer: { type: "wokwi", ref: "wokwi-arduino-nano" },
    warnings: ["입력 전압 범위와 핀당 전류는 이 카드에서 아직 확인하지 않았어요. 공식 문서로 확인하세요.", "호환 보드는 USB 칩(CH340 등)에 따라 드라이버가 필요할 수 있어요."],
    board: { platform: "arduino", ioRecommendedMa: null, ioAbsoluteMaxMa: null, rail3v3MaxMa: null, rail5vMaxMa: null, ioTolerates5V: true },
    sourceUrls: ["https://github.com/wokwi/wokwi-elements"], verifiedAt: null
  },
  {
    id: "esp32-devkit-v1", model: "ESP32 DevKit V1 (ESP32-WROOM-32)", aliases: ["ESP32 개발보드", "ESP32 DevKit", "DOIT ESP32"], type: "board", boardCompatibility: "Arduino IDE(ESP32 보드 패키지) · Wi-Fi·블루투스",
    voltageMin: null, voltageMax: null, logicVoltage: 3.3, typicalCurrentMa: null, maxCurrentMa: null, interface: ["GPIO", "I2C", "SPI", "UART", "Wi-Fi", "Bluetooth"], i2cAddresses: [],
    pins: wokwiPins("esp32-devkit-v1", boardRoles([], ["3V3"], ["VIN"])), dimensionsMm: wokwiSize("esp32-devkit-v1", null),
    renderer: { type: "wokwi", ref: "wokwi-esp32-devkit-v1" },
    warnings: ["GPIO는 3.3V예요. 5V 신호를 직접 넣으면 안 돼요(입력 상한 VDD+0.3V).", "개발보드마다 핀 배치가 달라요. 내 보드의 핀아웃을 꼭 확인하세요."],
    board: { platform: "arduino", ioRecommendedMa: null, ioAbsoluteMaxMa: null, rail3v3MaxMa: null, rail5vMaxMa: null, ioTolerates5V: false },
    sourceUrls: ["https://documentation.espressif.com/esp32_datasheet_en.pdf", "https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32_datasheet_en.pdf"], verifiedAt: VERIFIED
  },
  {
    id: "xiao-esp32s3-sense", model: "Seeed Studio XIAO ESP32S3 Sense", aliases: ["XIAO ESP32S3", "XIAO Sense"], type: "board", boardCompatibility: "Arduino IDE(ESP32 보드 패키지) · 카메라·마이크·microSD",
    voltageMin: 5, voltageMax: 5, logicVoltage: 3.3, typicalCurrentMa: null, maxCurrentMa: null, interface: ["GPIO", "I2C", "SPI", "UART", "Wi-Fi", "Bluetooth", "카메라", "USB-C"], i2cAddresses: [],
    pins: headerRows(["D0", "D1", "D2", "D3", "D4", "D5", "D6"], ["5V", "GND", "3V3", "D10", "D9", "D8", "D7"], 17.8, 3.3, xiaoRoles), dimensionsMm: [21, 17.8, 15],
    renderer: { type: "fallback", ref: null },
    warnings: ["USB-C 입력 5V, 3V3 핀은 보드 레귤레이터 출력이에요.", "Sense 확장보드를 끼우면 높이가 15mm가 돼요.", "핀 위치는 2.54mm 간격 헤더 기준의 대체 표시예요. 실물 핀아웃으로 확인하세요."],
    board: { platform: "arduino", ioRecommendedMa: null, ioAbsoluteMaxMa: null, rail3v3MaxMa: 700, rail5vMaxMa: null, ioTolerates5V: false },
    sourceUrls: ["https://wiki.seeedstudio.com/xiao_esp32s3_getting_started/", "https://files.seeedstudio.com/Bazaar/product_pdf/113991115.pdf"], verifiedAt: VERIFIED
  },
  {
    id: "raspberry-pi-pico", model: "Raspberry Pi Pico", aliases: ["Pico", "라즈베리파이 피코"], type: "board", boardCompatibility: "MicroPython 또는 Arduino IDE · 마이크로컨트롤러(리눅스 컴퓨터 아님)",
    voltageMin: 1.8, voltageMax: 5.5, logicVoltage: 3.3, typicalCurrentMa: null, maxCurrentMa: null, interface: ["GPIO", "I2C", "SPI", "UART", "USB"], i2cAddresses: [],
    pins: headerRows(["GP0", "GP1", "GND", "GP2", "GP3", "GP4", "GP5", "GND", "GP6", "GP7", "GP8", "GP9", "GND", "GP10", "GP11", "GP12", "GP13", "GND", "GP14", "GP15"], ["VBUS", "VSYS", "GND", "3V3_EN", "3V3(OUT)", "ADC_VREF", "GP28", "GND", "GP27", "GP26", "RUN", "GP22", "GND", "GP21", "GP20", "GP19", "GP18", "GND", "GP17", "GP16"], 21, 1.6, picoRoles), dimensionsMm: [21, 51, 1],
    renderer: { type: "fallback", ref: null },
    warnings: ["voltageMin/Max는 VSYS 입력 1.8~5.5V예요.", "GPIO는 3.3V 고정이고 5V를 견디지 못해요.", "핀 위치는 2.54mm 간격 헤더 기준의 대체 표시예요."],
    board: { platform: "micropython", ioRecommendedMa: null, ioAbsoluteMaxMa: null, rail3v3MaxMa: null, rail5vMaxMa: null, ioTolerates5V: false },
    sourceUrls: ["https://datasheets.raspberrypi.com/pico/pico-datasheet.pdf"], verifiedAt: VERIFIED
  },
  {
    id: "nucode-nu40-dk", model: "NUCODE NU40 DK (nRF52840)", aliases: ["NU40", "NU40-DK", "누코드 NU40"], type: "board", boardCompatibility: "Arduino IDE(누코드 보드 패키지) · BLE, 납땜 없이 시험",
    voltageMin: null, voltageMax: null, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: null, interface: ["GPIO", "I2C", "SPI", "UART", "BLE", "USB"], i2cAddresses: [],
    pins: [], dimensionsMm: null,
    renderer: { type: "fallback", ref: null },
    warnings: ["아두이노 UNO와 다른 보드예요. 버전별 보드 패키지를 누코드 위키에서 확인하세요.", "동작 전압·핀 배치·치수는 이 카드에서 아직 확인하지 않았어요."],
    board: { platform: "arduino", ioRecommendedMa: null, ioAbsoluteMaxMa: null, rail3v3MaxMa: null, rail5vMaxMa: null, ioTolerates5V: null },
    sourceUrls: ["https://nucode.gitbook.io/nuseries/ble-zigbee-thread-module-and-dk/nu40", "https://docs.zephyrproject.org/latest/boards/nucode/nucode_nu40/doc/index.html"], verifiedAt: null
  },
  {
    id: "seeed-round-display-xiao", model: "Seeed Studio Round Display for XIAO", aliases: ["Round Display", "원형 디스플레이"], type: "display", boardCompatibility: "XIAO 보드를 뒤에 끼우는 소켓형",
    voltageMin: null, voltageMax: null, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: null, interface: ["SPI", "I2C(터치)"], i2cAddresses: [],
    pins: [], dimensionsMm: null,
    renderer: { type: "fallback", ref: null },
    warnings: ["XIAO를 소켓에 끼워 연결해요. 배선이 따로 없어요.", "XIAO ESP32S3 Sense의 microSD와 함께 쓸 때 보드 수정(J3)이 필요하다는 사례가 있어요. 구매 전 공식 위키를 확인하세요.", "치수·전압은 이 카드에서 아직 확인하지 않았어요."],
    sourceUrls: ["https://wiki.seeedstudio.com/get_start_round_display/"], verifiedAt: null
  },
  {
    id: "led-5mm", model: "LED 5mm", aliases: ["LED", "발광 다이오드"], type: "indicator", boardCompatibility: "모든 보드 (직렬 저항 필요)",
    voltageMin: null, voltageMax: null, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: null, interface: [], i2cAddresses: [],
    pins: wokwiPins("led", (name) => name === "A" ? ["passive"] : ["passive"]), dimensionsMm: wokwiSize("led", null),
    renderer: { type: "wokwi", ref: "wokwi-led" }, needsSeriesResistor: true,
    warnings: ["다리가 긴 쪽이 A(+), 짧은 쪽이 C(-)예요.", "순방향 전압과 정격 전류는 색과 모델마다 달라요. 판매 페이지의 데이터시트를 확인하세요.", "반드시 저항과 직렬로 연결하세요."],
    sourceUrls: ["https://github.com/wokwi/wokwi-elements"], verifiedAt: null
  },
  {
    id: "resistor", model: "저항 (1/4W 탄소피막)", aliases: ["Resistor", "저항"], type: "passive", boardCompatibility: "모든 보드",
    voltageMin: null, voltageMax: null, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: null, interface: [], i2cAddresses: [],
    pins: wokwiPins("resistor", () => ["passive"]), dimensionsMm: wokwiSize("resistor", null),
    renderer: { type: "wokwi", ref: "wokwi-resistor" },
    warnings: ["저항값은 색띠로 읽어요. 헷갈리면 멀티미터 저항(Ω) 모드로 재보세요."],
    sourceUrls: ["https://github.com/wokwi/wokwi-elements"], verifiedAt: null
  },
  {
    id: "tact-switch-12mm", model: "택트 스위치 12mm", aliases: ["푸시 버튼", "Pushbutton", "택트 스위치"], type: "input", boardCompatibility: "모든 보드 (INPUT_PULLUP 권장)",
    voltageMin: null, voltageMax: null, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: null, interface: ["디지털 입력"], i2cAddresses: [],
    pins: wokwiPins("pushbutton", () => ["passive"]), dimensionsMm: wokwiSize("pushbutton", null),
    renderer: { type: "wokwi", ref: "wokwi-pushbutton" },
    warnings: ["다리 4개 중 마주 보는 두 쌍은 내부에서 이미 연결돼 있어요. 대각선 다리를 쓰면 확실해요."],
    sourceUrls: ["https://github.com/wokwi/wokwi-elements"], verifiedAt: null
  },
  {
    id: "sg90-servo", model: "TowerPro SG90 마이크로 서보", aliases: ["SG90", "서보", "9g 서보"], type: "actuator", boardCompatibility: "PWM 핀 · 별도 전원 권장",
    voltageMin: 4.8, voltageMax: 6, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: null, interface: ["PWM"], i2cAddresses: [],
    pins: wokwiPins("servo", (name) => name === "GND" ? ["ground"] : name === "V+" ? ["power_in"] : ["pwm"]), dimensionsMm: [22.2, 11.8, 31],
    renderer: { type: "wokwi", ref: "wokwi-servo" }, isMotor: true,
    warnings: ["모터는 움직일 때 전류가 순간적으로 커요. 보드의 5V 핀 대신 별도 5V 전원을 쓰고 GND를 보드와 공통으로 연결하세요.", "자료마다 동작 전압이 달라요(4.0~7.2V, 4.8~6V). 이 카드는 겹치는 4.8~6V를 기준으로 해요.", "정격·정지 전류는 이 카드에서 확인하지 않았어요."],
    sourceUrls: ["https://datasheetspdf.com/pdf/791970/TowerPro/SG90/1", "https://bit.nkust.edu.tw/~csshieh/teach/111A/mc/datasheet/SG90.pdf"], verifiedAt: VERIFIED
  },
  {
    id: "ssd1306-oled-128x64", model: "SSD1306 0.96\" OLED 128×64", aliases: ["OLED", "SSD1306", "0.96 OLED"], type: "display", boardCompatibility: "I2C (주소 0x3C 또는 0x3D)",
    voltageMin: null, voltageMax: null, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: null, interface: ["I2C"], i2cAddresses: ["0x3C", "0x3D"],
    pins: wokwiPins("ssd1306", (name) => name === "GND" ? ["ground"] : name === "VIN" ? ["power_in"] : name === "3V3" ? ["power_3v3"] : name === "DATA" ? ["i2c_sda"] : name === "CLK" ? ["i2c_scl"] : ["signal"]), dimensionsMm: wokwiSize("ssd1306", null),
    renderer: { type: "wokwi", ref: "wokwi-ssd1306" },
    warnings: ["주소는 모듈의 SA0 설정으로 0x3C/0x3D가 정해져요. 화면이 안 나오면 I2C 스캐너로 확인하세요.", "모듈마다 핀 이름과 개수가 달라요(흔한 4핀: GND·VCC·SCL·SDA). 표시는 Wokwi 8핀 모듈 기준이에요.", "동작 전압은 모듈마다 달라요. 판매 페이지에서 확인하세요."],
    sourceUrls: ["https://wiki.elegoo.com/oshw-getting-started-&-kits/oled", "https://docs.nanoframework.net/devicesdetails/Ssd13xx/README.html"], verifiedAt: VERIFIED
  },
  {
    id: "fsr-402", model: "Interlink FSR 402 압력 센서", aliases: ["FSR", "FSR402", "압력 센서"], type: "sensor", boardCompatibility: "아날로그 핀 · 고정 저항과 분압 회로",
    voltageMin: null, voltageMax: null, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: null, interface: ["아날로그 입력(분압)"], i2cAddresses: [],
    pins: two("1", "2"), dimensionsMm: null,
    renderer: { type: "fallback", ref: null },
    warnings: ["누르지 않으면 저항이 10MΩ보다 커요. 고정 저항과 분압 회로로 아날로그 핀에 연결해요.", "단자에 직접 납땜하면 열로 손상될 수 있어요. 커넥터나 클립을 쓰세요(모델별 통합 가이드 확인).", "활성 영역 지름은 버전마다 달라요(Ø12.7mm, 구형 Ø14.68mm)."],
    sourceUrls: ["https://interlinkelectronics.com/fsr-x-400", "https://pololu.com/file/0J749/FSR400-Series-Integration-Guide-13.pdf"], verifiedAt: VERIFIED
  },
  {
    id: "active-buzzer", model: "능동 부저", aliases: ["부저", "Buzzer", "액티브 부저"], type: "audio", boardCompatibility: "디지털 출력",
    voltageMin: null, voltageMax: null, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: null, interface: ["디지털 출력"], i2cAddresses: [],
    pins: wokwiPins("buzzer", () => ["passive"]), dimensionsMm: wokwiSize("buzzer", null),
    renderer: { type: "wokwi", ref: "wokwi-buzzer" },
    warnings: ["능동/수동 부저를 구분하세요. 능동 부저는 전원만 주면 울려요.", "동작 전압과 전류는 모델마다 달라요. 핀 직결 전에 판매 페이지에서 확인하세요."],
    sourceUrls: ["https://github.com/wokwi/wokwi-elements"], verifiedAt: null
  },
  {
    id: "potentiometer-10k", model: "가변저항 10kΩ", aliases: ["포텐셔미터", "Potentiometer", "가변저항"], type: "input", boardCompatibility: "아날로그 핀",
    voltageMin: null, voltageMax: null, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: null, interface: ["아날로그 입력"], i2cAddresses: [],
    pins: wokwiPins("potentiometer", (name) => name === "GND" ? ["ground"] : name === "VCC" ? ["power_in"] : ["analog"]), dimensionsMm: wokwiSize("potentiometer", null),
    renderer: { type: "wokwi", ref: "wokwi-potentiometer" },
    warnings: ["VCC는 보드의 로직 전압(5V 보드는 5V, 3.3V 보드는 3.3V)에 연결하세요."],
    sourceUrls: ["https://github.com/wokwi/wokwi-elements"], verifiedAt: null
  }
];


// 2차 v0.1 §9 추가 카드: 웹 검색 결과 요약으로만 확인했다(데이터시트 페이지를 직접 열지 못함).
// 그래서 verifiedAt은 null이고, 핀 위치(xMm/yMm)는 확인 전까지 null이다. 값이 자료마다 다르면 겹치는 범위만 쓴다.
const SNIPPET = "값은 검색 결과 요약 기준(2026-11-11)이에요. 구매 전 판매 페이지의 데이터시트로 확인하세요.";
const named = (names: Array<[string, PinRole[]]>): CardPin[] => names.map(([name, roles]) => ({ name, roles, xMm: null, yMm: null }));
const NEW_CARDS: PartCard[] = [
  {
    id: "tp4056-protected", model: "TP4056 1셀 리튬 충전 모듈 (보호회로형)", aliases: ["TP4056", "충전 모듈", "리튬 충전 보드", "DW01A"], type: "power", boardCompatibility: "USB 5V 입력 · 1셀(3.7V) 리튬 전지 충전",
    voltageMin: 4.25, voltageMax: 6.5, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: 1000, interface: ["전원"], i2cAddresses: [],
    pins: named([["IN+", ["power_in"]], ["IN-", ["ground"]], ["B+", ["passive"]], ["B-", ["ground"]], ["OUT+", ["passive"]], ["OUT-", ["ground"]]]), dimensionsMm: null,
    renderer: { type: "fallback", ref: null },
    warnings: ["B+/B-는 전지에만, OUT+/OUT-는 회로(부하)에만 연결해요. 전지를 OUT에 물리면 보호회로를 거치지 않아요.", "충전 전류는 RPROG 저항으로 정해져요(1.2kΩ ≈ 1A가 흔한 기본값). 작은 LiPo(예: 500mAh, 권장 충전 150mA 이하)는 저항을 바꿔 전류를 낮춰야 해요.", "입력 전압 범위는 데이터시트마다 달라요(4.0~8.0V, 4.25~6.5V). 겹치는 4.25~6.5V를 기준으로 해요.", "보호형(DW01A·8205A가 있는 판)인지 사진으로 확인하세요. 칩만 있는 판은 과방전 보호가 없어요.", SNIPPET],
    sourceUrls: ["https://datasheet.lcsc.com/lcsc/2311091738_UMW-Youtai-Semiconductor-Co---Ltd--TP4056_C725790.pdf", "https://www.mikrocontroller.net/attachment/273612/TP4056.pdf"], verifiedAt: null
  },
  {
    id: "mt3608-boost", model: "MT3608 승압(부스트) 모듈", aliases: ["MT3608", "승압 모듈", "부스트 컨버터", "DC-DC 승압"], type: "power", boardCompatibility: "3.7V 전지 → 5V 등으로 올리기 · 출력 가변",
    voltageMin: 2, voltageMax: 24, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: null, interface: ["전원"], i2cAddresses: [],
    pins: named([["VIN+", ["power_in"]], ["VIN-", ["ground"]], ["VOUT+", ["passive"]], ["VOUT-", ["ground"]]]), dimensionsMm: null,
    renderer: { type: "fallback", ref: null },
    warnings: ["부하를 연결하기 전에 멀티미터를 보며 가변저항으로 출력 전압을 먼저 맞춰요. 처음 출력이 높게 나올 수 있어요.", "칩 스위치 전류 한계(약 2~4A로 자료마다 다름)는 출력 전류가 아니에요. 승압 비율이 클수록 실제로 뽑을 수 있는 전류는 훨씬 작아요.", "출력은 최대 28V까지 올라가요. 5V 회로에 물리기 전에 꼭 재요.", SNIPPET],
    sourceUrls: ["https://www.radiolocman.com/datasheet/pdf.html?di=177837", "https://components101.com/node/1495"], verifiedAt: null
  },
  {
    id: "ams1117-3v3", model: "AMS1117-3.3 레귤레이터 모듈", aliases: ["AMS1117", "3.3V 레귤레이터", "LDO 3.3V"], type: "power", boardCompatibility: "5V → 3.3V 내리기 (리튬 1셀에서는 부족)",
    voltageMin: 4.6, voltageMax: 12, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: 800, interface: ["전원"], i2cAddresses: [],
    pins: named([["VIN", ["power_in"]], ["GND", ["ground"]], ["VOUT", ["power_3v3"]]]), dimensionsMm: null,
    renderer: { type: "fallback", ref: null },
    warnings: ["드롭아웃이 커요(최대 약 1.3V). 3.7V 리튬 전지로는 3.3V가 안정적으로 안 나와요. 입력은 약 4.6V 이상이 필요해요.", "남는 전압은 열로 버려져요. (입력−3.3V)×전류가 크면 뜨거워져요.", "최대 입력 전압과 전류는 제조사(복제품)마다 달라요(800mA~1A, 12~20V). 낮은 쪽을 기준으로 해요.", SNIPPET],
    sourceUrls: ["https://files.waveshare.com/upload/b/b8/AMS1117-datasheet.pdf", "https://www.radiolocman.com/datasheet/pdf.html?di=102481"], verifiedAt: null
  },
  {
    id: "holder-18650", model: "18650 전지 홀더 (1개, 전선형)", aliases: ["18650 홀더", "18650 케이스", "배터리 홀더"], type: "power", boardCompatibility: "18650 리튬 전지 1개 · 보호회로 없음",
    voltageMin: null, voltageMax: null, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: null, interface: ["전원"], i2cAddresses: [],
    pins: named([["+", ["passive"]], ["-", ["ground"]]]), dimensionsMm: null,
    renderer: { type: "fallback", ref: null },
    warnings: ["홀더에는 보호회로가 없어요. 보호회로가 있는 전지를 쓰거나 TP4056 보호형 모듈을 거쳐요.", "극성(+/−)을 홀더 표시와 전선 색으로 두 번 확인해요. 거꾸로 넣으면 회로가 망가질 수 있어요.", "홀더 치수·허용 전류는 제품마다 달라요. 판매 페이지에서 확인하세요.", SNIPPET],
    sourceUrls: [], verifiedAt: null
  },
  {
    id: "lipo-1s-jstph", model: "LiPo 1셀 3.7V 전지 (JST-PH 2핀)", aliases: ["LiPo", "리튬폴리머", "3.7V 배터리", "JST-PH 배터리"], type: "power", boardCompatibility: "1셀 충전 모듈(TP4056 등)과 함께",
    voltageMin: 3.0, voltageMax: 4.2, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: null, interface: ["전원"], i2cAddresses: [],
    pins: named([["+", ["passive"]], ["-", ["ground"]]]), dimensionsMm: null,
    renderer: { type: "fallback", ref: null },
    warnings: ["JST-PH 커넥터의 +/− 배선이 제조사마다 반대일 수 있어요. 꽂기 전에 빨간 선 위치를 보드 표시와 맞춰요.", "충전은 CC/CV 리튬 충전기로만. 작은 용량(예: 500mAh)은 충전 전류를 낮게(예: 150mA 이하) 해요.", "부풀거나 찍히거나 뜨거운 전지는 쓰지 말고, 충전 중에는 자리를 비우지 않아요.", "용량·크기·보호회로 유무는 제품마다 달라요(예: 500mAh 약 29×36×4.75mm).", SNIPPET],
    sourceUrls: ["https://www.adafruit.com/product/1578"], verifiedAt: null
  },
  {
    id: "slide-switch-spdt", model: "슬라이드 스위치 SPDT (SS12D00형)", aliases: ["슬라이드 스위치", "전원 스위치", "SS12D00", "SPDT"], type: "input", boardCompatibility: "전원 켜고 끄기 · 3핀",
    voltageMin: null, voltageMax: 50, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: 500, interface: ["스위치"], i2cAddresses: [],
    pins: named([["1", ["passive"]], ["COM", ["passive"]], ["2", ["passive"]]]), dimensionsMm: null,
    renderer: { type: "fallback", ref: null },
    warnings: ["가운데 핀(COM)이 공통이에요. 레버 위치에 따라 COM이 양 끝 핀 중 하나와 이어져요.", "정격은 DC 50V 0.5A예요. 모터처럼 큰 전류는 이 스위치로 직접 끊지 말아요.", "핀 간격이 2.54mm가 아닌 비슷한 제품(3.0mm)도 있어요. 브레드보드·기판에 맞는지 확인하세요.", SNIPPET],
    sourceUrls: ["https://akizukidenshi.com/goodsaffix/SS-12D00-G5_spec.pdf"], verifiedAt: null
  },
  {
    id: "hc-sr04", model: "HC-SR04 초음파 거리 센서", aliases: ["HC-SR04", "초음파 센서", "거리 센서"], type: "sensor", boardCompatibility: "5V 보드 · 3.3V 보드는 Echo 분압 필요",
    voltageMin: 4.5, voltageMax: 5.5, logicVoltage: 5, typicalCurrentMa: 15, maxCurrentMa: 20, interface: ["디지털(Trig 펄스·Echo 펄스)"], i2cAddresses: [],
    pins: named([["VCC", ["power_in"]], ["Trig", ["gpio"]], ["Echo", ["gpio"]], ["GND", ["ground"]]]), dimensionsMm: [45, 20, 15],
    renderer: { type: "fallback", ref: null },
    warnings: ["5V로 쓰면 Echo가 5V 신호예요. ESP32·Pico 같은 3.3V 보드에는 분압 저항(예: 1k/2k)을 거쳐 연결해요.", "측정 범위는 약 2cm~4m, Trig에 10µs 펄스를 줘요.", "3.3V에서 동작하는 신형·변형 모듈도 있어요. 판매 페이지에서 동작 전압을 확인하세요.", SNIPPET],
    sourceUrls: ["https://www.radiolocman.com/datasheet/pdf.html?di=168043", "https://web.eece.maine.edu/~zhu/book/lab/HC-SR04%20User%20Manual.pdf"], verifiedAt: null
  },
  {
    id: "aht20-module", model: "AHT20 온습도 센서 모듈 (I2C)", aliases: ["AHT20", "온습도 센서", "습도 센서"], type: "sensor", boardCompatibility: "I2C · 3.3V/5V 모듈(제품에 따라)",
    voltageMin: 3.3, voltageMax: 5, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: null, interface: ["I2C"], i2cAddresses: ["0x38"],
    pins: named([["VIN", ["power_in"]], ["GND", ["ground"]], ["SCL", ["i2c_scl"]], ["SDA", ["i2c_sda"]]]), dimensionsMm: null,
    renderer: { type: "fallback", ref: null },
    warnings: ["I2C 주소가 0x38로 고정이라 한 버스에 하나만 쓸 수 있어요.", "3.3V/5V 겸용은 레귤레이터·레벨시프터가 있는 모듈(예: Adafruit 4566)이에요. 칩만 있는 모듈은 판매 페이지에서 전압을 확인하세요.", SNIPPET],
    sourceUrls: ["https://www.adafruit.com/product/4566"], verifiedAt: null
  },
  {
    id: "mpu6050-gy521", model: "MPU-6050 가속도·자이로 모듈 (GY-521)", aliases: ["MPU6050", "GY-521", "자이로 센서", "가속도 센서", "IMU"], type: "sensor", boardCompatibility: "I2C · 주소 0x68/0x69",
    voltageMin: null, voltageMax: null, logicVoltage: null, typicalCurrentMa: 3.9, maxCurrentMa: null, interface: ["I2C"], i2cAddresses: ["0x68", "0x69"],
    pins: named([["VCC", ["power_in"]], ["GND", ["ground"]], ["SCL", ["i2c_scl"]], ["SDA", ["i2c_sda"]], ["XDA", ["signal"]], ["XCL", ["signal"]], ["AD0", ["signal"]], ["INT", ["signal"]]]), dimensionsMm: null,
    renderer: { type: "fallback", ref: null },
    warnings: ["칩(MPU-6050) 자체는 2.375~3.46V예요. GY-521 모듈의 레귤레이터가 있어야 5V를 받을 수 있으니 모듈 사진으로 확인하세요.", "AD0를 GND에 두면 0x68, 3.3V에 두면 0x69예요.", "전류 3.9mA는 6축과 DMP를 모두 켰을 때의 칩 기준이에요.", SNIPPET],
    sourceUrls: ["https://invensense.tdk.com/?p=559"], verifiedAt: null
  },
  {
    id: "inmp441-i2s-mic", model: "INMP441 I2S 디지털 마이크 모듈", aliases: ["INMP441", "I2S 마이크", "MEMS 마이크"], type: "audio", boardCompatibility: "I2S 지원 보드(ESP32 등) · 3.3V 전용",
    voltageMin: 1.8, voltageMax: 3.3, logicVoltage: 3.3, typicalCurrentMa: 1.4, maxCurrentMa: null, interface: ["I2S"], i2cAddresses: [],
    pins: named([["VDD", ["power_3v3"]], ["GND", ["ground"]], ["SCK", ["signal"]], ["WS", ["signal"]], ["SD", ["signal"]], ["L/R", ["signal"]]]), dimensionsMm: null,
    renderer: { type: "fallback", ref: null },
    warnings: ["3.3V까지만 받아요. 5V에 연결하면 망가져요.", "I2S 입력이 있는 보드(ESP32 등)가 필요해요. 아두이노 UNO에서는 쓸 수 없어요.", "L/R 핀으로 왼쪽/오른쪽 채널을 정해요(GND 또는 VDD). 띄워 두지 말아요.", SNIPPET],
    sourceUrls: ["https://invensense.tdk.com/digital/inmp441"], verifiedAt: null
  },
  {
    id: "ws2812b-ring-12", model: "WS2812B 주소지정 LED 링 (12구)", aliases: ["WS2812B", "네오픽셀", "NeoPixel 링", "LED 링", "RGB LED 링"], type: "indicator", boardCompatibility: "디지털 출력 1개 · 5V 전원",
    voltageMin: null, voltageMax: null, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: 720, interface: ["단선 디지털(DIN)"], i2cAddresses: [],
    pins: named([["5V", ["power_in"]], ["GND", ["ground"]], ["DIN", ["gpio"]], ["DOUT", ["signal"]]]), dimensionsMm: null,
    renderer: { type: "fallback", ref: null },
    warnings: ["LED 하나가 흰색 최대 밝기에서 약 60mA예요(12구 = 약 720mA). 평소엔 LED당 약 20mA로 잡지만, 전원은 최대를 기준으로 준비해요.", "+와 − 사이에 500~1000µF(6.3V 이상) 콘덴서, DIN 앞에 300~500Ω 저항을 넣어요.", "3.3V 보드의 신호는 5V 전원 LED에서 불안정할 수 있어요. 안 되면 레벨시프터를 써요.", SNIPPET],
    sourceUrls: ["https://www.adafruit.com/product/1643", "https://learn.adafruit.com/adafruit-neopixel-uberguide/powering-neopixels"], verifiedAt: null
  },
  {
    id: "drv8833-driver", model: "DRV8833 2채널 모터 드라이버 모듈", aliases: ["DRV8833", "모터 드라이버", "N20 모터 드라이버"], type: "actuator", boardCompatibility: "작은 DC 모터 2개(N20 등) · 로직 2.7V 이상",
    voltageMin: 2.7, voltageMax: 10.8, logicVoltage: null, typicalCurrentMa: null, maxCurrentMa: 1200, interface: ["PWM", "디지털 출력"], i2cAddresses: [],
    pins: named([["VM", ["power_in"]], ["GND", ["ground"]], ["AIN1", ["pwm"]], ["AIN2", ["pwm"]], ["BIN1", ["pwm"]], ["BIN2", ["pwm"]], ["AOUT1", ["signal"]], ["AOUT2", ["signal"]], ["BOUT1", ["signal"]], ["BOUT2", ["signal"]], ["SLP", ["gpio"]]]), dimensionsMm: null,
    renderer: { type: "fallback", ref: null }, isMotor: true,
    warnings: ["모터 전원 VM은 10.8V를 넘기지 않아요.", "채널당 연속 1.2A로 설계해요. 2A는 짧은 순간 최대값이에요.", "흔한 빨간 복제 보드는 전류 제한 저항이 없을 수 있어요. 모터가 멈춰 있을 때 전류가 크게 흘러요.", "SLP(슬립)를 HIGH로 둬야 동작하는 보드가 있어요. 모듈 표시를 확인하세요.", SNIPPET],
    sourceUrls: ["https://www.adafruit.com/product/3297", "https://learn.adafruit.com/adafruit-drv8833-dc-stepper-motor-driver-breakout-board/overview"], verifiedAt: null
  }
];
PART_CARDS.push(...NEW_CARDS);

export function findCard(id: string | undefined | null): PartCard | null {
  return id ? PART_CARDS.find((card) => card.id === id) ?? null : null;
}

export function cardSummary(card: PartCard) {
  const v = (value: number | null, unit: string) => value == null ? "확인 필요" : `${value}${unit}`;
  return {
    id: card.id, model: card.model, type: card.type, boardCompatibility: card.boardCompatibility,
    voltage: card.voltageMin == null && card.voltageMax == null ? "확인 필요" : `${v(card.voltageMin, "V")}~${v(card.voltageMax, "V")}`,
    logicVoltage: v(card.logicVoltage, "V"), interface: card.interface, i2cAddresses: card.i2cAddresses,
    pins: card.pins.map((pin) => `${pin.name}(${pin.roles.join("/")})`), dimensionsMm: card.dimensionsMm,
    renderer: card.renderer.type === "wokwi" ? "실제 모양" : "대체 표시", warnings: card.warnings, sourceUrls: card.sourceUrls, verifiedAt: card.verifiedAt
  };
}
