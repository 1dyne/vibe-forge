// 아이디어 문장에서 "무엇을 감지하고, 무엇으로 반응하고, 어떻게 연결·전원·형태를 갖는지"를 뽑는 사전.
// 키워드는 소문자 부분 문자열로 비교한다. 오탐보다 누락이 덜 위험하므로 짧고 흔한 단어는 피한다.

export type CapabilityGroup = "sense" | "act" | "link" | "power" | "form";

export type Capability = {
  id: string;
  label: string;
  group: CapabilityGroup;
  keywords: string[];
  /** 기존 프로젝트에 이 기능이 없을 때 "더 해야 하는 설계"로 보여줄 문장. 흔히 쓰는 모듈 이름만 예시로 든다. */
  design: string;
};

export const CAPABILITIES: Capability[] = [
  // 감지
  { id: "temp_humidity", label: "온습도 감지", group: "sense", keywords: ["온도", "습도", "온습도", "temperature", "humid", "결로", "더우면", "추우면"], design: "온습도 센서 모듈(SHT31·BME280 등)을 I2C로 연결하고, 측정 주기와 허용 오차를 정해야 해요." },
  { id: "air_quality", label: "공기질 감지", group: "sense", keywords: ["미세먼지", "공기질", "공기 질", "이산화탄소", "co2", "환기", "pm2.5", "먼지", "가스"], design: "미세먼지(PMS7003 등)·CO2(SCD40 등) 센서는 공기가 드나드는 통풍 구조가 필요해서 케이스 설계가 같이 바뀌어요." },
  { id: "distance", label: "거리·접근 감지", group: "sense", keywords: ["거리", "초음파", "가까이", "다가오", "접근", "장애물", "주차", "distance", "라이다"], design: "거리 센서(초음파 HC-SR04, ToF VL53L0X 등)는 감지 범위·각도를 먼저 정하고 센서 창 위치를 케이스에 반영해야 해요." },
  { id: "presence", label: "사람 감지", group: "sense", keywords: ["사람 감지", "사람이 오", "사람이 있", "인체 감지", "재실", "pir", "지나가면", "들어오면", "인기척"], design: "사람 감지는 PIR(움직임) 또는 mmWave 레이더(가만히 있어도 감지) 중 무엇이 필요한지 먼저 골라야 해요." },
  { id: "motion", label: "움직임·자세 감지", group: "sense", keywords: ["움직임", "자세", "기울기", "걸음", "넘어지", "낙상", "흔들", "가속도", "자이로", "imu", "모션", "스쿼트", "운동 횟수", "동작 인식"], design: "IMU(MPU6050·BMI270 등)로 움직임을 읽고, 어떤 동작을 몇 번·얼마나 정확히 셀지 기준을 정해야 해요." },
  { id: "sound_in", label: "소리·음성 입력", group: "sense", keywords: ["소음", "소리를 감지", "소리가 나면", "마이크", "박수", "목소리", "시끄러", "데시벨", "녹음"], design: "디지털 마이크(INMP441 등)를 붙이고, 소리 크기만 볼지 음성까지 알아들을지에 따라 보드 성능이 달라져요." },
  { id: "light_sense", label: "밝기 감지", group: "sense", keywords: ["조도", "밝기를 감지", "햇빛", "어두워지면", "밝아지면", "빛을 감지"], design: "조도 센서(BH1750 등)를 바깥 빛이 닿는 위치에 두고, 켜지고 꺼지는 기준 밝기를 정해야 해요." },
  { id: "camera", label: "카메라·영상 인식", group: "sense", keywords: ["카메라", "사진", "영상", "촬영", "얼굴", "cctv", "비전", "이미지 인식", "물체 인식"], design: "카메라(ESP32-CAM·OV2640 등)는 전력 소모가 커서, 상시 촬영인지 이벤트 촬영인지에 따라 전원 설계가 달라져요." },
  { id: "color_sense", label: "색 감지", group: "sense", keywords: ["색을 저장", "색을 읽", "색깔을 읽", "색상 인식", "컬러 수집", "색 감지", "색깔 감지", "색을 인식"], design: "컬러 센서(TCS34725 등)는 주변광을 막는 덮개와 내장 LED 조명 거리가 정확도를 좌우해요." },
  { id: "soil", label: "흙 수분 감지", group: "sense", keywords: ["화분", "식물", "흙", "토양", "수분"], design: "정전식 토양 수분 센서를 쓰고(저항식은 부식돼요), 물을 줄 기준값을 실제 화분에서 재봐야 해요." },
  { id: "force", label: "무게·압력 감지", group: "sense", keywords: ["무게", "체중", "저울", "압력", "누르는 힘", "하중", "깔창", "인솔", "발바닥"], design: "무게는 로드셀+HX711, 얇은 압력 분포는 FSR 센서가 맞아요. 센서를 어디에 몇 개 둘지 배치도가 먼저예요." },
  { id: "heart", label: "심박·생체 신호", group: "sense", keywords: ["심박", "맥박", "산소포화도", "심장", "spo2"], design: "심박 센서(MAX30102 등)는 피부 밀착이 중요해서 착용 구조와 함께 설계해야 하고, 의료 용도로 쓰면 안 돼요." },
  { id: "gps", label: "위치(GPS)", group: "sense", keywords: ["gps", "위치 추적", "위치를", "경로", "분실", "어디 있는지"], design: "GPS 모듈(NEO-6M 등)은 하늘이 보여야 잡히고 전력을 많이 써서, 위치를 얼마나 자주 기록할지 정해야 해요." },
  { id: "buttons", label: "버튼·입력", group: "sense", keywords: ["버튼", "키보드", "리모컨", "누르면", "다이얼", "스위치를 누르"], design: "버튼 개수와 배치, 길게/짧게 누르기 같은 입력 규칙을 정하고 손가락이 닿는 위치를 목업으로 확인해야 해요." },
  // 반응
  { id: "led", label: "불빛(LED)", group: "act", keywords: ["led", "불빛", "조명", "무드등", "램프", "불이 켜", "신호등", "깜빡", "빛나", "라이트"], design: "주소 지정 LED(WS2812B 등)는 개수에 따라 전류가 커지니, LED 수와 최대 밝기로 전원 용량을 계산해야 해요." },
  { id: "display", label: "화면 표시", group: "act", keywords: ["화면", "디스플레이", "표시", "보여주", "시계", "전자잉크", "e-ink", "epaper", "oled", "lcd"], design: "항상 켜둘 정보면 전자잉크, 자주 바뀌면 OLED/LCD가 맞아요. 화면 크기가 케이스 크기를 정해요." },
  { id: "motor", label: "모터·움직임", group: "act", keywords: ["모터", "회전", "움직이는", "로봇", "바퀴", "서보", "열고 닫", "자동문", "커튼", "블라인드", "급식", "먹이"], design: "모터는 보드 핀에 바로 연결하면 안 되고 드라이버(서보는 별도 전원, DC 모터는 모터 드라이버)가 필요해요. 필요한 힘(토크)부터 정해요." },
  { id: "pump", label: "물 공급(펌프)", group: "act", keywords: ["펌프", "물을 주", "급수", "물주기", "분무"], design: "소형 펌프는 MOSFET/릴레이로 켜고 끄며, 물이 전자부품에 닿지 않도록 물길과 회로를 분리해야 해요." },
  { id: "sound_out", label: "소리 출력", group: "act", keywords: ["스피커", "소리를 내", "알람", "부저", "경고음", "음악", "재생", "말해주", "음성 안내"], design: "단순 알림음은 부저, 음성·음악은 I2S 앰프(MAX98357A 등)+스피커가 필요하고 스피커 구멍을 케이스에 내야 해요." },
  { id: "vibration", label: "진동 알림", group: "act", keywords: ["진동으로", "진동 알림", "햅틱", "진동이 울"], design: "진동 모터는 트랜지스터로 구동하고, 몸에 닿는 위치에 둬야 잘 느껴져요." },
  { id: "relay", label: "가전 전원 제어", group: "act", keywords: ["전원을 켜", "전원을 끄", "플러그", "콘센트", "가전", "릴레이", "히터", "선풍기", "전등 스위치"], design: "220V를 직접 배선하는 건 위험해요. 처음에는 인증된 스마트 플러그를 무선으로 제어하는 방식을 권해요." },
  // 연결·데이터
  { id: "wifi", label: "와이파이·원격", group: "link", keywords: ["와이파이", "wifi", "wi-fi", "인터넷", "원격", "밖에서도", "서버로"], design: "와이파이는 ESP32 계열 보드로 해결되지만 전력을 많이 써서, 배터리라면 잠깐 깨어나 보내고 다시 자는 구조가 필요해요." },
  { id: "ble", label: "블루투스", group: "link", keywords: ["블루투스", "bluetooth", "ble", "폰과 연결", "휴대폰과 연결"], design: "블루투스(BLE)로 폰과 연결하려면 기기와 앱이 주고받을 데이터 형식을 먼저 정해야 해요." },
  { id: "phone", label: "폰 알림·앱", group: "link", keywords: ["알림을 받", "알림 받", "알림이 오", "폰으로", "스마트폰", "푸시", "카톡", "앱으로", "앱에서"], design: "폰 알림은 와이파이+알림 서비스(텔레그램 봇 등)가 가장 쉬워요. 전용 앱 화면은 바이브코딩으로 따로 만들 수 있어요." },
  { id: "lora", label: "먼 거리 무선(LoRa)", group: "link", keywords: ["로라", "lora", "먼 거리", "통신이 안", "오프그리드", "메시", "산에서"], design: "LoRa는 수 km까지 가지만 보낼 수 있는 데이터가 아주 작아요. 무엇을 얼마나 자주 보낼지 줄여야 해요." },
  { id: "logging", label: "기록·그래프", group: "link", keywords: ["기록", "로그", "그래프", "통계", "데이터를 모", "측정값을 모", "저장해"], design: "기록은 기기 안 SD카드에 쌓을지, 와이파이로 보내 웹 그래프로 볼지 정해야 해요. 그래프 화면은 바이브코딩 영역이에요." },
  { id: "smart_home", label: "스마트홈 연동", group: "link", keywords: ["홈어시스턴트", "home assistant", "스마트홈", "홈킷", "homekit", "구글홈", "알렉사", "스마트싱스"], design: "스마트홈 연동은 ESPHome·HomeKit 같은 기존 연동 방식을 그대로 쓰는 게 가장 빨라요." },
  { id: "voice", label: "음성 명령", group: "link", keywords: ["음성 명령", "말로 켜", "말로 끄", "호출어", "음성인식", "음성 인식", "말하면"], design: "기기 안에서 알아듣는 음성 명령은 단어 수가 제한돼요. 쓸 명령어 목록을 먼저 짧게 정해야 해요." },
  // 전원
  { id: "battery", label: "배터리 구동", group: "power", keywords: ["배터리", "충전", "들고 다니", "휴대", "선 없이", "전원 없이", "무선으로"], design: "리튬 배터리+충전 모듈과 보호회로가 필요하고, 하루에 몇 시간 쓸지로 배터리 용량을 계산해야 해요." },
  // 형태
  { id: "wearable", label: "몸에 착용", group: "form", keywords: ["손목", "착용", "웨어러블", "몸에", "옷에", "신발", "깔창", "인솔", "팔찌", "목걸이", "안경", "모자"], design: "착용형은 무게·두께·땀·피부 접촉이 함께 걸려요. 크기를 정하기 전에 손이나 몸에 대보는 목업이 필요해요." },
  { id: "outdoor", label: "야외 사용", group: "form", keywords: ["야외", "베란다", "정원", "마당", "캠핑", "등산", "방수", "자전거", "텃밭"], design: "야외용은 비·햇빛·온도 변화를 견뎌야 해서 방수 케이스와 케이블 구멍 처리가 필요해요." },
  { id: "robot", label: "스스로 움직이는 몸체", group: "form", keywords: ["로봇", "자율주행", "주행", "rc카", "잔디"], design: "움직이는 몸체는 무게중심과 바퀴·다리 구조가 먼저고, 전자부품은 그 안에 들어갈 자리를 잡아야 해요." }
];

export const CAPABILITY_BY_ID = new Map(CAPABILITIES.map((c) => [c.id, c]));

const GROUP_WEIGHT: Record<CapabilityGroup, number> = { sense: 2, act: 2, link: 1, power: 1, form: 1 };
export function capabilityWeight(id: string): number {
  const capability = CAPABILITY_BY_ID.get(id);
  return capability ? GROUP_WEIGHT[capability.group] : 0;
}

export function normalizeIdea(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function extractCapabilities(idea: string): string[] {
  const text = normalizeIdea(idea);
  return CAPABILITIES.filter((c) => c.keywords.some((k) => text.includes(k))).map((c) => c.id);
}
