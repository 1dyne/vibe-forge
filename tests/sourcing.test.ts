import { describe, expect, it } from "vitest";
import { sourcingLines, sourcingSummary } from "../apps/web/lib/sourcing";
import type { CircuitComponent, LocalProject, RuleCheck } from "../apps/web/lib/project-types";
import { emptyProfile } from "../apps/web/lib/workflow";

const part = (ref: string, model: string, catalogId: string | null): CircuitComponent =>
  ({ ref, type: "sensor", valueOrModel: model, reason: "", connection: "breadboard", ...(catalogId ? { catalogId } : {}) });

function project(over: { components: CircuitComponent[]; checks?: RuleCheck[]; approved?: boolean; owned?: Array<{ name: string; catalogId: string | null; qty?: number }> }): LocalProject {
  const profile = { ...emptyProfile(), ownedParts: (over.owned ?? []).map((p, i) => ({ id: `o${i}`, name: p.name, qty: p.qty ?? 1, catalogId: p.catalogId, note: "" })) };
  return {
    id: "p1", name: "테스트", idea: "", oneLiner: "", stage: "circuit", designRevision: 1,
    createdAt: "", updatedAt: "", messages: [], tasks: [], slots: [],
    workflow: {
      phase: "circuit", profile, activeAgents: ["hw"],
      circuitApprovedAt: over.approved ? "2026-01-01T00:00:00.000Z" : null,
      mockupApprovedAt: null, sharedUpdates: [], purchases: {}, evidence: []
    },
    build: {
      blueprint: { title: "t", board: "", supplyVoltage: 5, components: over.components, nets: [], enclosure: { widthMm: 10, depthMm: 10, heightMm: 10, wallMm: 2 }, firmware: { platform: "arduino", behavior: "", pinAssignments: [], loopSteps: [] }, assumptions: [], humanChecks: [] },
      checks: over.checks ?? [],
      evaluator: { summary: "", hw: { verdict: "pass", findings: [], requiredMeasurements: [] }, sw: { verdict: "pass", findings: [], requiredMeasurements: [] } },
      artifacts: []
    }
  } as unknown as LocalProject;
}

const verdicts = (p: LocalProject) => Object.fromEntries(sourcingLines(p).map((l) => [l.ref, l.verdict]));

describe("언제 사야 하는지", () => {
  // 회로가 아직 승인되지 않았으면 무엇이 들어갈지가 정해지지 않았다.
  it("회로 승인 전에는 전부 기다리게 한다", () => {
    const p = project({ components: [part("U1", "AHT20 온습도 센서 모듈 (I2C)", "aht20-module")], approved: false });
    expect(verdicts(p)).toEqual({ U1: "wait_design" });
  });

  it("승인되고 사양이 확인된 부품은 지금 사도 된다", () => {
    const p = project({ components: [part("U1", "AHT20 온습도 센서 모듈 (I2C)", "aht20-module")], approved: true });
    expect(verdicts(p).U1).toBe("ready");
  });

  // 고치는 과정에서 부품 자체가 바뀐다. 먼저 사면 버린다.
  it("꼭 고칠 것이 걸린 부품은 고친 뒤에 사게 한다", () => {
    const p = project({
      components: [part("U1", "AHT20 온습도 센서 모듈 (I2C)", "aht20-module")], approved: true,
      checks: [{ id: "SUPPLY_OVER", verdict: "fail", severity: "blocked", affectedRefs: ["U1"], message: "허용 전압을 넘어요." }]
    });
    const line = sourcingLines(p)[0];
    expect(line.verdict).toBe("blocked");
    expect(line.reason).toBe("허용 전압을 넘어요.");
  });

  it("경고가 붙은 부품은 사양을 확인하고 사게 한다", () => {
    const p = project({
      components: [part("U1", "AHT20 온습도 센서 모듈 (I2C)", "aht20-module")], approved: true,
      checks: [{ id: "LOGIC_LEVEL", verdict: "unknown", severity: "warning", affectedRefs: ["U1"], message: "레벨을 확인하세요." }]
    });
    expect(verdicts(p).U1).toBe("verify");
  });

  // 카드가 없는 부품은 규칙 엔진이 CARD_MISSING 경고를 올린다. 소싱은 그 경고를
  // 받아 쓰기만 하고, 카드의 검증 날짜를 따로 보지 않는다 — 카드 27개 중 20개가
  // 아직 미검증이라 그걸로 막으면 "지금 사도 돼요"가 아예 나오지 않는다.
  it("카드가 없다는 경고를 받으면 사양을 확인하게 한다", () => {
    const p = project({
      components: [part("X1", "어디서 주워온 모듈", null)], approved: true,
      checks: [{ id: "CARD_MISSING", verdict: "unknown", severity: "warning", affectedRefs: ["X1"], message: "부품 카드에 없어요." }]
    });
    expect(verdicts(p).X1).toBe("verify");
  });

  it("아직 데이터시트로 검증되지 않은 카드만으로는 막지 않는다", () => {
    // aht20-module은 verifiedAt이 null이지만, 그것만으로 구매를 미루게 하지는 않는다.
    const p = project({ components: [part("U1", "AHT20 온습도 센서 모듈 (I2C)", "aht20-module")], approved: true });
    expect(verdicts(p).U1).toBe("ready");
  });

  // 확실히 가진 것은 회로가 아직 승인되지 않았어도 살 이유가 없다.
  it("이미 가진 부품은 살 목록에서 빠진다", () => {
    const p = project({
      components: [part("U1", "AHT20 온습도 센서 모듈 (I2C)", "aht20-module")], approved: false,
      owned: [{ name: "AHT20 온습도 센서", catalogId: "aht20-module", qty: 2 }]
    });
    expect(verdicts(p).U1).toBe("owned");
  });

  // 값이 맞는지 확인이 필요한 것은 '가진 것'으로 치지 않는다.
  it("값 확인이 필요한 것은 가진 것으로 세지 않는다", () => {
    const p = project({
      components: [part("R1", "저항 220Ω", "resistor")], approved: true,
      owned: [{ name: "저항", catalogId: "resistor", qty: 100 }]
    });
    expect(verdicts(p).R1).not.toBe("owned");
  });

  it("요약은 종류별로 센다", () => {
    const p = project({
      components: [
        part("U1", "AHT20 온습도 센서 모듈 (I2C)", "aht20-module"),
        part("U2", "MPU-6050 가속도·자이로 모듈 (GY-521)", "mpu6050-module"),
        part("X1", "어디서 주워온 모듈", null)
      ],
      approved: true,
      checks: [{ id: "CARD_MISSING", verdict: "unknown", severity: "warning", affectedRefs: ["X1"], message: "부품 카드에 없어요." }],
      owned: [{ name: "AHT20 온습도 센서", catalogId: "aht20-module", qty: 1 }]
    });
    const summary = sourcingSummary(sourcingLines(p));
    expect(summary.total).toBe(3);
    expect(summary.owned).toBe(1);
    expect(summary.verify).toBe(1);
  });
});
