import type { LocalProject } from "./project-types";
import { ownedHits, type OwnedHit } from "./owned-parts";
import { workflowFor } from "./workflow";

// 언제 사야 하는가. 부품목록은 지금까지 "구매 예정 / 주문 완료 / 수령 완료"만
// 물었다. 그런데 처음 만드는 사람이 실제로 막히는 건 그게 아니라 "지금 사도
// 되나"다. 회로가 바뀔 수 있는데 먼저 사면 돈이 버려지고, 다 정해진 뒤에야
// 주문하면 배송을 기다리느라 멈춘다.
//
// 판단에 필요한 건 이미 다 있다. 규칙 검사 결과(어느 부품에 무엇이 걸렸는지),
// 회로 승인 여부, 부품 카드의 검증 날짜, 그리고 가진 부품. 모델에게 묻지 않고
// 코드가 센다.

export type SourcingVerdict = "owned" | "blocked" | "wait_design" | "verify" | "ready";

export type SourcingLine = {
  ref: string;
  name: string;
  verdict: SourcingVerdict;
  /** 왜 그렇게 봤는지. 화면에서는 말풍선으로만 띄운다 — 줄로 적으면 목록이 글밭이 된다. */
  reason: string;
  owned: OwnedHit | null;
};

export const SOURCING_LABEL: Record<SourcingVerdict, string> = {
  owned: "안 사도 돼요",
  blocked: "고친 뒤에",
  wait_design: "회로 승인 후",
  verify: "사양 확인 후",
  ready: "지금 사도 돼요"
};

export function sourcingLines(project: LocalProject): SourcingLine[] {
  const workflow = workflowFor(project);
  const components = project.build?.blueprint.components ?? [];
  const checks = project.build?.checks ?? [];
  const approved = Boolean(workflow.circuitApprovedAt);

  // 가진 수량을 앞 줄부터 나눠 쓴다. LED 하나로 LED 자리 둘을 채울 수 없다.
  const hits = ownedHits(workflow.profile, components);

  return components.map((component, index) => {
    const owned = hits[index];
    const mine = checks.filter((check) => (check.affectedRefs ?? []).includes(component.ref));
    const blocked = mine.find((check) => check.severity === "blocked" || check.verdict === "fail");
    const warned = mine.find((check) => check.severity === "warning" || check.verdict === "unknown");
    const line = (verdict: SourcingVerdict, reason: string): SourcingLine => ({ ref: component.ref, name: component.valueOrModel, verdict, reason, owned });

    // 이미 확실히 가진 것은 살 이유가 없다. 값까지 맞는지 확인이 필요한 것은
    // 아직 '가진 것'으로 치지 않고 아래 판단을 그대로 받는다.
    if (owned?.certainty === "card") return line("owned", `${owned.part.name} ${owned.part.qty}개를 이미 가지고 있어요.`);
    // 이 부품에 꼭 고칠 것이 걸려 있으면, 고치는 과정에서 부품 자체가 바뀐다.
    if (blocked) return line("blocked", blocked.message);
    // 회로 승인 전에는 무엇이 들어갈지가 아직 정해지지 않았다.
    if (!approved) return line("wait_design", "회로를 승인하면 이 부품이 확정돼요. 그 전에 사면 바뀔 수 있어요.");
    // 카드가 없거나(CARD_MISSING) 핀·역할이 수상한 것은 규칙 엔진이 이미 경고로
    // 올린다. 여기서 카드의 verifiedAt을 또 보지는 않는다. 27개 카드 중 20개가
    // 아직 데이터시트로 검증되지 않았는데 그걸 전부 "확인 후"로 묶으면, 정작
    // 이 부품만의 문제를 가리키는 경고가 묻힌다. 검증 여부는 '바뀔 수 있어요'
    // 스티커가 이미 따로 말하고 있다.
    if (warned) return line("verify", warned.message);
    return line("ready", "설계가 확정됐고 이 부품에 걸린 문제도 없어요.");
  });
}

export function sourcingSummary(lines: SourcingLine[]) {
  const count = (verdict: SourcingVerdict) => lines.filter((line) => line.verdict === verdict).length;
  return { total: lines.length, owned: count("owned"), ready: count("ready"), verify: count("verify"), waiting: count("wait_design") + count("blocked") };
}
