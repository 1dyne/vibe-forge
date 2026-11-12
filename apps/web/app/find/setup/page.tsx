import type { Metadata } from "next";
import IdeSetup from "./ide-setup";
import "../fonts";

export const metadata: Metadata = { title: "아두이노 IDE 처음 설치 · 달그락 대장간", description: "보드에 코드를 넣는 프로그램을 설치하고 LED를 깜빡여 봐요." };

type Props = { searchParams: Promise<{ board?: string; back?: string }> };
export default async function SetupPage({ searchParams }: Props) {
  const q = await searchParams;
  const back = q.back && q.back.startsWith("/") && !q.back.startsWith("//") ? q.back : "/find";
  return <IdeSetup initialBoard={q.board ?? null} back={back} />;
}
