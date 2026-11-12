import type { LocalProject, PowerBudget, PowerLoad } from "./project-types";
import { findCard } from "./parts/catalog";

// 전원·배터리 수명 (명세서 2차 v0.1 §7). Claude가 보낸 result는 쓰지 않고 서버가 다시 계산한다.
export type PowerInput = Omit<PowerBudget, "result" | "updatedAt">;

export function checkPower(input: PowerInput, project: LocalProject): string[] {
  const problems: string[] = [];
  const total = input.modes.reduce((a, m) => a + m.dutyPct, 0);
  if (Math.abs(total - 100) > 1) problems.push(`모드 비율(dutyPct) 합이 ${total}%예요. 100%가 되게 나눠 주세요.`);
  if (input.source.kind === "battery" && input.source.capacityMah === undefined) problems.push("배터리 전원이면 capacityMah를 넣으세요(모르면 null).");
  const refs = new Set((project.build?.blueprint.components ?? []).map((c) => c.ref));
  if (refs.size) for (const m of input.modes) for (const l of m.loads) if (!refs.has(l.ref)) problems.push(`${m.name}의 부하 ${l.ref}가 회로 부품에 없어요`);
  return problems;
}

export function computePower(input: PowerInput, project: LocalProject): PowerBudget {
  const eff = Math.min(1, Math.max(0.3, input.regulatorEfficiency || 0.85));
  const derate = Math.min(1, Math.max(0.3, input.derating || 0.8));
  const sums = input.modes.map((m) => m.loads.reduce((a, l) => a + l.currentMa, 0));
  const avgLoad = input.modes.reduce((a, m, i) => a + (m.dutyPct / 100) * sums[i], 0);
  const avg = Math.round((avgLoad / eff) * 100) / 100;
  const peak = Math.round(Math.max(0, ...sums) * 100) / 100;
  const cap = input.source.kind === "battery" ? input.source.capacityMah ?? null : null;
  const hours = cap && avg > 0 ? Math.round(((cap * derate) / avg) * 10) / 10 : null;
  const estimated = input.modes.some((m) => m.loads.some((l) => l.basis === "assumed"));
  const warnings: string[] = [];
  const comps = project.build?.blueprint.components ?? [];
  const board = comps.map((c) => findCard(c.catalogId)).find((c) => c?.type === "board");
  if (board?.board?.rail5vMaxMa && peak > board.board.rail5vMaxMa) warnings.push(`가장 많이 쓸 때 ${peak}mA로 ${board.model} 5V 핀 한계(${board.board.rail5vMaxMa}mA)를 넘어요. 별도 전원을 쓰세요.`);
  if (board?.board?.rail3v3MaxMa && peak > board.board.rail3v3MaxMa) warnings.push(`가장 많이 쓸 때 ${peak}mA로 ${board.model} 3.3V 레일(${board.board.rail3v3MaxMa}mA)보다 커요. 3.3V에 물린 부품 전류를 확인하세요.`);
  for (const c of comps) { const card = findCard(c.catalogId); if (card?.isMotor) warnings.push(`${c.ref}(${card.model})는 모터라 순간 전류가 커요. 보드 핀 대신 별도 전원을 권해요.`); }
  return { ...input, regulatorEfficiency: eff, derating: derate, result: { avgCurrentMa: avg, peakCurrentMa: peak, hours, estimated, railWarnings: [...new Set(warnings)] }, updatedAt: new Date().toISOString() };
}

/** 부품 카드에 있는 전류로 부하 후보를 만든다 (Claude가 참고) */
export function suggestedLoads(project: LocalProject): PowerLoad[] {
  return (project.build?.blueprint.components ?? []).flatMap((c): PowerLoad[] => {
    const card = findCard(c.catalogId);
    if (card?.typicalCurrentMa != null) return [{ ref: c.ref, currentMa: card.typicalCurrentMa, basis: "card_typical" as const }];
    if (card?.maxCurrentMa != null && card.type !== "power") return [{ ref: c.ref, currentMa: card.maxCurrentMa, basis: "card_max" as const }];
    return [];
  });
}
