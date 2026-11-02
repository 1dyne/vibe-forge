import type { LocalProject } from "./project-types";
import { findCard } from "./parts/catalog";
import { resolvePin } from "./parts/rules";

// Shared by the server tools and the dashboard (no Node imports).

// Basis of one assembly step: if the step or the circuit changes, its finer
// steps are shown as stale.
export function stepBasis(project: LocalProject, index: number): string {
  const step = project.assembly?.steps[index];
  const text = JSON.stringify({ step, parts: project.assembly?.parts, components: project.build?.blueprint.components, nets: project.build?.blueprint.nets });
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return `${index}:${(hash >>> 0).toString(16)}`;
}

// Straight-line pin distance on the real layout plus slack, rounded up to 5 mm.
export function wireLengths(project: LocalProject, index: number): Array<{ from: string; to: string; directMm: number; suggestedMm: number }> {
  const guide = project.assembly;
  if (!guide?.steps[index]) return [];
  const point = (end: string): [number, number] | null => {
    const [ref, ...rest] = end.split(".");
    const pin = rest.join(".");
    const part = guide.parts.find((p) => p.ref === ref);
    if (!part) return null;
    const card = findCard(part.catalogId ?? project.build?.blueprint.components.find((c) => c.ref === ref)?.catalogId);
    const cp = card ? resolvePin(card, pin) : null;
    const local = cp && cp.xMm != null && cp.yMm != null ? [cp.xMm, cp.yMm] : part.pins?.find((p) => p.name === pin) ? [part.pins.find((p) => p.name === pin)!.x, part.pins.find((p) => p.name === pin)!.y] : null;
    return local ? [part.x + local[0], part.y + local[1]] : null;
  };
  return guide.steps[index].wires.flatMap((wire) => {
    const a = point(wire.from), b = point(wire.to);
    if (!a || !b) return [];
    const direct = Math.hypot(a[0] - b[0], a[1] - b[1]);
    return [{ from: wire.from, to: wire.to, directMm: Number(direct.toFixed(1)), suggestedMm: Math.ceil((direct + 20) / 5) * 5 }];
  });
}
