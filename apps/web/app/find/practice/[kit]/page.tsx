import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { kitById } from "../../../../lib/bench/kits";
import PracticeBench from "./practice-bench";
import "../../fonts";

type Props = { params: Promise<{ kit: string }>; searchParams: Promise<{ hue?: string; back?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const kit = kitById((await params).kit);
  return { title: kit ? `${kit.title} · 미리 만들어보기` : "미리 만들어보기", description: kit?.subtitle };
}

export default async function PracticeKitPage({ params, searchParams }: Props) {
  const kit = kitById((await params).kit);
  if (!kit || kit.draft) notFound();
  const sp = await searchParams;
  const hue = Number(sp.hue ?? 0);
  // 내 대장간에서 왔으면 끝나고 대장간으로 돌아간다 (우리 사이트 안 경로만)
  const back = sp.back && /^\/(f\/[A-Za-z0-9]{4,16}|find(\/[a-z-]*)?)$/.test(sp.back) ? sp.back : "/find/practice";
  return <PracticeBench kitId={kit.id} hue={Number.isFinite(hue) ? hue : 0} back={back} />;
}
