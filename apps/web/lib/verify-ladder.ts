import type { CircuitComponent, LocalProject, MakerProfile } from "./project-types";
import { findCard, type PartCard } from "./parts/catalog";
import { TROUBLE_CARDS, parseOhms, type LadderStage, type LibraryCard } from "./parts/trouble-cards";

// 회로 검증 사다리: 만든 회로를 "아래 칸부터 한 칸씩" 확인하는 순서.
//
// 처음 만드는 사람은 무엇을 어떤 순서로 재야 하는지 모른다. 그리고 전원을 넣기 전에 할
// 확인을 건너뛰면 부품이 탄다. 그래서 순서를 고정한다: ① 전원 넣기 전 → ② 전원 →
// ③ 업로드 → ④ 부품 하나씩 → ⑤ 함께. 앞 단계가 모두 통과(또는 사람이 이유를 적고
// 건너뜀)해야 다음 단계가 열린다.
//
// 칸마다 사람이 무엇을 어떻게 돌려줘야 하는지가 정해져 있다(멀티미터 모드, 리드를 댈
// 자리, 단위). 정상 범위의 숫자는 출처가 있을 때만 있고, 없으면 값만 받아 "모름"으로
// 둔 뒤 달그락이 사람과 함께 판단한다. 입력 없이 통과로 바뀌는 칸은 없다.

export type { LadderStage };
export const STAGES: Array<{ id: LadderStage; title: string; intro: string }> = [
  { id: "prepower", title: "① 전원 넣기 전", intro: "USB와 전지를 모두 뺀 상태에서 해요. 여기서 잡으면 부품이 타지 않아요." },
  { id: "power", title: "② 전원", intro: "전원을 넣고, 전압이 맞게 들어오는지 봐요." },
  { id: "upload", title: "③ 업로드", intro: "보드에 코드를 올리고, 보드가 컴퓨터와 말이 통하는지 봐요." },
  { id: "parts", title: "④ 부품 하나씩", intro: "부품을 한 번에 하나만 확인해요. 그래야 어디가 문제인지 알 수 있어요." },
  { id: "together", title: "⑤ 함께", intro: "모두 연결해 실제로 쓰는 것처럼 돌려 봐요." }
];

export type RungInput =
  | { kind: "number"; unit: string }
  | { kind: "yes_no"; question: string }
  | { kind: "observe"; question: string }
  | { kind: "serial_line" }
  | { kind: "photo"; what: string };

/** 정상으로 보는 기준. 숫자는 출처(sourceUrl 또는 sourceNote)가 있을 때만 만들어진다 */
export type RungRange =
  | { kind: "number"; min: number | null; max: number | null; unit: string; sourceUrl: string | null; sourceNote: string | null }
  | { kind: "answer"; expect: string }
  | { kind: "contains"; anyOf: string[]; expect: string; sourceUrl: string | null; sourceNote: string | null };

export type Rung = {
  id: string;
  stage: LadderStage;
  /** ④에서 어느 부품의 칸인지 (예: "U2 · HC-SR04") */
  group: string | null;
  partRef: string | null;
  title: string;
  why: string;
  how: string[];
  meterMode: LibraryCard["meterMode"];
  probePoints: string;
  input: RungInput;
  expectedRange: RungRange | null;
  ifPass: string;
  ifFail: string;
  needsMultimeter: boolean;
  /** 멀티미터 없이 하는 방법이 있으면 */
  alternative: { how: string; expect: string } | null;
  /** 이 사람은 멀티미터가 없어서 alternative로 바꿔 놓았다 */
  usingAlternative: boolean;
  /** 멀티미터가 없고 대신할 방법도 없어서 확인할 수 없는 칸 */
  unavailable: boolean;
  severity: LibraryCard["severity"];
};

export type Verdict = "pass" | "fail" | "unknown";
export type RungResult = {
  value: number | null;
  yes: boolean | null;
  text: string;
  photoNote: string;
  at: string;
  verdict: Verdict;
  /** 누가 적었나: 사람이 화면에서, 또는 사람이 말해준 것을 달그락이 */
  by: "person" | "agent";
  /** 건너뛴 이유. 건너뛴 칸은 통과로 세지 않는다 */
  skipped?: string;
};
export type VerifyState = { results: Record<string, RungResult>; updatedAt: string };
export const emptyVerify = (): VerifyState => ({ results: {}, updatedAt: new Date(0).toISOString() });
export const verifyOf = (project: Pick<LocalProject, "verify">): VerifyState => project.verify ?? emptyVerify();

export type Ladder = {
  rungs: Rung[];
  /** 사다리를 아직 만들 수 없거나, 알아 둘 것 */
  notes: string[];
  hasMultimeter: boolean;
  /** 멀티미터가 없어 확인하지 못하는 칸의 제목 */
  cannotVerify: string[];
};

export type RungStatus = "locked" | "current" | "todo" | "pass" | "fail" | "unknown" | "skipped" | "unavailable";
export type LadderView = {
  stages: Array<{ id: LadderStage; title: string; intro: string; locked: boolean; done: boolean; rungs: Array<Rung & { status: RungStatus; result: RungResult | null }> }>;
  current: Rung | null;
  counts: { pass: number; fail: number; unknown: number; skipped: number; unavailable: number; total: number };
  notes: string[];
  hasMultimeter: boolean;
  cannotVerify: string[];
};

const hasMeter = (profile: MakerProfile | undefined | null) => !!profile?.tools?.some((tool) => /멀티미터|테스터|multimeter/i.test(tool));
const stageOf = (card: LibraryCard): LadderStage => card.ladderStage ?? (card.stage === "power" ? "power" : card.stage === "upload" ? "upload" : "parts");
const label = (component: CircuitComponent) => `${component.ref} · ${findCard(component.catalogId)?.model ?? component.valueOrModel}`;
/** 카드의 확인 방법을 한 동작씩으로 나눈다 */
const steps = (text: string) => text.split(/(?<=[.요])\s+(?=[가-힣A-Za-z①-⑩(])/).map((s) => s.trim()).filter(Boolean);

function rangeOf(card: LibraryCard, component: CircuitComponent | null): RungRange | null {
  const r = card.expectedRange;
  if (!r) return null;
  if (r.kind === "boolean") return { kind: "answer", expect: r.expect };
  if (r.kind === "derived_resistance") {
    const ohms = component ? parseOhms(component.valueOrModel) : null;
    return ohms ? { kind: "number", min: Math.round(ohms * 0.95), max: Math.round(ohms * 1.05), unit: "Ω", sourceUrl: null, sourceNote: `회로에 적힌 값(${component!.valueOrModel})의 ±5%` } : null;
  }
  // 출처 없는 숫자 범위는 쓰지 않는다. 값만 받고 "모름"으로 둔다.
  if (!card.sourceUrl && !card.sourceNote) return null;
  return { kind: "number", min: r.min, max: r.max, unit: r.unit, sourceUrl: card.sourceUrl, sourceNote: card.sourceNote ?? null };
}

function inputOf(card: LibraryCard, range: RungRange | null): RungInput {
  const question = card.expectedRange?.kind === "boolean" ? `${card.expectedRange.expect.replace(/[.。]$/, "")} — 맞나요?` : "기대한 대로였나요?";
  const kind = card.input ?? (card.meterMode && card.expectedRange?.kind !== "boolean" ? "number" : "yes_no");
  if (kind === "number") return { kind: "number", unit: range?.kind === "number" ? range.unit : card.expectedRange?.kind === "number" ? card.expectedRange.unit : card.meterMode === "저항(Ω)" ? "Ω" : "V" };
  if (kind === "serial_line") return { kind: "serial_line" };
  if (kind === "photo") return { kind: "photo", what: card.probePoints };
  return kind === "observe" ? { kind: "observe", question } : { kind: "yes_no", question };
}

function toRung(card: LibraryCard, ctx: { component: CircuitComponent | null; boardRef: string; meter: boolean; idSuffix?: string; range?: RungRange | null }): Rung {
  const { component, meter } = ctx;
  const partRef = component?.ref ?? null;
  const fill = (text: string) => text.replaceAll("{board}", ctx.boardRef).replaceAll("{part}", partRef ?? "부품");
  let range = ctx.range !== undefined ? ctx.range : rangeOf(card, component);
  let input = inputOf(card, range);
  if (range?.kind === "contains") input = { kind: "serial_line" };
  const needsMultimeter = card.meterMode != null;
  const alternative = card.noMeter ?? null;
  const usingAlternative = needsMultimeter && !meter && !!alternative;
  const unavailable = needsMultimeter && !meter && !alternative;
  let how = steps(fill(card.checkMethod));
  if (usingAlternative) {
    // 멀티미터가 없으면 정직하게 할 수 있는 확인으로 바꾼다. 숫자 범위는 쓸 수 없다.
    how = steps(alternative!.how);
    range = { kind: "answer", expect: alternative!.expect };
    input = { kind: "observe", question: `${alternative!.expect} — 맞나요?` };
  }
  return {
    id: `${card.id}${ctx.idSuffix ?? (partRef ? `:${partRef}` : "")}`, stage: stageOf(card), group: component && stageOf(card) === "parts" ? label(component) : null, partRef,
    title: fill(card.symptom), why: card.why ?? `흔한 원인: ${card.cause}`, how, meterMode: usingAlternative ? null : card.meterMode, probePoints: fill(card.probePoints),
    input, expectedRange: range, ifPass: fill(card.ifNormal), ifFail: fill(card.ifAbnormal),
    needsMultimeter, alternative, usingAlternative, unavailable, severity: card.severity
  };
}

/**
 * 프로젝트의 회로에서 사다리를 만든다. 순서는 고정이고, 칸은 회로에 실제로 있는 부품에서만 나온다.
 * 회로가 아직 없으면 빈 사다리와 안내를 돌려준다.
 */
export function buildLadder(project: Pick<LocalProject, "build" | "workflow">): Ladder {
  const meter = hasMeter(project.workflow?.profile);
  const components = project.build?.blueprint.components ?? [];
  if (!components.length) return { rungs: [], notes: ["회로를 제출하면, 그 회로에 맞춘 확인 순서가 여기에 만들어져요."], hasMultimeter: meter, cannotVerify: [] };

  const cardOf = (c: CircuitComponent): PartCard | null => findCard(c.catalogId);
  const board = components.find((c) => cardOf(c)?.type === "board") ?? null;
  const boardCard = board ? cardOf(board) : null;
  const boardRef = board?.ref ?? "보드";
  const ids = new Set(components.map((c) => c.catalogId).filter(Boolean) as string[]);
  const rungs: Rung[] = [];
  const notes: string[] = [];

  for (const card of TROUBLE_CARDS) {
    const w = card.appliesWhen;
    if (w.catalogIds) {
      for (const component of components.filter((c) => w.catalogIds!.includes(c.catalogId ?? ""))) rungs.push(toRung(card, { component, boardRef, meter }));
    } else if (w.interface) {
      // I2C: 부품마다 한 칸. 기대하는 주소는 그 부품 카드에 적힌 것만 쓴다.
      for (const component of components.filter((c) => cardOf(c)?.interface.some((name) => name.toUpperCase().startsWith(w.interface!.toUpperCase())) && cardOf(c)?.type !== "board")) {
        const part = cardOf(component)!;
        const range: RungRange | null = part.i2cAddresses.length
          ? { kind: "contains", anyOf: part.i2cAddresses, expect: `${part.i2cAddresses.join(" 또는 ")}${part.i2cAddresses.length > 1 ? " 중 하나가" : "이(가)"} 찍혀요`, sourceUrl: part.sourceUrls[0] ?? null, sourceNote: `부품 카드(${part.model})의 I2C 주소` }
          : null;
        const rung = toRung(card, { component, boardRef, meter, range });
        rungs.push({ ...rung, title: `${part.model}이(가) 보드에 보이는지 확인해요` });
      }
    } else if (w.needsAny) {
      if (w.needsAny.some((id) => ids.has(id))) rungs.push(toRung(card, { component: null, boardRef, meter }));
    } else if (w.always) {
      rungs.push(toRung(card, { component: null, boardRef, meter }));
    } else if (w.partTypes?.includes("board")) {
      if (boardCard) rungs.push(toRung(card, { component: null, boardRef, meter, idSuffix: "" }));
    } else if (w.boardHasPin) {
      if (boardCard?.pins.some((pin) => pin.roles.includes(w.boardHasPin!))) rungs.push(toRung(card, { component: null, boardRef, meter, idSuffix: "" }));
    } else if (w.boardLogic != null) {
      // 3.3V 보드에 5V 신호를 내는 부품이 있을 때만: 그 부품마다 한 칸.
      if (boardCard?.logicVoltage === w.boardLogic) for (const component of components.filter((c) => c.ref !== board?.ref && (cardOf(c)?.logicVoltage ?? 0) > w.boardLogic!)) rungs.push({ ...toRung(card, { component, boardRef, meter }), stage: "parts", group: label(component) });
    }
  }

  // 정해진 단계 순서로 세운다. ④ 안에서는 회로에 적힌 부품 순서를 따른다.
  const order = new Map(STAGES.map((stage, index) => [stage.id, index]));
  const refOrder = new Map(components.map((c, index) => [c.ref, index]));
  const sorted = rungs.map((rung, index) => ({ rung, index })).sort((a, b) =>
    order.get(a.rung.stage)! - order.get(b.rung.stage)!
    || (a.rung.stage === "parts" ? (refOrder.get(a.rung.partRef ?? "") ?? 999) - (refOrder.get(b.rung.partRef ?? "") ?? 999) : 0)
    || Number(b.rung.id === "board-power-led") - Number(a.rung.id === "board-power-led") // 전압을 재기 전에 표시등부터 본다
    || a.index - b.index).map((x) => x.rung);

  const unknownParts = components.filter((c) => !cardOf(c)).map((c) => `${c.ref}(${c.valueOrModel})`);
  if (unknownParts.length) notes.push(`부품 카드가 없어 전용 확인 칸을 만들지 못한 부품: ${unknownParts.join(", ")}. 이 부품은 달그락과 대화로 확인 방법을 정하고, 정상 범위는 데이터시트에서 확인해야 해요.`);
  if (!board) notes.push("회로에서 보드를 찾지 못해 보드 전원·업로드 칸 일부가 빠졌어요.");
  const cannotVerify = sorted.filter((rung) => rung.unavailable).map((rung) => rung.title);
  if (!meter) notes.push(cannotVerify.length ? `멀티미터가 없어서 눈과 시리얼 모니터로 할 수 있는 확인으로 바꿨어요. 다음 ${cannotVerify.length}가지는 멀티미터 없이는 확인할 수 없어요.` : "멀티미터가 없어서 눈과 시리얼 모니터로 할 수 있는 확인으로 바꿨어요.");
  return { rungs: sorted, notes, hasMultimeter: meter, cannotVerify };
}

/** 사람이 준 값으로 판정한다. 출처 있는 기준이 있을 때만 통과/범위 밖을 가르고, 없으면 모름이다. */
export function judge(rung: Pick<Rung, "expectedRange" | "input">, input: { value?: number | null; yes?: boolean | null; text?: string | null }): Verdict {
  const range = rung.expectedRange;
  const value = input.value ?? null;
  if (range?.kind === "number" && value != null && Number.isFinite(value)) {
    if (range.min != null && value < range.min) return "fail";
    if (range.max != null && value > range.max) return "fail";
    return "pass";
  }
  if (range?.kind === "contains" && input.text?.trim()) {
    const text = input.text.toLowerCase();
    if (range.anyOf.some((needle) => text.includes(needle.toLowerCase()))) return "pass";
    // 다른 주소가 찍혔거나 "찾지 못함"이면 범위 밖이다. 그 밖의 글은 판단하지 않는다.
    if (/0x[0-9a-f]{2}/i.test(text) || /no i2c devices|not found|없/i.test(text)) return "fail";
    return "unknown";
  }
  // 예/아니오는 사람이 본 것(또는 값을 본 달그락이 사람과 함께 내린 판단)이다.
  if (input.yes != null) return input.yes ? "pass" : "fail";
  return "unknown";
}

export class VerifyError extends Error {}

/** 한 칸의 결과를 적는다. 잠긴 칸에는 적을 수 없고, 아무 값 없이는 적을 수 없다. */
export function recordRung(ladder: Ladder, state: VerifyState, rungId: string, input: { value?: number | null; yes?: boolean | null; text?: string | null; photoNote?: string | null; skip?: string | null }, by: "person" | "agent", at = new Date().toISOString()): { state: VerifyState; result: RungResult; rung: Rung } {
  const view = viewLadder(ladder, state);
  const rung = view.stages.flatMap((stage) => stage.rungs).find((r) => r.id === rungId);
  if (!rung) throw new VerifyError("그 확인 칸을 찾을 수 없어요. 사다리를 다시 읽어 id를 확인해주세요.");
  if (rung.status === "locked") throw new VerifyError(`아직 열리지 않은 칸이에요. 앞 단계를 먼저 끝내야 해요. 지금 할 칸: ${view.current ? view.current.title : "없음"}`);
  const skip = input.skip?.trim();
  const has = (input.value != null && Number.isFinite(input.value)) || input.yes != null || !!input.text?.trim() || !!input.photoNote?.trim();
  if (!skip && !has) throw new VerifyError("적을 값이 없어요. 잰 숫자, 예/아니오, 시리얼 모니터의 줄 가운데 하나를 넣어주세요. 확인하지 않고 넘어가려면 건너뛰는 이유를 적어주세요.");
  const result: RungResult = {
    value: input.value != null && Number.isFinite(input.value) ? input.value : null, yes: input.yes ?? null, text: input.text?.trim() ?? "", photoNote: input.photoNote?.trim() ?? "", at, by,
    verdict: skip ? "unknown" : judge(rung, input), ...(skip ? { skipped: skip } : {})
  };
  return { state: { results: { ...state.results, [rungId]: result }, updatedAt: at }, result, rung };
}

/** 사다리에 지금까지의 결과를 얹어, 어디가 잠겼고 지금 어느 칸인지 계산한다. */
export function viewLadder(ladder: Ladder, state: VerifyState): LadderView {
  const counts = { pass: 0, fail: 0, unknown: 0, skipped: 0, unavailable: 0, total: ladder.rungs.length };
  let earlierDone = true;
  let current: Rung | null = null;
  const stages = STAGES.map((stage) => {
    const locked = !earlierDone;
    const rungs = ladder.rungs.filter((rung) => rung.stage === stage.id).map((rung) => {
      const result = state.results[rung.id] ?? null;
      let status: RungStatus;
      if (result?.skipped) status = "skipped";
      else if (result) status = result.verdict;
      else if (rung.unavailable) status = "unavailable";
      else status = locked ? "locked" : "todo";
      if (status === "todo" && !current) { current = rung; status = "current"; }
      if (status === "pass" || status === "fail" || status === "unknown" || status === "skipped" || status === "unavailable") counts[status]++;
      return { ...rung, status, result };
    });
    // 다음 단계가 열리려면: 모든 칸이 통과했거나, 사람이 이유를 적고 건너뛰었거나, 멀티미터가 없어 할 수 없는 칸이어야 한다.
    const done = rungs.every((rung) => rung.status === "pass" || rung.status === "skipped" || rung.status === "unavailable");
    if (!done) earlierDone = false;
    return { ...stage, locked, done, rungs };
  }).filter((stage) => stage.rungs.length > 0);
  // 범위 밖·모름으로 남은 칸이 있으면, 새 칸보다 그 칸을 먼저 풀어야 한다.
  const stuck = stages.find((stage) => !stage.locked && !stage.done)?.rungs.find((rung) => rung.status === "fail" || rung.status === "unknown") ?? null;
  return { stages, current: current ?? stuck, counts, notes: ladder.notes, hasMultimeter: ladder.hasMultimeter, cannotVerify: ladder.cannotVerify };
}

const rangeText = (range: RungRange | null) => !range ? "정상 범위: 확인 필요(출처 있는 기준이 없어요. 값을 받아 사람과 함께 판단하세요)"
  : range.kind === "number" ? `정상 범위: ${range.min ?? "−∞"}~${range.max ?? "∞"}${range.unit} (출처: ${range.sourceNote ?? range.sourceUrl})`
  : range.kind === "contains" ? `기대: ${range.expect} (출처: ${range.sourceNote ?? range.sourceUrl})` : `기대: ${range.expect}`;
const inputText = (input: RungInput) => input.kind === "number" ? `숫자(${input.unit})` : input.kind === "serial_line" ? "시리얼 모니터에 찍힌 줄을 그대로" : input.kind === "photo" ? `사진 (${input.what})` : "예/아니오";

/** 달그락에게 주는 요약: 사람이 어디에 있고, 다음에 무엇을 어떻게 받아야 하는지. */
export function ladderBrief(ladder: Ladder, state: VerifyState): string {
  const view = viewLadder(ladder, state);
  if (!ladder.rungs.length) return `[검증 사다리] ${ladder.notes.join(" ")}`;
  const lines = [`[검증 사다리] ${view.counts.total}칸 중 통과 ${view.counts.pass} · 범위 밖 ${view.counts.fail} · 모름 ${view.counts.unknown} · 건너뜀 ${view.counts.skipped}${view.counts.unavailable ? ` · 멀티미터 없어 못 함 ${view.counts.unavailable}` : ""}`];
  const where = view.stages.find((stage) => !stage.locked && !stage.done);
  lines.push(where ? `지금 단계: ${where.title}` : "모든 단계를 지났어요(건너뛴 칸은 통과가 아니에요).");
  for (const rung of view.stages.flatMap((stage) => stage.rungs)) {
    if (rung.status === "fail") lines.push(`범위 밖: ${rung.title} — 받은 값 ${rung.result!.value ?? (rung.result!.yes === false ? "아니오" : rung.result!.text)}${rung.input.kind === "number" && rung.result!.value != null ? rung.input.unit : ""}. 다음에 볼 것: ${rung.ifFail}`);
    if (rung.status === "unknown") lines.push(`모름(판단 필요): ${rung.title} — 받은 값 ${rung.result!.value ?? rung.result!.text}${rung.input.kind === "number" && rung.result!.value != null ? rung.input.unit : ""}. 사람과 함께 보고, 맞는지 사람에게 물어 예/아니오로 다시 기록하세요.`);
    if (rung.status === "skipped") lines.push(`건너뜀: ${rung.title} — ${rung.result!.skipped}`);
  }
  const next = view.current;
  if (next && !state.results[next.id]) {
    lines.push(`다음에 받을 칸 (id: ${next.id}): ${next.title}`, `- 왜: ${next.why}`, ...next.how.map((step, index) => `- 방법 ${index + 1}: ${step}`),
      ...(next.meterMode ? [`- 멀티미터 모드: ${next.meterMode} · 리드를 댈 곳: ${next.probePoints}`] : [`- 볼 곳: ${next.probePoints}`]),
      `- 사람이 돌려줄 것: ${inputText(next.input)}`, `- ${rangeText(next.expectedRange)}`);
  }
  if (view.cannotVerify.length) lines.push(`멀티미터 없이는 확인할 수 없는 것: ${view.cannotVerify.join(" / ")}`);
  for (const note of ladder.notes) lines.push(`참고: ${note}`);
  return lines.join("\n");
}
