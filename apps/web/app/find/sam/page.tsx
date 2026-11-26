import type { Metadata } from "next";
import { SamFirmware, SamStory } from "../../meetup-sam";

// ── MEETUP: 2026-11-28 밋업 시연 전용 (lib/meetup.ts 참고). 밋업이 끝나면 지운다 ──
// 로그인 없이 여는 '셈' 소개와 사용설명서. 참여자가 휴대폰으로 열어 설치법을 따라 한다.
export const metadata: Metadata = { title: "셈(SAM) 사용설명서 · 달그락 대장간", description: "재고를 같이 세어 주는 돌멩이, 셈과 사만다" };

export default function SamPage() {
  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "22px 14px 60px", background: "#f6f1e7", minHeight: "100dvh" }}>
      <SamStory standalone />
      <SamFirmware />
    </main>
  );
}
