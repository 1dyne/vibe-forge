import type { AgentId, ContractState, DesignBrief, DesignReference, DesignState, InterfaceContract, LocalProject } from "./project-types";

// Two things that keep parallel work from drifting apart:
// - the HW↔SW agreement (InterfaceContract): firmware and app are both built
//   against the version the person approved; a new draft needs approval, and
//   work made against an older version is flagged;
// - the design direction: reference cards → the person's picks → a brief the
//   person approves before ID/ME model anything.

export class AgreementError extends Error {}

export const TRANSPORT_LABEL: Record<InterfaceContract["transport"], string> = { wifi_sta: "Wi-Fi (공유기·핫스팟에 접속)", wifi_ap: "Wi-Fi (기기가 직접 와이파이를 띄움)", ble: "블루투스(BLE)", usb_serial: "USB 케이블(시리얼)", none: "통신 없음" };

const contractOf = (p: LocalProject): ContractState => p.workflow!.contract ?? { current: null, draft: null, history: [] };

export function proposeContract(p: LocalProject, draft: Omit<InterfaceContract, "version" | "at" | "approvedAt">): InterfaceContract {
  const state = contractOf(p);
  if (draft.transport === "ble" && !draft.ble?.characteristics.length) throw new AgreementError("BLE 약속에는 서비스와 특성(UUID)을 적어주세요.");
  if ((draft.transport === "wifi_sta" || draft.transport === "wifi_ap") && !draft.endpoints.length) throw new AgreementError("Wi-Fi 약속에는 주소(엔드포인트)를 하나 이상 적어주세요.");
  const contract: InterfaceContract = { ...draft, version: (state.current?.version ?? 0) + 1, at: new Date().toISOString(), approvedAt: null };
  p.workflow!.contract = { ...state, draft: contract };
  return contract;
}

// The person approves the draft: it becomes current, the design slots that
// describe the same thing are rewritten from it (so they cannot disagree),
// and open HW/SW tasks made against an older version are flagged.
export function approveContract(p: LocalProject): InterfaceContract {
  const state = contractOf(p);
  if (!state.draft) throw new AgreementError("승인할 연결 약속 초안이 없어요.");
  const approved = { ...state.draft, approvedAt: new Date().toISOString() };
  p.workflow!.contract = { current: approved, draft: null, history: [...state.history, ...(state.current ? [state.current] : [])].slice(-5) };
  const write = (key: "wireless" | "data_sink", text: string) => {
    const slot = p.slots.find((s) => s.key === key);
    if (slot) Object.assign(slot, { status: "filled", valueText: text, assumption: null, acknowledged: true });
  };
  write("wireless", `${TRANSPORT_LABEL[approved.transport]} · ${approved.summary} (연결 약속 v${approved.version})`);
  write("data_sink", approved.endpoints.length ? `${approved.endpoints.join(", ")} (연결 약속 v${approved.version})` : `기기 밖으로 보내지 않음 (연결 약속 v${approved.version})`);
  return approved;
}
export function rejectContract(p: LocalProject) {
  const state = contractOf(p);
  p.workflow!.contract = { ...state, draft: null };
}
export function staleForContract(p: LocalProject) {
  const current = p.workflow?.contract?.current;
  if (!current) return [];
  return p.tasks.filter((t) => (t.assignee === "hw" || t.assignee === "sw") && ["ready", "in_progress", "blocked"].includes(t.status) && t.contractVersion !== undefined && t.contractVersion < current.version).map((t) => ({ id: t.id, title: t.title, madeFor: t.contractVersion!, current: current.version }));
}
export const contractNeeded = (p: LocalProject) => p.buildPlan?.track === "both";

const designOf = (p: LocalProject): DesignState => p.workflow!.design ?? { refs: [], chosen: [], brief: null };

export function addReferences(p: LocalProject, refs: Array<Omit<DesignReference, "id" | "at" | "by">>, by: AgentId, replace: boolean): DesignReference[] {
  const state = designOf(p);
  const now = new Date().toISOString();
  for (const r of refs) {
    if (!/^https:\/\/\S+$/.test(r.url)) throw new AgreementError(`레퍼런스 링크는 https 주소여야 해요: ${r.title}`);
    if (r.imageUrl && !/^https:\/\/\S+$/.test(r.imageUrl)) throw new AgreementError(`이미지 주소는 https여야 해요: ${r.title}`);
  }
  const added = refs.map((r) => ({ ...r, id: crypto.randomUUID(), at: now, by }));
  const kept = replace ? state.refs.filter((r) => state.chosen.includes(r.id)) : state.refs;
  p.workflow!.design = { ...state, refs: [...kept, ...added].slice(-16) };
  return added;
}
export function pickReferences(p: LocalProject, ids: string[]) {
  const state = designOf(p);
  if (ids.some((id) => !state.refs.some((r) => r.id === id))) throw new AgreementError("없는 레퍼런스예요.");
  p.workflow!.design = { ...state, chosen: [...new Set(ids)] };
}
export function proposeBrief(p: LocalProject, brief: Omit<DesignBrief, "at" | "approvedAt" | "by">, by: AgentId): DesignBrief {
  const state = designOf(p);
  if (!state.chosen.length) throw new AgreementError("사람이 대시보드에서 레퍼런스를 고른 뒤에 디자인 방향을 정할 수 있어요.");
  const saved: DesignBrief = { ...brief, by, at: new Date().toISOString(), approvedAt: null };
  p.workflow!.design = { ...state, brief: saved };
  return saved;
}
export function approveBrief(p: LocalProject) {
  const state = designOf(p);
  if (!state.brief) throw new AgreementError("승인할 디자인 방향이 없어요.");
  p.workflow!.design = { ...state, brief: { ...state.brief, approvedAt: new Date().toISOString() } };
}

export const APPROACH_LABEL: Record<DesignBrief["approach"], string> = { parametric: "치수 중심 (CadQuery)", loft: "부드러운 곡면 (실루엣 → build123d loft)", organic: "유기적 형태 (SDF·Blender)" };

// Low-power budget: average current from each mode's share of the day, and
// battery days from the capacity (with a 0.7 factor for conversion losses
// and battery ageing). Unknown capacity leaves the estimate empty.
export function powerBudget(power: NonNullable<NonNullable<LocalProject["buildPlan"]>["power"]>) {
  const hours = power.modes.reduce((sum, m) => sum + m.hoursPerDay, 0);
  if (hours > 24.01) throw new AgreementError(`모드별 하루 시간의 합이 ${hours}시간이에요. 24시간 이하로 맞춰주세요.`);
  const mAhPerDay = power.modes.reduce((sum, m) => sum + m.currentMa * m.hoursPerDay, 0);
  const averageMa = Math.round((mAhPerDay / 24) * 100) / 100;
  const estimatedDays = power.capacityMah && mAhPerDay > 0 ? Math.round((power.capacityMah * 0.7 / mAhPerDay) * 10) / 10 : null;
  return { ...power, averageMa, estimatedDays };
}
