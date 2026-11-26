import type { Metadata, Viewport } from "next";
import { Jua, Noto_Sans_KR } from "next/font/google";
import "./styles.css";
import "./css/forge-scene.css";
import "./css/files.css";
import "./css/learn.css";
import "./css/revision.css";
import "./css/verify.css";
import "./css/card-prompt.css";
import "./css/ink.css";
import "./css/intro.css";

// 글꼴 이름만 적어두고 아무 데서도 불러오지 않고 있었다(Pretendard·Noto Sans KR 모두).
// 그래서 실제로는 운영체제 기본 한글 글꼴로 떨어졌고, 윈도우에서는 맑은 고딕이
// 11px로 가늘게 그려져 글이 눈에 들어오지 않았다. 빌드할 때 받아 함께 내보낸다.
const sans = Noto_Sans_KR({ weight: ["400", "500", "700"], display: "swap", preload: false, variable: "--font-sans" });

// 제목·이름표에 쓰는 둥글고 도톰한 글꼴. 굵은 먹선의 달그락 그림과 결을 맞춘다.
const display = Jua({ weight: "400", display: "swap", preload: false, variable: "--font-display" });

export const metadata: Metadata = {
  title: "달그락 대장간",
  description: "아이디어에서 실물 제작까지 함께 판단하는 제작 에이전트",
  // 아이콘은 app/favicon.ico · app/icon.png · app/apple-icon.png 파일 규약으로 자동 연결된다.
  // 여기에 icons를 직접 쓰면 그 자동 감지가 통째로 덮어써져 <link rel="icon">이 사라진다(탭 아이콘이 빈 문서로 보였던 원인).
  appleWebApp: { capable: true, title: "달그락" }
};

export const viewport: Viewport = { themeColor: "#94D2C9" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={sans.variable + " " + display.variable}>
      <body>{children}</body>
    </html>
  );
}
