import type { Anchor, BenchKit, BenchOp, BenchStep } from "./types";

// '직접 하기'에서 손으로 하는 순서 (뒤집기 → 양손 준비 → 꾹 눌러 납땜 …).
// 3D 엔진과 화면이 같이 쓰고, 테스트할 수 있게 DOM·three 없이 둔다.

export type HoldGrade = "good" | "starved" | "cold";

/** 꾹 누르기 시간(ms). 너그럽게: 1.5초부터 6초까지는 모두 좋은 납땜이다 */
export const HOLD_MS = {
  /** 이때까지는 인두로 데우기만 (납이 아직 안 녹음) */
  heat: 400,
  /** 원뿔이 다 차는 때. 이보다 일찍 떼면 납 부족 */
  good: 1500,
  /** 이제 떼라고 알려 주는 때 */
  warn: 4500,
  /** 이보다 오래 대면 냉납 모양 (플럭스가 다 타서 납이 거칠어짐) */
  cold: 6000
} as const;

export function gradeHold(ms: number): HoldGrade {
  if (!Number.isFinite(ms) || ms < HOLD_MS.good) return "starved";
  if (ms > HOLD_MS.cold) return "cold";
  return "good";
}

/** 누른 시간 → 원뿔이 찬 정도 (0~1) */
export function holdFill(ms: number): number {
  const t = Math.min(1, Math.max(0, (ms - HOLD_MS.heat) / (HOLD_MS.good - HOLD_MS.heat)));
  return t * t * (3 - 2 * t);
}

export const GRADE_TEXT: Record<HoldGrade, string> = {
  good: "반짝이는 원뿔이에요!",
  starved: "납이 조금 모자라요(납 부족). 같은 자리를 2초쯤 다시 꾹 눌러요",
  cold: "너무 오래 데워 회색이 됐어요(냉납). 다시 2초만 눌러 녹이면 고쳐져요"
};

export type ToolId = "iron" | "solder" | "cutter" | "stripper" | "meter";
export const TOOL_NAME: Record<ToolId, string> = { iron: "인두", solder: "실납", cutter: "니퍼", stripper: "와이어 스트리퍼", meter: "멀티미터" };

/** 이 단계에서 손에 드는 연장 */
export function stepTools(step: BenchStep): ToolId[] {
  const out = new Set<ToolId>();
  for (const o of step.ops) {
    if (o.op === "solder" || o.op === "bridge") { out.add("iron"); out.add("solder"); }
    if (o.op === "prep_wire") { out.add("stripper"); if (o.tin) { out.add("iron"); out.add("solder"); } }
    if (o.op === "trim") out.add("cutter");
    if (o.op === "check" && (o.how === "continuity" || o.how === "voltage")) out.add("meter");
  }
  return [...out];
}

export type HandsStage =
  /** 부품 다리를 직각으로 구부린다 (트레이의 부품을 누르거나 버튼) */
  | { kind: "bend"; ref: string }
  /** 빛나는 곳을 눌러 ops[from, to)를 한다 */
  | { kind: "tap"; from: number; to: number }
  /** 보드를 구리 면이 위로 오게 뒤집는다 */
  | { kind: "flip" }
  /** 왼손 실납, 오른손 인두 */
  | { kind: "hands" }
  /** 자리마다 꾹 눌러 납땜한다. keys = 납땜 자리 (이웃 잇기는 "A|B") */
  | { kind: "hold"; op: number; keys: string[] };

export const holdKeys = (o: BenchOp): string[] => (o.op === "solder" ? o.joints : o.op === "bridge" ? o.pairs.map(([a, b]) => `${a}|${b}`) : []);

/** 아래(구리) 면에서 하는 일이 있는가: 만능기판이면 뒤집어서 한다 */
export function stepNeedsFlip(step: BenchStep, canFlip: boolean): boolean {
  if (!canFlip) return false;
  return step.view === "bottom" || step.ops.some((o) => (o.op === "solder" && o.side === "bottom") || o.op === "bridge");
}

/** 뒤집을 수 있는 키트: 만능기판이 있고, 기판 밖으로 뻗는 점퍼선이 없다 */
export function kitCanFlip(kit: BenchKit): boolean {
  return kit.parts.some((p) => p.kind === "perfboard") && !kit.steps.some((s) => s.ops.some((o) => o.op === "jumper"));
}

/** 다리를 구부려 꽂는 부품 (저항처럼 몸통이 눕는 부품) */
export function bendableRefs(kit: BenchKit): Set<string> {
  return new Set(kit.parts.filter((p) => p.kind === "resistor").map((p) => p.ref));
}

const FLIP_OPS = new Set<BenchOp["op"]>(["solder", "bridge", "trim", "check"]);

/**
 * 한 단계를 손으로 하는 순서로 나눈다.
 * flipped / hands = 지금 이미 뒤집혀 있는지, 이미 양손에 들고 있는지 (그러면 그 순서는 건너뛴다).
 */
export function handsStages(step: BenchStep, o: { canFlip: boolean; flipped: boolean; hands: boolean; bendable: Set<string> }): HandsStage[] {
  const out: HandsStage[] = [];
  const needFlip = stepNeedsFlip(step, o.canFlip);
  let flipped = o.flipped, hands = o.hands, tapFrom = -1;
  const flush = (i: number) => { if (tapFrom >= 0 && i > tapFrom) out.push({ kind: "tap", from: tapFrom, to: i }); tapFrom = -1; };
  const flipNow = (i: number) => { if (needFlip && !flipped) { flush(i); out.push({ kind: "flip" }); flipped = true; } };
  step.ops.forEach((op, i) => {
    if (op.op === "solder" || op.op === "bridge") {
      flush(i);
      if ((op.op === "bridge" || op.side === "bottom")) flipNow(i);
      if (!hands) { out.push({ kind: "hands" }); hands = true; }
      out.push({ kind: "hold", op: i, keys: holdKeys(op) });
      return;
    }
    if (op.op === "insert" && o.bendable.has(op.ref)) { flush(i); out.push({ kind: "bend", ref: op.ref }); }
    if (FLIP_OPS.has(op.op)) flipNow(i);
    if (tapFrom < 0) tapFrom = i;
  });
  flush(step.ops.length);
  if (needFlip && !flipped) out.unshift({ kind: "flip" });
  return out;
}

export function stageText(s: HandsStage, done = 0): string {
  switch (s.kind) {
    case "bend": return "다리를 ㄱ자로 꺾어요 (트레이의 부품을 눌러도 돼요)";
    case "flip": return "구리 면이 위로 오게 보드를 뒤집어요";
    case "hands": return "왼손엔 실납, 오른손엔 인두를 들어요";
    case "hold": return `빛나는 자리를 2초쯤 꾹 눌러요 (${done}/${s.keys.length})`;
    case "tap": return "빛나는 곳을 눌러요 (안 보이면 💡 힌트)";
  }
}
