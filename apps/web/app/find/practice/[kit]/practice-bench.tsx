"use client";
import BenchViewScreen from "../../../bench/bench-view";
import { kitById } from "../../../../lib/bench/kits";
import { useEffect } from "react";
import { track } from "../../track";

export default function PracticeBench({ kitId, hue, back = "/find/practice" }: { kitId: string; hue: number; back?: string }) {
  const kit = kitById(kitId)!;
  useEffect(() => { track("practice_open", { kit: kitId }); }, [kitId]);
  return <BenchViewScreen kit={kit} hue={hue} mode="practice" backHref={back} onFinish={() => track("practice_done", { kit: kitId })} />;
}
