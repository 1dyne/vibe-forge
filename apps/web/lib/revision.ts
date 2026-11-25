import type { AgentId, AssemblyGuide, BuildResult, CircuitComponent, HousingPlan, LocalProject, ProductForm, ProjectTask } from "./project-types";
import type { MockupSpec } from "./mockup";

// 제작 후 수정: 승인된 설계를 고치는 길.
//
// 하드웨어는 출력하고 조립한 뒤에 반드시 고쳐진다(구멍이 1mm 낮다, 부품이 바뀌었다).
// 예전에는 '설계 다시 논의'로 프로젝트 전체를 아이디어 단계로 되돌리는 길뿐이었고,
// 무엇이 바뀌는지도, 이미 한 일 가운데 무엇을 다시 해야 하는지도 알려주지 않았다.
//
// 여기서는 달그락이 "수정안"을 낸다. 수정안은 승인본을 건드리지 않고 따로 저장되고,
// 서버가 승인본과 견줘 바뀌는 것과 사람이 다시 할 일을 계산한다. 사람이 작업대에서
// 승인해야 그때 적용된다. 결정은 사람이 한다.
//
// 이 파일은 계산만 한다(Node 모듈 없음). id와 시각은 부르는 쪽이 준다.

/** 수정안이 바꾸는 것. 바꾸는 항목만 통째로 새 값을 담는다 */
export type RevisionChanges = {
  /** 회로: 새 부품·배선으로 다시 만든 빌드 결과 */
  build?: BuildResult;
  productForm?: ProductForm;
  preciseMockup?: MockupSpec;
  housing?: HousingPlan;
  assembly?: AssemblyGuide;
};
export type RevisionField = keyof RevisionChanges;
export const REVISION_FIELDS: RevisionField[] = ["build", "productForm", "preciseMockup", "housing", "assembly"];
const FIELD_LABEL: Record<RevisionField, string> = { build: "회로", productForm: "완성품 형태", preciseMockup: "정밀 목업", housing: "하우징", assembly: "조립 가이드" };

export type RedoTask = { kind: ProjectTask["kind"]; title: string; plain: string };
export type Impact = {
  /** 바뀌는 항목 (회로, 하우징 …) */
  fields: string[];
  /** 바뀌는 것: 사람이 읽는 문장 */
  changes: string[];
  parts: { added: string[]; removed: string[]; swapped: string[] };
  /** 옮기거나 새로 잇거나 떼는 선 */
  wiring: string[];
  /** 가격을 아는 것만 더하고 뺀다. 모르는 부품은 unknown에 이름을 남긴다 */
  cost: { addKRW: number; saveKRW: number; unknown: string[] };
  /** 이미 한 일 가운데 더는 유효하지 않은 것 */
  invalidated: { purchases: string[]; assemblySteps: string[]; firmware: boolean; reprint: string[]; tests: string[] };
  /** 사람이 다시 할 일 */
  redo: RedoTask[];
  /** 승인본과 달라지는 것이 하나도 없다 */
  empty: boolean;
};

export type RevisionProposal = {
  id: string;
  title: string;
  /** 현실에서 무슨 일이 있었나 (예: 출력해 보니 USB 구멍이 1mm 낮음) */
  reason: string;
  by: AgentId;
  createdAt: string;
  status: "proposed" | "approved" | "rejected" | "superseded";
  changes: RevisionChanges;
  impact: Impact;
  decidedAt?: string;
  /** 승인할 때 덮어쓴 예전 값. 나중에 무엇이 어떻게 바뀌었는지 보여주려고 남긴다 */
  previous?: RevisionChanges;
};
export type RevisionState = { proposals: RevisionProposal[] };

export class RevisionError extends Error {}

export const revisionOf = (project: Pick<LocalProject, "revision">): RevisionState => project.revision ?? { proposals: [] };
export const pendingProposals = (project: Pick<LocalProject, "revision">) => revisionOf(project).proposals.filter((p) => p.status === "proposed");

// ── 견주기 ───────────────────────────────────────────────────────────────────

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;
const norm = (value: string) => value.toLowerCase().replace(/[\s()·\-_/.,]+/g, "");
const partName = (c: CircuitComponent) => `${c.ref} ${c.valueOrModel}`;
const PURCHASE: Record<string, string> = { ordered: "주문한", received: "받은" };

type Project = Pick<LocalProject, "build" | "productForm" | "preciseMockup" | "housing" | "assembly" | "buildPlan" | "workflow" | "assemblyReports" | "testPlan">;

/** 설계도의 모듈 가격에서 부품 값을 찾는다. 이름이 서로를 포함할 때만 같은 부품으로 본다. 못 찾으면 null(모름) */
function priceOf(project: Project, component: CircuitComponent): number | null {
  const target = norm(component.valueOrModel);
  if (target.length < 3) return null;
  for (const module of project.buildPlan?.modules ?? []) {
    const name = norm(module.part);
    if (name.length >= 3 && (name.includes(target) || target.includes(name))) return module.estPriceKRW;
  }
  return null;
}

/** 수정안을 지금의 프로젝트와 견줘, 바뀌는 것과 사람이 다시 할 일을 계산한다 */
export function computeImpact(project: Project, changes: RevisionChanges): Impact {
  const impact: Impact = { fields: [], changes: [], parts: { added: [], removed: [], swapped: [] }, wiring: [], cost: { addKRW: 0, saveKRW: 0, unknown: [] }, invalidated: { purchases: [], assemblySteps: [], firmware: false, reprint: [], tests: [] }, redo: [], empty: true };
  const reprint = new Set<string>();
  const redo = (task: RedoTask) => { if (!impact.redo.some((t) => t.title === task.title)) impact.redo.push(task); };
  const purchases = project.workflow?.purchases ?? {};
  const doneSteps = new Set((project.assemblyReports ?? []).map((r) => r.step));

  // ── 회로 ──
  const before = project.build?.blueprint;
  const after = changes.build?.blueprint;
  let circuitChanged = false;
  const touchedRefs = new Set<string>();
  const touchedPins = new Set<string>();
  if (after && before) {
    const old = new Map(before.components.map((c) => [c.ref, c]));
    const next = new Map(after.components.map((c) => [c.ref, c]));
    const addCost = (c: CircuitComponent) => { const price = priceOf(project, c); if (price == null) impact.cost.unknown.push(c.valueOrModel); else impact.cost.addKRW += price; };
    const dropped = (c: CircuitComponent) => {
      const status = purchases[c.ref];
      if (status === "ordered" || status === "received") impact.invalidated.purchases.push(`${partName(c)} — 이미 ${PURCHASE[status]} 부품인데 더 쓰지 않아요`);
      else { const price = priceOf(project, c); if (price != null) impact.cost.saveKRW += price; }
    };
    for (const c of after.components) {
      const was = old.get(c.ref);
      if (!was) { impact.parts.added.push(partName(c)); touchedRefs.add(c.ref); addCost(c); }
      else if (was.valueOrModel !== c.valueOrModel || was.type !== c.type) { impact.parts.swapped.push(`${c.ref}: ${was.valueOrModel} → ${c.valueOrModel}`); touchedRefs.add(c.ref); addCost(c); dropped(was); }
      else if ((was.connection ?? "") !== (c.connection ?? "")) { impact.changes.push(`${partName(c)}의 연결 방식이 바뀌어요`); touchedRefs.add(c.ref); }
    }
    for (const c of before.components) if (!next.has(c.ref)) { impact.parts.removed.push(partName(c)); touchedRefs.add(c.ref); dropped(c); }

    // 선: 핀마다 어느 선(net)에 물려 있는지를 견준다.
    const pinNet = (nets: typeof before.nets) => new Map(nets.flatMap((net) => net.members.map((member) => [member, net.name] as const)));
    const [oldPins, newPins] = [pinNet(before.nets), pinNet(after.nets)];
    for (const [pin, net] of newPins) {
      const was = oldPins.get(pin);
      if (was === undefined) { impact.wiring.push(`새로 잇기: ${pin} → ${net} 선`); touchedPins.add(pin); }
      else if (was !== net) { impact.wiring.push(`옮기기: ${pin}을(를) ${was} 선에서 ${net} 선으로`); touchedPins.add(pin); }
    }
    for (const [pin, net] of oldPins) if (!newPins.has(pin)) { impact.wiring.push(`떼기: ${pin} (${net} 선)`); touchedPins.add(pin); }

    const firmwareChanged = !same(before.firmware, after.firmware) || before.board !== after.board;
    circuitChanged = touchedRefs.size > 0 || impact.wiring.length > 0 || firmwareChanged || before.supplyVoltage !== after.supplyVoltage;
    if (circuitChanged) {
      impact.fields.push(FIELD_LABEL.build);
      if (before.board !== after.board) impact.changes.push(`보드가 ${before.board}에서 ${after.board}(으)로 바뀌어요`);
      if (before.supplyVoltage !== after.supplyVoltage) impact.changes.push(`전원 전압이 ${before.supplyVoltage}V에서 ${after.supplyVoltage}V로 바뀌어요`);
      for (const text of impact.parts.added) impact.changes.push(`부품 추가: ${text}`);
      for (const text of impact.parts.removed) impact.changes.push(`부품 빼기: ${text}`);
      for (const text of impact.parts.swapped) impact.changes.push(`부품 교체: ${text}`);
      if (impact.wiring.length) impact.changes.push(`선 ${impact.wiring.length}곳이 바뀌어요`);
      if (firmwareChanged && !impact.wiring.length && !touchedRefs.size) impact.changes.push("보드에 올리는 코드가 바뀌어요");

      impact.invalidated.firmware = true;
      redo({ kind: "run_firmware", title: "수정된 코드 다시 올리기", plain: "회로가 바뀌어서 보드 안의 프로그램도 바뀌었어요. 작업대에서 새 코드 파일을 내려받아 보드에 다시 올리고, 잘 도는지 알려주세요." });
      const buy = [...impact.parts.added, ...impact.parts.swapped];
      if (buy.length) redo({ kind: "confirm_availability", title: "바뀐 부품 구하기", plain: `새로 필요한 부품이에요: ${buy.join(", ")}. 가지고 있는지 먼저 보고, 없으면 같은 모델명으로 가격과 재고를 확인해 주세요.` });
      if (impact.invalidated.purchases.length) redo({ kind: "provide_info", title: "안 쓰게 된 부품 처리", plain: `${impact.invalidated.purchases.map((t) => t.split(" — ")[0]).join(", ")}은(는) 이번 수정으로 쓰지 않게 됐어요. 아직 배송 전이면 취소할 수 있는지, 받았다면 반품하거나 다음에 쓸지 정해 알려주세요.` });
      if (impact.wiring.length) redo({ kind: "provide_info", title: "선 다시 잇기", plain: `전원을 뺀 뒤 아래 순서로 고쳐 주세요.\n${impact.wiring.map((line) => `- ${line}`).join("\n")}\n다 하면 알려주세요. 납땜한 선이면 떼기 전에 사진을 한 장 찍어 두세요.` });

      for (const test of project.testPlan?.cases ?? []) if (test.result && test.result.status !== "unknown") impact.invalidated.tests.push(`${test.stage}단계 ${test.title} (${test.result.status === "pass" ? "통과" : "실패"} 기록)`);
      if (impact.invalidated.tests.length) redo({ kind: "run_firmware", title: "테스트 다시 하기", plain: `회로가 바뀌어 예전 테스트 결과는 더 믿을 수 없어요. 다시 확인할 것: ${impact.invalidated.tests.map((t) => t.replace(/ \(.*\)$/, "")).join(", ")}` });
    }
  } else if (after && !before) {
    circuitChanged = true;
    impact.fields.push(FIELD_LABEL.build);
    impact.changes.push("회로가 새로 생겨요");
  }

  // ── 조립 가이드 ──
  const guide = project.assembly;
  if (changes.assembly && !same(strip(guide), strip(changes.assembly))) {
    impact.fields.push(FIELD_LABEL.assembly);
    const next = changes.assembly;
    const count = Math.max(guide?.steps.length ?? 0, next.steps.length);
    let differing = 0;
    for (let i = 0; i < count; i++) {
      if (same(guide?.steps[i], next.steps[i])) continue;
      differing++;
      if (doneSteps.has(i + 1) && guide?.steps[i]) impact.invalidated.assemblySteps.push(`${i + 1}단계 「${guide.steps[i].title}」`);
    }
    impact.changes.push(guide ? `조립 순서 ${differing}단계가 바뀌어요` : "조립 가이드가 새로 생겨요");
  } else if (circuitChanged && guide) {
    // 회로만 바뀌고 가이드는 그대로면, 바뀐 부품·핀을 다루는 단계가 틀린 안내가 된다.
    const stale = guide.steps.map((step, index) => ({ step, index })).filter(({ step }) => step.place.some((ref) => touchedRefs.has(ref)) || step.wires.some((wire) => [wire.from, wire.to].some((pin) => touchedPins.has(pin) || touchedRefs.has(pin.split(".")[0]))));
    for (const { step, index } of stale) if (doneSteps.has(index + 1)) impact.invalidated.assemblySteps.push(`${index + 1}단계 「${step.title}」`);
    if (stale.length) {
      impact.changes.push(`조립 가이드 ${stale.length}단계가 예전 회로 기준이라 고쳐야 해요`);
      redo({ kind: "provide_info", title: "고친 조립 가이드 받기", plain: `회로가 바뀌어 조립 가이드의 ${stale.map(({ index }) => `${index + 1}단계`).join(", ")}가 맞지 않아요. 달그락에게 "조립 가이드를 바뀐 회로에 맞게 고쳐줘"라고 말해 주세요.` });
    }
  }
  if (impact.invalidated.assemblySteps.length) redo({ kind: "provide_info", title: "조립 다시 하기", plain: `이미 한 조립 가운데 다시 해야 하는 단계예요: ${impact.invalidated.assemblySteps.join(", ")}. 전원을 빼고, 고친 가이드를 보며 그 단계부터 다시 해 주세요.` });

  // ── 형태 · 정밀 목업 · 하우징 → 무엇을 다시 뽑아야 하나 ──
  const regions = (changes.housing ?? project.housing)?.regions ?? [];
  const form = project.productForm;
  if (changes.productForm && !same(strip(form), strip(changes.productForm))) {
    impact.fields.push(FIELD_LABEL.productForm);
    const next = changes.productForm;
    const shapeChanged = new Set<number>();
    for (let i = 0; i < Math.max(form?.shape.length ?? 0, next.shape.length); i++) if (!same(form?.shape[i], next.shape[i])) shapeChanged.add(i);
    for (const i of shapeChanged) impact.changes.push(next.shape[i] ? `겉모양 「${next.shape[i].name}」의 크기나 자리가 바뀌어요` : `겉모양 「${form!.shape[i].name}」이(가) 없어져요`);
    const featuresChanged = !same(form?.features, next.features);
    const internalsChanged = !same(form?.internals, next.internals);
    if (featuresChanged) impact.changes.push("겉에 보이는 구멍·버튼·화면의 자리가 바뀌어요");
    if (internalsChanged) impact.changes.push("안에 들어가는 부품의 자리가 바뀌어요");
    if (form?.material !== next.material) impact.changes.push(`재질·마감이 「${next.material}」(으)로 바뀌어요`);
    const hit = regions.filter((region) => region.shapeRefs.some((ref) => shapeChanged.has(ref)));
    // 구멍·버튼만 옮겨도 그 면이 있는 부위는 다시 만들어야 한다. 어느 부위인지 가릴 수 없으면 여는 곳이 있는 부위를 든다.
    const byFeature = featuresChanged ? regions.filter((region) => region.access && region.access.purpose !== "none") : [];
    for (const region of [...hit, ...byFeature]) reprint.add(region.name);
    if (!regions.length && (shapeChanged.size || featuresChanged)) reprint.add("하우징 전체(부위를 아직 나누지 않았어요)");
  }
  const mockup = project.preciseMockup;
  if (changes.preciseMockup && !same(strip(mockup), strip(changes.preciseMockup))) {
    impact.fields.push(FIELD_LABEL.preciseMockup);
    const next = changes.preciseMockup;
    const old = new Map((mockup?.parts ?? []).map((part) => [part.id, part]));
    const seen = new Set<string>();
    for (const part of next.parts) {
      seen.add(part.id);
      const was = old.get(part.id);
      if (same(was, part)) continue;
      const label = part.group === "housing" ? "하우징 부위" : part.group === "measured" ? "실물 부품" : "비워 둘 자리";
      impact.changes.push(`${label} 「${part.name}」${was ? "의 치수나 자리가 바뀌어요" : "이(가) 새로 생겨요"}`);
      if (part.group === "housing") reprint.add(regions.find((region) => region.name === part.name)?.name ?? part.name);
    }
    for (const part of mockup?.parts ?? []) if (!seen.has(part.id)) { impact.changes.push(`「${part.name}」이(가) 없어져요`); }
    if (!same(mockup?.rules, next.rules) || !same(mockup?.mates, next.mates)) impact.changes.push("맞춰 보는 검사 규칙이 바뀌어요");
  }
  if (changes.housing && !same(strip(project.housing), strip(changes.housing))) {
    impact.fields.push(FIELD_LABEL.housing);
    const old = new Map((project.housing?.regions ?? []).map((region) => [region.id, region]));
    const made = (region: HousingPlan["regions"][number]) => ({ shapeRefs: region.shapeRefs, method: region.method, material: region.material, join: region.join, toleranceMm: region.toleranceMm, access: region.access, process: region.process });
    for (const region of changes.housing.regions) {
      const was = old.get(region.id);
      if (!was) { impact.changes.push(`하우징 부위 「${region.name}」이(가) 새로 생겨요`); reprint.add(region.name); }
      else if (!same(made(was), made(region))) { impact.changes.push(`하우징 부위 「${region.name}」을(를) 만드는 방법이나 치수가 바뀌어요`); reprint.add(region.name); }
    }
    for (const region of project.housing?.regions ?? []) if (!changes.housing.regions.some((r) => r.id === region.id)) impact.changes.push(`하우징 부위 「${region.name}」이(가) 없어져요`);
  }
  impact.invalidated.reprint = [...reprint];
  if (reprint.size) redo({ kind: "provide_info", title: "하우징 다시 만들기", plain: `다시 만들어야 하는 부위예요: ${[...reprint].join(", ")}. 작업대에서 새 파일을 내려받아 그 부위만 다시 뽑고(또는 다시 잘라), 부품을 넣어 보고 맞는지 알려주세요. 나머지 부위는 그대로 써도 돼요.` });
  if (reprint.size || impact.fields.includes(FIELD_LABEL.preciseMockup)) redo({ kind: "measure", title: "고친 자리 실물로 확인", plain: "다시 만든 부위에 실제 부품을 넣어 보고, 걸리는 곳이나 헐거운 곳이 있으면 자나 캘리퍼스로 재서 mm로 알려주세요. 사진도 좋아요." });

  impact.empty = impact.fields.length === 0;
  return impact;
}

/** updatedAt처럼 저장할 때마다 바뀌는 값은 견줄 때 뺀다 */
function strip<T>(value: T): unknown {
  if (!value || typeof value !== "object") return value;
  const { updatedAt: _updatedAt, ...rest } = value as Record<string, unknown>;
  return rest;
}

/** 달그락과 사람에게 보여줄 글 */
export function impactText(impact: Impact): string {
  if (impact.empty) return "지금 설계와 달라지는 것이 없어요.";
  const lines: string[] = [`바뀌는 항목: ${impact.fields.join(", ")}`];
  if (impact.changes.length) lines.push("바뀌는 것:", ...impact.changes.map((text) => `- ${text}`));
  if (impact.wiring.length) lines.push("선:", ...impact.wiring.map((text) => `- ${text}`));
  lines.push(`비용: ${costText(impact)}`);
  const lost = [...impact.invalidated.purchases, ...impact.invalidated.assemblySteps.map((s) => `조립 ${s} — 다시 해야 해요`), ...impact.invalidated.tests.map((t) => `테스트 ${t} — 다시 확인해야 해요`), ...impact.invalidated.reprint.map((r) => `하우징 「${r}」 — 다시 만들어야 해요`), ...(impact.invalidated.firmware ? ["보드에 올린 코드 — 다시 올려야 해요"] : [])];
  if (lost.length) lines.push("이미 한 일 가운데 다시 해야 하는 것:", ...lost.map((text) => `- ${text}`));
  if (impact.redo.length) lines.push("사람이 다시 할 일:", ...impact.redo.map((task, index) => `${index + 1}. ${task.title}`));
  return lines.join("\n");
}

export function costText(impact: Impact): string {
  const { addKRW, saveKRW, unknown } = impact.cost;
  const net = addKRW - saveKRW;
  const known = addKRW === 0 && saveKRW === 0 ? (unknown.length ? "" : "달라지지 않아요") : net > 0 ? `약 ${won(net)} 더 들어요` : net < 0 ? `약 ${won(-net)} 줄어요` : "더하고 빼면 같아요";
  const more = unknown.length ? `가격 모름: ${[...new Set(unknown)].join(", ")} (사기 전에 확인)` : "";
  return [known, more].filter(Boolean).join(" · ");
}

// ── 수정안 올리기 · 승인 · 거절 ───────────────────────────────────────────────

const MAX_PROPOSALS = 20;

export function createProposal(project: LocalProject, input: { title: string; reason: string; by: AgentId; changes: RevisionChanges }, id: string, now: string): { state: RevisionState; proposal: RevisionProposal } {
  if (!project.build && !project.productForm) throw new RevisionError("아직 고칠 설계가 없어요. 완성품 형태나 회로가 정해진 뒤에 수정안을 낼 수 있어요.");
  const changes = Object.fromEntries(REVISION_FIELDS.filter((field) => input.changes[field] !== undefined).map((field) => [field, input.changes[field]])) as RevisionChanges;
  if (!Object.keys(changes).length) throw new RevisionError("무엇을 바꿀지 하나 이상 넣어주세요 (회로, 완성품 형태, 정밀 목업 가운데).");
  const impact = computeImpact(project, changes);
  if (impact.empty) throw new RevisionError("지금 설계와 달라지는 것이 없어요. 바꿀 값을 넣었는지 확인해주세요.");
  const proposal: RevisionProposal = { id, title: input.title.trim(), reason: input.reason.trim(), by: input.by, createdAt: now, status: "proposed", changes, impact };
  const state = revisionOf(project);
  // 같은 항목을 고치는 예전 수정안은 새 것으로 갈음한다. 둘 다 승인되면 뒤의 것이 앞의 것을 조용히 덮는다.
  const proposals = state.proposals.map((p) => (p.status === "proposed" && REVISION_FIELDS.some((field) => p.changes[field] !== undefined && changes[field] !== undefined) ? { ...p, status: "superseded" as const, decidedAt: now } : p));
  return { state: { proposals: [...proposals, proposal].slice(-MAX_PROPOSALS) }, proposal };
}

/** 기록에 남기는 예전 빌드는 파일 본문을 줄인다(펌웨어·문서 전문이 수정안마다 쌓이지 않게) */
function slim(build: BuildResult): BuildResult {
  return { ...build, artifacts: build.artifacts.map((a) => ({ ...a, content: a.content.length > 1500 ? `${a.content.slice(0, 1500)}\n… (기록에서는 앞부분만 보관)` : a.content })) };
}

/**
 * 사람이 승인한 수정안을 프로젝트에 적용한다(받은 project를 직접 고친다).
 * 다른 단계의 승인(회로 승인, 3D 승인)은 건드리지 않는다. 승인한 설계를 고친 것이지 승인을 무른 것이 아니다.
 */
export function applyProposal(project: LocalProject, proposalId: string, now: string, newId: () => string): RevisionProposal {
  const state = revisionOf(project);
  const proposal = state.proposals.find((p) => p.id === proposalId);
  if (!proposal) throw new RevisionError("수정안을 찾을 수 없어요.");
  if (proposal.status !== "proposed") throw new RevisionError(proposal.status === "approved" ? "이미 승인한 수정안이에요." : "더는 승인할 수 없는 수정안이에요. 달그락에게 새 수정안을 부탁해주세요.");
  // 수정안을 낸 뒤에 설계가 또 바뀌었을 수 있다. 지금 기준으로 다시 계산한 것을 남긴다.
  const impact = computeImpact(project, proposal.changes);
  const previous: RevisionChanges = {};
  const c = proposal.changes;
  if (c.build) { if (project.build) previous.build = slim(project.build); project.build = c.build; }
  if (c.productForm) { if (project.productForm) previous.productForm = project.productForm; project.productForm = { ...c.productForm, updatedAt: now }; }
  if (c.preciseMockup) { if (project.preciseMockup) previous.preciseMockup = project.preciseMockup; project.preciseMockup = { ...c.preciseMockup, updatedAt: now }; }
  if (c.housing) { if (project.housing) previous.housing = project.housing; project.housing = { ...c.housing, updatedAt: now }; }
  if (c.assembly) { if (project.assembly) previous.assembly = project.assembly; project.assembly = { ...c.assembly, updatedAt: now }; }

  // 회로가 바뀌었으면 예전 테스트 결과는 '모름'으로 돌린다. 지우지 않고, 왜 모름인지 남긴다.
  if (impact.invalidated.tests.length && project.testPlan) {
    project.testPlan = { ...project.testPlan, cases: project.testPlan.cases.map((test) => (test.result && test.result.status !== "unknown" ? { ...test, result: { status: "unknown" as const, evidence: `설계가 바뀌어 다시 확인해야 해요 (이전 기록: ${test.result.status === "pass" ? "통과" : "실패"} · ${test.result.evidence})`.slice(0, 600), at: now, by: "claude" as const } } : test)) };
  }
  // 다시 할 일. 같은 제목의 열린 일이 이미 있으면 또 만들지 않는다.
  for (const task of impact.redo) {
    if (project.tasks.some((t) => t.title === task.title && t.status === "ready")) continue;
    project.tasks.push({ id: newId(), kind: task.kind, title: task.title, plain: task.plain, status: "ready" });
  }
  const approved: RevisionProposal = { ...proposal, status: "approved", decidedAt: now, impact, previous };
  project.revision = { proposals: state.proposals.map((p) => (p.id === proposalId ? approved : p)) };
  return approved;
}

export function rejectProposal(project: LocalProject, proposalId: string, now: string): RevisionProposal {
  const state = revisionOf(project);
  const proposal = state.proposals.find((p) => p.id === proposalId);
  if (!proposal) throw new RevisionError("수정안을 찾을 수 없어요.");
  if (proposal.status !== "proposed") throw new RevisionError("이미 결정한 수정안이에요.");
  const rejected: RevisionProposal = { ...proposal, status: "rejected", decidedAt: now };
  project.revision = { proposals: state.proposals.map((p) => (p.id === proposalId ? rejected : p)) };
  return rejected;
}

/** 화면과 도구 응답에 내보낼 때는 통째 값(새 빌드, 예전 빌드)을 빼고 요약만 준다 */
export function proposalSummary(proposal: RevisionProposal) {
  return { id: proposal.id, title: proposal.title, reason: proposal.reason, by: proposal.by, createdAt: proposal.createdAt, status: proposal.status, decidedAt: proposal.decidedAt ?? null, fields: proposal.impact.fields, impact: proposal.impact, cost: costText(proposal.impact) };
}
