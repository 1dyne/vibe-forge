import type { LocalProject } from "./project-types";
import { findCard } from "./parts/catalog";

// '바뀔 수 있어요' 스티커 (사용자 요청 2026-11-11): 정해지지 않은 것이 있어도 설계를 멈추지 않고,
// 그 대신 결과물에 스티커를 붙여 빌드하면서 바뀔 부분이 있다는 걸 바로 알게 한다.
export type Provisional = { key: "housing" | "parts" | "power" | "tests"; label: string; detail: string };

const BATTERY = /BAT|배터리|전지|LiPo|리튬|18650|cell/i;

export function provisionalReasons(project: LocalProject | null | undefined): Provisional[] {
  if (!project) return [];
  const out: Provisional[] = [];
  const comps = project.build?.blueprint.components ?? [];
  if ((project.productForm || project.buildPlan) && !project.housing)
    out.push({ key: "housing", label: "하우징 미정", detail: "하우징을 무엇으로 만들지 아직 안 정했어요. 부품 배치·치수·고정 방법이 바뀔 수 있어요." });
  const unverified = comps.map((c) => findCard(c.catalogId)).filter((card) => card && !card.verifiedAt).map((card) => card!.model);
  if (unverified.length)
    out.push({ key: "parts", label: "부품 값 미검증", detail: `${[...new Set(unverified)].slice(0, 4).join(", ")}${unverified.length > 4 ? " 외" : ""}의 전압·핀 위치가 데이터시트로 확인되지 않았어요. 실물을 보고 바뀔 수 있어요.` });
  const hasBattery = comps.some((c) => BATTERY.test(c.ref) || BATTERY.test(c.type) || BATTERY.test(c.valueOrModel) || findCard(c.catalogId)?.type === "power");
  if (hasBattery && !project.power)
    out.push({ key: "power", label: "전원 미계산", detail: "배터리로 몇 시간 가는지 아직 계산하지 않았어요. 전지 용량이 바뀔 수 있어요." });
  return out;
}

/** 내려받는 HTML 문서에 붙는 같은 스티커 */
export function stickerHtml(reasons: Provisional[]): string {
  if (!reasons.length) return "";
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  return `<div style="display:inline-block;transform:rotate(-2.5deg);background:#ffd84d;color:#3b2a00;border:2px dashed #b88a00;border-radius:12px;padding:8px 14px;margin:6px 0 14px;box-shadow:0 3px 0 #e0b400;font-weight:700"><span style="font-size:18px">🔧 바뀔 수 있어요</span><ul style="margin:4px 0 0;padding-left:18px;font-weight:400;font-size:12.5px">${reasons.map((r) => `<li><b>${esc(r.label)}</b> · ${esc(r.detail)}</li>`).join("")}</ul></div>`;
}
