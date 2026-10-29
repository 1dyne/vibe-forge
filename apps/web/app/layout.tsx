import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "달그락 대장간",
  description: "아이디어에서 실물 제작까지 함께 판단하는 제작 에이전트"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
