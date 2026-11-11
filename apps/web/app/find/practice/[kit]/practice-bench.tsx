"use client";
import BenchViewScreen from "../../../bench/bench-view";
import { kitById } from "../../../../lib/bench/kits";
import { useEffect } from "react";
import { track } from "../../track";

export default function PracticeBench({ kitId, hue }: { kitId: string; hue: number }) {
  const kit = kitById(kitId)!;
  useEffect(() => { track("practice_open", { kit: kitId }); }, [kitId]);
  return <BenchViewScreen kit={kit} hue={hue} mode="practice" backHref="/find/practice" onFinish={() => track("practice_done", { kit: kitId })} />;
}
