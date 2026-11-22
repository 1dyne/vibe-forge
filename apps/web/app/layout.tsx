import type { Metadata, Viewport } from "next";
import "./styles.css";

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
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
