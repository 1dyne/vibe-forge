import type { Metadata } from "next";
import { notFound } from "next/navigation";
import IdeaForm from "./idea-form";

// ── MEETUP: 2026-11-28 밋업 시연 전용 (lib/meetup-inbox.ts 참고). 밋업이 끝나면 지운다 ──
// 발표 자료의 QR로 여는 화면. 로그인 없이 아이디어 한 줄을 발표자의 달그락 화면으로 보낸다.
export const metadata: Metadata = { title: "아이디어 보내기 · 달그락 대장간", robots: { index: false } };

export default async function IdeaPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[0-9a-f]{8}$/.test(code)) notFound();
  return <IdeaForm code={code} />;
}
