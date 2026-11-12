// 보드별 업로드 안내 (명세서 2차 v0.1 §8). 정해진 데이터. 보드 매니저 주소는 각 공식 문서 기준.
export type UploadGuide = { boardName: string; package: string; managerUrl: string | null; select: string; port: string; errors: Array<{ symptom: string; fix: string }> };
const COMMON = [
  { symptom: "포트가 안 보여요", fix: "데이터용 USB 케이블인지 확인하고(충전 전용 케이블이 많아요) 다른 USB 포트에 꽂아요." },
  { symptom: "업로드가 시간 초과로 실패해요", fix: "시리얼 모니터를 닫고, 보드·포트 선택을 다시 확인한 뒤 재시도해요." }
];
export const UPLOAD_GUIDES: Record<string, UploadGuide> = {
  "arduino-uno-r3": { boardName: "Arduino UNO R3", package: "Arduino AVR Boards (기본 설치)", managerUrl: null, select: "도구 → 보드 → Arduino AVR Boards → Arduino Uno", port: "맥: /dev/cu.usbmodem… · 윈도: COM 번호", errors: [...COMMON, { symptom: "호환 보드에서 포트가 없어요", fix: "CH340 칩 호환 보드면 CH340 드라이버를 설치해요." }] },
  "arduino-nano": { boardName: "Arduino Nano", package: "Arduino AVR Boards (기본 설치)", managerUrl: null, select: "도구 → 보드 → Arduino Nano · 프로세서: ATmega328P (안 되면 Old Bootloader)", port: "맥: /dev/cu.usbserial… · 윈도: COM 번호", errors: [...COMMON, { symptom: "not in sync 오류", fix: "프로세서를 'ATmega328P (Old Bootloader)'로 바꿔요. 호환 보드는 CH340 드라이버도 확인해요." }] },
  "esp32-devkit-v1": { boardName: "ESP32 DevKit V1", package: "esp32 by Espressif Systems", managerUrl: "https://espressif.github.io/arduino-esp32/package_esp32_index.json", select: "도구 → 보드 → esp32 → ESP32 Dev Module", port: "맥: /dev/cu.usbserial… 또는 /dev/cu.SLAB… · 윈도: COM 번호", errors: [...COMMON, { symptom: "Connecting…… 에서 멈춰요", fix: "업로드가 시작될 때 보드의 BOOT 버튼을 누르고 있다가 'Writing'이 보이면 떼요." }, { symptom: "포트가 없어요", fix: "보드의 USB 칩(CP210x 또는 CH340)에 맞는 드라이버를 설치해요." }] },
  "xiao-esp32s3-sense": { boardName: "Seeed XIAO ESP32S3", package: "esp32 by Espressif Systems", managerUrl: "https://espressif.github.io/arduino-esp32/package_esp32_index.json", select: "도구 → 보드 → esp32 → XIAO_ESP32S3", port: "맥: /dev/cu.usbmodem… · 윈도: COM 번호", errors: [...COMMON, { symptom: "포트가 사라졌어요", fix: "BOOT 버튼을 누른 채 USB를 꽂아 다운로드 모드로 들어가요." }] },
  "raspberry-pi-pico": { boardName: "Raspberry Pi Pico", package: "Raspberry Pi Pico/RP2040 by Earle Philhower", managerUrl: "https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json", select: "도구 → 보드 → Raspberry Pi Pico/RP2040 → Raspberry Pi Pico", port: "처음엔 BOOTSEL을 누른 채 꽂으면 UF2 드라이브로 잡혀요", errors: [...COMMON, { symptom: "포트가 없어요", fix: "BOOTSEL 버튼을 누른 채 USB를 꽂고, 포트에서 'UF2 Board'를 골라 업로드해요." }] }
};
export function uploadGuideFor(catalogId: string | undefined): UploadGuide | null { return catalogId ? UPLOAD_GUIDES[catalogId] ?? null : null; }
