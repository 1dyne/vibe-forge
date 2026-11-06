// 응용해볼 만한 공개 메이커 프로젝트 목록.
// 저장소 존재는 2026-11-06에 git ls-remote로 확인했다. 별 수·라이선스·활동 여부는 확인하지 않았으므로 화면에 쓰지 않는다.
// tags는 capabilities.ts의 id이며, 저장소가 "기본으로 해내는 것"만 넣는다.

export type CatalogEntry = {
  repo: string;
  name: string;
  kind: "project" | "library";
  summary: string;
  tags: string[];
};

export const CATALOG_VERIFIED_AT = "2026-11-06";

export const CATALOG: CatalogEntry[] = [
  { repo: "esphome/esphome", name: "ESPHome", kind: "project", summary: "설정 파일만으로 ESP32 보드에 센서·LED·릴레이를 붙이고 스마트홈에 연결하는 펌웨어", tags: ["temp_humidity", "air_quality", "distance", "presence", "light_sense", "led", "display", "relay", "wifi", "smart_home", "logging"] },
  { repo: "Aircoookie/WLED", name: "WLED", kind: "project", summary: "주소 지정 LED 스트립을 와이파이와 폰으로 조종하는 조명 펌웨어", tags: ["led", "wifi", "phone", "smart_home"] },
  { repo: "arendst/Tasmota", name: "Tasmota", kind: "project", summary: "ESP 기반 스마트 플러그·스위치를 직접 제어하는 대체 펌웨어", tags: ["relay", "wifi", "smart_home", "temp_humidity", "logging"] },
  { repo: "meshtastic/firmware", name: "Meshtastic", kind: "project", summary: "통신망 없는 곳에서 LoRa로 메시지와 위치를 주고받는 휴대용 메시 무선기", tags: ["lora", "gps", "ble", "phone", "battery", "display", "buttons", "outdoor"] },
  { repo: "zmkfirmware/zmk", name: "ZMK", kind: "project", summary: "배터리로 오래 가는 블루투스 무선 키보드 펌웨어", tags: ["buttons", "ble", "battery", "display"] },
  { repo: "sqfmi/Watchy", name: "Watchy", kind: "project", summary: "ESP32와 전자잉크 화면으로 만든 오픈소스 손목시계", tags: ["display", "buttons", "motion", "vibration", "wifi", "ble", "battery", "wearable"] },
  { repo: "InfiniTimeOrg/InfiniTime", name: "InfiniTime", kind: "project", summary: "PineTime 스마트워치용 펌웨어 — 심박·걸음 수·폰 알림", tags: ["heart", "motion", "display", "vibration", "ble", "phone", "battery", "wearable", "buttons"] },
  { repo: "Open-Smartwatch/open-smartwatch-os", name: "Open-Smartwatch", kind: "project", summary: "ESP32로 직접 만드는 스마트워치 운영체제", tags: ["display", "motion", "buttons", "wifi", "ble", "battery", "wearable"] },
  { repo: "SlimeVR/SlimeVR-Tracker-ESP", name: "SlimeVR Tracker", kind: "project", summary: "몸 여러 곳에 붙인 IMU로 자세를 추적하는 웨어러블 트래커", tags: ["motion", "wifi", "battery", "wearable"] },
  { repo: "opendata-stuttgart/sensors-software", name: "Sensor.Community", kind: "project", summary: "미세먼지·온습도를 재서 인터넷 지도에 올리는 시민 측정소", tags: ["air_quality", "temp_humidity", "wifi", "logging", "outdoor"] },
  { repo: "airgradienthq/arduino", name: "AirGradient", kind: "project", summary: "미세먼지·CO2·온습도를 재서 화면에 보여주는 실내 공기질 측정기", tags: ["air_quality", "temp_humidity", "display", "led", "wifi", "logging"] },
  { repo: "Xinyuan-LilyGO/LilyGo-HiGrow", name: "LilyGo HiGrow", kind: "project", summary: "화분에 꽂아 흙 수분·밝기·온도를 재는 식물 모니터 보드", tags: ["soil", "light_sense", "temp_humidity", "wifi", "battery", "logging", "outdoor"] },
  { repo: "OttoDIY/OttoDIYLib", name: "Otto DIY", kind: "project", summary: "서보 모터로 걷고 춤추며 초음파로 장애물을 피하는 교육용 로봇", tags: ["motor", "distance", "sound_out", "robot", "battery"] },
  { repo: "ClemensElflein/OpenMower", name: "OpenMower", kind: "project", summary: "시판 로봇 잔디깎이를 정밀 GPS로 다시 만드는 오픈소스 개조", tags: ["motor", "gps", "robot", "outdoor", "battery", "wifi"] },
  { repo: "MagicMirrorOrg/MagicMirror", name: "MagicMirror²", kind: "project", summary: "라즈베리파이와 모니터로 거울 속에 날씨·일정을 띄우는 스마트 미러", tags: ["display", "wifi", "presence"] },
  { repo: "ThingPulse/esp8266-weather-station", name: "Weather Station", kind: "project", summary: "인터넷 날씨를 받아 작은 OLED 화면에 보여주는 탁상 날씨판", tags: ["display", "wifi", "temp_humidity"] },
  { repo: "blakeblackshear/frigate", name: "Frigate", kind: "project", summary: "카메라 영상에서 사람·차를 AI로 찾아 녹화·알림하는 홈 CCTV", tags: ["camera", "presence", "phone", "smart_home", "logging"] },
  { repo: "espressif/esp-who", name: "ESP-WHO", kind: "project", summary: "ESP32 카메라 보드에서 얼굴·사람을 인식하는 예제 모음", tags: ["camera", "presence", "wifi"] },
  { repo: "espressif/esp-skainet", name: "ESP-Skainet", kind: "project", summary: "ESP32에서 호출어와 음성 명령을 알아듣는 음성 인식", tags: ["voice", "sound_in", "wifi"] },
  { repo: "atomic14/esp32-walkie-talkie", name: "ESP32 Walkie-Talkie", kind: "project", summary: "마이크와 스피커를 붙여 ESP32끼리 말을 주고받는 무전기", tags: ["sound_in", "sound_out", "buttons", "wifi"] },
  { repo: "mysensors/MySensors", name: "MySensors", kind: "project", summary: "배터리로 오래 가는 작은 무선 센서들을 집안에 뿌리는 센서 네트워크", tags: ["temp_humidity", "presence", "relay", "battery", "smart_home", "logging"] },
  { repo: "sparkfun/OpenLog", name: "OpenLog", kind: "library", summary: "센서 값을 microSD 카드에 계속 기록하는 데이터 로거", tags: ["logging"] },
  { repo: "bogde/HX711", name: "HX711", kind: "library", summary: "로드셀로 무게를 재는 HX711 모듈용 라이브러리", tags: ["force"] },
  { repo: "sparkfun/SparkFun_MAX3010x_Sensor_Library", name: "MAX3010x", kind: "library", summary: "MAX30102 심박·산소포화도 센서 라이브러리", tags: ["heart"] },
  { repo: "ZinggJM/GxEPD2", name: "GxEPD2", kind: "library", summary: "전자잉크 화면을 그리는 라이브러리", tags: ["display"] },
  { repo: "pschatzmann/arduino-audio-tools", name: "Arduino Audio Tools", kind: "library", summary: "마이크 입력과 스피커 출력을 다루는 오디오 라이브러리", tags: ["sound_in", "sound_out"] },
  { repo: "espressif/esp32-camera", name: "esp32-camera", kind: "library", summary: "ESP32에 카메라 모듈을 연결하는 드라이버", tags: ["camera"] }
];
