import type { LocalProject, SafetyItem, SafetyReview } from "./project-types";
import { findCard } from "./parts/catalog";

// 안전 검토 (명세서 2차 v0.1 §11). 조건에 맞으면 서버가 필수 항목을 넣는다(빼거나 지울 수 없다).
const BATTERY = /BAT|배터리|전지|LiPo|리튬|18650|cell/i;
const HOT = ["ams1117-3v3", "drv8833-driver", "mt3608-boost", "tp4056-protected"];

export function requiredSafety(project: LocalProject): SafetyItem[] {
  const comps = project.build?.blueprint.components ?? [];
  const env = project.housing?.environment;
  const items: SafetyItem[] = [];
  const add = (id: string, topic: string, text: string) => items.push({ id, topic, text, status: "unknown", required: true });
  const battery = comps.some((c) => BATTERY.test(c.ref) || BATTERY.test(c.valueOrModel) || ["lipo-1s-jstph", "holder-18650", "tp4056-protected"].includes(c.catalogId ?? ""));
  if (battery) {
    add("bat-protect", "리튬 전지", "보호회로가 있는 전지나 보호형 충전 모듈을 쓴다");
    add("bat-unattended", "리튬 전지", "충전 중에 자리를 비우지 않는다");
    add("bat-swell", "리튬 전지", "부풀거나 찍히거나 뜨거운 전지는 바로 쓰지 않고 폐기한다");
    add("bat-short", "리튬 전지", "전지 단자·전선이 서로 닿지 않게 절연(열수축·테이프)한다");
  }
  if (env?.skinContact) {
    add("skin-temp", "피부 접촉", "닿는 면의 온도가 41℃를 넘지 않게 한다 (발열 부품과 떨어뜨리기)");
    add("skin-edge", "피부 접촉", "날카로운 모서리·버를 다듬는다");
    add("skin-material", "피부 접촉", "알레르기·덜 굳은 레진 같은 재료를 피하거나 코팅한다");
  }
  if (env?.childUse) {
    add("child-small", "아이 사용", "지름 31.7mm보다 작은 떨어지는 부품이 없다 (삼킴 위험)");
    add("child-battery", "아이 사용", "배터리 덮개는 나사로 잠근다");
  }
  const hot = comps.filter((c) => HOT.includes(c.catalogId ?? "")).map((c) => c.ref);
  if (hot.length || env?.heatSources.length) add("heat-vent", "발열", `열이 나는 부품(${[...hot, ...(env?.heatSources ?? [])].join(", ")}) 근처에 통풍 구멍을 두고 손이 닿지 않게 한다`);
  const motors = comps.filter((c) => findCard(c.catalogId)?.isMotor).map((c) => c.ref);
  if (motors.length) add("motor-pinch", "모터", `${motors.join(", ")}이(가) 움직이는 곳에 손가락·머리카락이 끼지 않게 막는다`);
  if (project.workflow?.profile?.purpose === "sell") add("sell-kc", "판매", "KC 전자파·전기용품 안전 인증 대상인지 확인한다 (판매 전 필수, 아직 모름)");
  return items;
}

/** Claude가 보낸 항목과 필수 항목을 합친다. 필수 항목은 지울 수 없고, 이전 '확인했어요'는 유지한다. */
export function mergeSafety(input: Array<Omit<SafetyItem, "required" | "ackAt">>, project: LocalProject): SafetyReview {
  const prev = new Map((project.safety?.items ?? []).map((i) => [i.id, i]));
  const req = requiredSafety(project);
  const byId = new Map<string, SafetyItem>();
  for (const r of req) byId.set(r.id, r);
  for (const i of input) { const base = byId.get(i.id); byId.set(i.id, { ...i, required: base?.required ?? false }); }
  const items = [...byId.values()].map((i) => { const old = prev.get(i.id); return old?.ackAt && old.status === i.status ? { ...i, ackAt: old.ackAt } : i; });
  return { items, updatedAt: new Date().toISOString() };
}

export const unackedRisks = (project: LocalProject) => (project.safety?.items ?? []).filter((i) => i.status === "risk" && !i.ackAt);
