import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { kitById } from "../../../../lib/bench/kits";
import PracticeBench from "./practice-bench";
import "../../fonts";

type Props = { params: Promise<{ kit: string }>; searchParams: Promise<{ hue?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const kit = kitById((await params).kit);
  return { title: kit ? `${kit.title} · 미리 만들어보기` : "미리 만들어보기", description: kit?.subtitle };
}

export default async function PracticeKitPage({ params, searchParams }: Props) {
  const kit = kitById((await params).kit);
  if (!kit || kit.draft) notFound();
  const hue = Number((await searchParams).hue ?? 0);
  return <PracticeBench kitId={kit.id} hue={Number.isFinite(hue) ? hue : 0} />;
}
