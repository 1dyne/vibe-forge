import { UPLOAD_GUIDES } from "./firmware-guide";

// 아두이노 IDE 처음 설치 가이드 (온보딩 /find/setup). 정해진 데이터, AI 호출 없음.
export type IdeLevel = "never" | "heard" | "installed" | "used";
export const IDE_LEVELS: Array<{ value: IdeLevel; label: string; hint: string }> = [
  { value: "never", label: "처음 들어요", hint: "괜찮아요. 무엇인지부터 알려 줄게요" },
  { value: "heard", label: "들어는 봤어요", hint: "설치부터 같이 해요" },
  { value: "installed", label: "설치는 했어요", hint: "보드 연결과 첫 업로드를 해 봐요" },
  { value: "used", label: "보드에 올려 봤어요", hint: "내 보드 설정만 확인하면 돼요" }
];

export const WHAT_IS = [
  { title: "보드는 '작은 컴퓨터'예요", text: "아두이노·ESP32 같은 보드는 전기를 받으면 정해진 일을 계속 반복하는 아주 작은 컴퓨터예요. 그 '정해진 일'을 적은 글이 코드(펌웨어)예요." },
  { title: "IDE는 '코드를 쓰고 보드에 넣는 앱'이에요", text: "아두이노 IDE는 내 컴퓨터에 설치하는 무료 프로그램이에요. ① 코드를 쓰고 ② 보드가 알아듣는 말로 바꾸고(컴파일) ③ USB 선으로 보드에 넣어요(업로드). 메모장 + 번역기 + USB 전송기를 합친 거라고 생각하면 돼요." },
  { title: "코드는 달그락이 써 줘요", text: "처음부터 코드를 쓸 줄 몰라도 돼요. 달그락이 만든 코드를 붙여 넣고 업로드 버튼만 누르면 돼요. 오늘은 설치하고 보드 LED를 깜빡여 보는 것까지 할게요." }
];

export type Os = "mac" | "windows" | "linux" | "chromebook";
export const OS_LABEL: Record<Os, string> = { mac: "맥 (macOS)", windows: "윈도우", linux: "리눅스", chromebook: "크롬북" };

export const INSTALL: Record<Os, Array<{ title: string; text: string; link?: { href: string; label: string } }>> = {
  mac: [
    { title: "내려받기", text: "아두이노 공식 사이트의 Software 페이지에서 'Arduino IDE 2' → macOS를 골라요. 애플 칩(M1~)이면 Apple Silicon, 오래된 맥이면 Intel 버전이에요.", link: { href: "https://www.arduino.cc/en/software", label: "arduino.cc/en/software 열기" } },
    { title: "설치", text: "내려받은 .dmg 파일을 열고 Arduino IDE 아이콘을 Applications(응용 프로그램) 폴더로 끌어다 놓아요." },
    { title: "처음 열기", text: "응용 프로그램에서 Arduino IDE를 열어요. '인터넷에서 내려받은 앱' 경고가 나오면 '열기'를 눌러요. 처음 실행 때 필요한 도구를 자동으로 더 받아요(몇 분)." }
  ],
  windows: [
    { title: "내려받기", text: "아두이노 공식 사이트의 Software 페이지에서 'Arduino IDE 2' → Windows(Win 10 이상) 설치 파일을 골라요.", link: { href: "https://www.arduino.cc/en/software", label: "arduino.cc/en/software 열기" } },
    { title: "설치", text: "내려받은 파일을 실행하고 '다음'을 눌러 설치해요. 중간에 'USB 드라이버를 설치할까요?'가 나오면 모두 '설치'를 눌러요. 이게 있어야 보드가 보여요." },
    { title: "처음 열기", text: "시작 메뉴에서 Arduino IDE를 열어요. 방화벽 허용 창이 나오면 '허용'을 눌러요." }
  ],
  linux: [
    { title: "내려받기", text: "공식 사이트에서 Linux AppImage를 내려받아요.", link: { href: "https://www.arduino.cc/en/software", label: "arduino.cc/en/software 열기" } },
    { title: "실행 권한", text: "파일을 오른쪽 클릭 → 속성 → '실행 허용'을 켜거나, 터미널에서 chmod +x 파일이름.AppImage 를 입력해요." },
    { title: "USB 권한", text: "보드가 안 보이면 터미널에서 sudo usermod -aG dialout $USER 를 입력하고 로그아웃했다가 다시 로그인해요." }
  ],
  chromebook: [
    { title: "설치형 대신 웹 편집기", text: "크롬북에는 설치형 IDE 대신 'Arduino Cloud Editor'(웹에서 쓰는 아두이노 IDE)를 써요. 무료 Arduino 계정이 필요해요.", link: { href: "https://app.arduino.cc", label: "app.arduino.cc 열기" } },
    { title: "보드 연결", text: "처음 보드를 꽂으면 크롬이 USB 장치 사용 허락을 물어요. '연결'을 눌러요. 일부 보드(ESP32 등)는 지원이 제한될 수 있어요." }
  ]
};

export const BOARDS = [
  { id: "arduino-uno-r3", label: "Arduino UNO", led: "보드 가운데 'L' 표시 주황 LED" },
  { id: "arduino-nano", label: "Arduino Nano", led: "'L' 표시 작은 LED" },
  { id: "esp32-devkit-v1", label: "ESP32 개발보드", led: "파란 LED (GPIO 2). 없는 보드도 있어요" },
  { id: "xiao-esp32s3-sense", label: "XIAO ESP32S3", led: "USB 옆 주황 LED" },
  { id: "raspberry-pi-pico", label: "Raspberry Pi Pico", led: "USB 옆 초록 LED" },
  { id: "unknown", label: "아직 몰라요", led: "" }
] as const;
export function boardGuide(id: string) { return UPLOAD_GUIDES[id] ?? null; }

export const BLINK = `void setup() {
  pinMode(LED_BUILTIN, OUTPUT);   // 보드에 붙은 LED를 쓸게요
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH); // 켜고
  delay(1000);                     // 1초 기다리고
  digitalWrite(LED_BUILTIN, LOW);  // 끄고
  delay(1000);                     // 1초 기다리기를 계속 반복
}`;

/** 아두이노 IDE 말고 쓸 수 있는 도구 (사용자 질문 2026-11-11) */
export const ALTERNATIVES = [
  { name: "Arduino IDE 2", when: "처음이면 이것부터. 달그락 안내도 이걸 기준으로 해요.", level: "처음" },
  { name: "Arduino Cloud Editor", when: "크롬북·학교 PC처럼 설치가 어려울 때. 브라우저에서 쓰고 계정이 필요해요.", level: "처음" },
  { name: "Thonny + MicroPython", when: "Raspberry Pi Pico나 ESP32를 C++ 대신 파이썬으로 쓰고 싶을 때. 아주 쉬워요.", level: "처음" },
  { name: "Wokwi (시뮬레이터)", when: "보드 없이 브라우저에서 회로와 코드를 먼저 돌려 볼 때.", level: "처음" },
  { name: "PlatformIO (VS Code)", when: "프로젝트가 커지고 라이브러리 관리·여러 보드가 필요할 때. Claude Code와 같이 쓰기 좋아요.", level: "중급" },
  { name: "arduino-cli", when: "명령어로 컴파일·업로드할 때 (자동화).", level: "중급" },
  { name: "ESP-IDF", when: "ESP32의 모든 기능을 깊게 쓸 때. 초보자에게는 어려워요.", level: "고급" }
];
