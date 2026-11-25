import type { AgentId, LocalProject } from "./project-types";

// 작업대: 프로젝트의 일이 지금 누구 차례인지, 그리고 화면 밖 현실에서 무슨 일이
// 벌어지고 있는지를 한곳에 둔다.
//
// 대화는 대장간마다 따로 흐르지만 작업대는 하나다. 어느 대장간의 달그락이든 이것을 읽고
// 답하므로, HW 달그락도 "ME가 뚜껑 치수를 기다리는 중"과 "로드셀이 금요일에 온다"를
// 안다. 사람에게는 여기서 계산한 "지금 할 일 하나"와 대장간마다의 알림 수가 나간다.
//
// 좌표가 아니라 차례를 저장한다: 누가 다음에 움직여야 하는가.

export type CardTurn =
  | "agent"     // 달그락이 작업 중
  | "person"    // 사람의 확인·결정·측정·조립이 필요
  | "waiting"   // 현실 대기(배송, 출력, 예약, 접착제 굳기)
  | "blocked"   // 막힘: 무엇 때문인지 note에 적는다
  | "done";

export type WorkCard = {
  id: string;
  title: string;
  /** 무엇을 만들거나 정하는 카드인지 한두 문장 */
  detail: string;
  /** 담당 달그락. 이 카드의 대화는 그 달그락의 방에서 한다 */
  owner: AgentId;
  turn: CardTurn;
  /** turn=person: 사람에게 구체적으로 무엇을 해 달라는지 */
  ask?: string;
  /** turn=waiting: 무엇을 언제까지 기다리는지 */
  waiting?: { what: string; kind: "delivery" | "print" | "booking" | "curing" | "other"; expectedAt: string | null };
  /** turn=blocked 또는 참고 메모 */
  note?: string;
  /** 먼저 끝나야 하는 카드의 id */
  dependsOn: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
  history: Array<{ at: string; by: AgentId | "person"; turn: CardTurn; note: string }>;
};

export type Delivery = { label: string; ref?: string; status: "ordered" | "delayed" | "arrived" | "problem"; orderedAt?: string; expectedAt?: string | null; arrivedAt?: string; note?: string; updatedAt: string };
export type RealWorld = {
  /** 사람이 지금 손으로 하고 있는 일 (예: "납땜 3단계 하는 중") */
  now: { text: string; at: string } | null;
  /** 이번 주에 쓸 수 있는 시간 같은 여건 */
  availability: { text: string; at: string } | null;
  deliveries: Delivery[];
  /** 현실에서 일어난 일의 기록 (배송 지연, 부품 파손, 프린터 고장) */
  events: Array<{ at: string; text: string }>;
};
export type Board = { cards: WorkCard[]; real: RealWorld; updatedAt: string };

export const emptyReal = (): RealWorld => ({ now: null, availability: null, deliveries: [], events: [] });
export const emptyBoard = (): Board => ({ cards: [], real: emptyReal(), updatedAt: new Date(0).toISOString() });
export const boardOf = (project: Pick<LocalProject, "board">): Board => project.board ?? emptyBoard();

const DAY = 24 * 60 * 60 * 1000;
/** 날짜만 있는 값(2026-11-28)은 그날이 끝날 때까지를 기한으로 본다 */
function dueTime(value: string): number {
  const time = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59` : value).getTime();
  return Number.isFinite(time) ? time : NaN;
}

export type BoardView = {
  cards: Array<WorkCard & { /** 앞 카드가 안 끝나 아직 시작할 수 없다 */ heldBy: string[]; /** 지금 움직일 수 있는 카드인가 */ active: boolean; overdue: boolean }>;
  /** 사람이 지금 할 일 하나. 없으면 null */
  nextForPerson: { cardId: string; room: AgentId; title: string; ask: string } | null;
  /** 대장간마다 사람 차례인 카드 수 (알림 점) */
  rooms: Array<{ room: AgentId; myTurn: number; working: number; waiting: number; blocked: number; done: number; total: number }>;
  /** 예정일이 지난 기다림. 달그락이 다음 대화에서 먼저 물어야 한다 */
  overdue: Array<{ kind: "card" | "delivery"; label: string; expectedAt: string; daysLate: number }>;
  /** 기다리는 동안에도 할 수 있는 카드 */
  canDoMeanwhile: Array<{ cardId: string; room: AgentId; title: string; turn: CardTurn }>;
  progress: { done: number; total: number };
  real: RealWorld;
  /** 달그락에게 주는 한 문단 요약 */
  brief: string;
};

export function viewBoard(board: Board, now = Date.now()): BoardView {
  const byId = new Map(board.cards.map((card) => [card.id, card]));
  const cards = [...board.cards].sort((a, b) => a.order - b.order).map((card) => {
    const heldBy = card.dependsOn.filter((id) => byId.has(id) && byId.get(id)!.turn !== "done");
    const due = card.turn === "waiting" && card.waiting?.expectedAt ? dueTime(card.waiting.expectedAt) : NaN;
    return { ...card, heldBy, active: card.turn !== "done" && !heldBy.length, overdue: Number.isFinite(due) && due < now };
  });
  const mine = cards.filter((card) => card.active && card.turn === "person");
  const first = mine[0];
  const rooms = (["chief", "hw", "sw", "me", "id"] as AgentId[]).map((room) => {
    const own = cards.filter((card) => card.owner === room);
    const count = (turn: CardTurn) => own.filter((card) => card.turn === turn).length;
    return { room, myTurn: own.filter((card) => card.active && card.turn === "person").length, working: count("agent"), waiting: count("waiting"), blocked: count("blocked"), done: count("done"), total: own.length };
  }).filter((room) => room.total > 0);
  const late = (label: string, expectedAt: string, kind: "card" | "delivery") => ({ kind, label, expectedAt, daysLate: Math.max(1, Math.ceil((now - dueTime(expectedAt)) / DAY)) });
  const overdue = [
    ...cards.filter((card) => card.overdue).map((card) => late(`${card.title}: ${card.waiting!.what}`, card.waiting!.expectedAt!, "card")),
    ...board.real.deliveries.filter((d) => (d.status === "ordered" || d.status === "delayed") && d.expectedAt && dueTime(d.expectedAt) < now).map((d) => late(d.label, d.expectedAt!, "delivery"))
  ];
  const stalled = cards.some((card) => card.turn === "waiting" || card.turn === "blocked");
  const canDoMeanwhile = stalled ? cards.filter((card) => card.active && (card.turn === "agent" || card.turn === "person")).map((card) => ({ cardId: card.id, room: card.owner, title: card.title, turn: card.turn })) : [];
  const done = cards.filter((card) => card.turn === "done").length;

  const lines: string[] = [];
  if (!cards.length) lines.push("작업대에 작업 카드가 아직 없어요.");
  else lines.push(`작업 카드 ${cards.length}개 중 ${done}개 완료.`);
  if (first) lines.push(`사람이 지금 할 일: [${first.owner.toUpperCase()} 대장간] ${first.title} — ${first.ask ?? "확인 필요"}${mine.length > 1 ? ` (그 뒤로 ${mine.length - 1}개 더)` : ""}`);
  for (const card of cards.filter((c) => c.turn === "waiting")) lines.push(`현실 대기: ${card.title} — ${card.waiting?.what ?? "기다리는 중"}${card.waiting?.expectedAt ? ` (예정 ${card.waiting.expectedAt})` : " (예정일 모름)"}`);
  for (const card of cards.filter((c) => c.turn === "blocked")) lines.push(`막힘: ${card.title} — ${card.note ?? "이유 미기록"}`);
  for (const d of board.real.deliveries.filter((x) => x.status !== "arrived")) lines.push(`배송: ${d.label} ${{ ordered: "주문함", delayed: "지연", problem: "문제" }[d.status as "ordered" | "delayed" | "problem"]}${d.expectedAt ? ` · 도착 예정 ${d.expectedAt}` : ""}${d.note ? ` · ${d.note}` : ""}`);
  for (const o of overdue) lines.push(`예정일 지남(${o.daysLate}일): ${o.label} — 도착했는지, 끝났는지 먼저 물어보세요.`);
  if (board.real.now) lines.push(`사람이 지금 하는 일: ${board.real.now.text} (${board.real.now.at.slice(0, 16).replace("T", " ")} 기준)`);
  if (board.real.availability) lines.push(`사람의 여건: ${board.real.availability.text}`);
  if (canDoMeanwhile.length) lines.push(`기다리는 동안 할 수 있는 일: ${canDoMeanwhile.map((c) => `[${c.room.toUpperCase()}] ${c.title}`).join(", ")}`);

  return { cards, nextForPerson: first ? { cardId: first.id, room: first.owner, title: first.title, ask: first.ask ?? "확인이 필요해요" } : null, rooms, overdue, canDoMeanwhile, progress: { done, total: cards.length }, real: board.real, brief: lines.join("\n") };
}

export class BoardError extends Error {}

/** 대장이 카드를 정하거나 고친다. 이미 있는 id는 내용을 고치고 차례·기록은 지킨다. */
export function upsertCards(board: Board, input: Array<{ id: string; title: string; detail: string; owner: AgentId; dependsOn?: string[]; turn?: CardTurn; ask?: string }>, team: AgentId[], by: AgentId, now = new Date().toISOString()): Board {
  const ids = new Set(input.map((card) => card.id));
  if (ids.size !== input.length) throw new BoardError("카드 id가 겹쳐요.");
  const known = new Set([...board.cards.map((card) => card.id), ...ids]);
  const existing = new Map(board.cards.map((card) => [card.id, card]));
  const next = [...board.cards];
  input.forEach((card, index) => {
    if (card.owner !== "chief" && !team.includes(card.owner)) throw new BoardError(`${card.owner.toUpperCase()} 달그락은 팀에 없어요. set_team으로 먼저 팀에 넣어주세요.`);
    const deps = card.dependsOn ?? [];
    if (deps.includes(card.id)) throw new BoardError(`'${card.title}' 카드가 자기 자신을 기다려요.`);
    const missing = deps.filter((id) => !known.has(id));
    if (missing.length) throw new BoardError(`'${card.title}'이(가) 기다리는 카드를 찾을 수 없어요: ${missing.join(", ")}`);
    const turn = card.turn ?? "agent";
    if (turn === "person" && !card.ask?.trim()) throw new BoardError(`'${card.title}': 사람 차례로 두려면 무엇을 해 달라는지(ask)를 적어주세요.`);
    const before = existing.get(card.id);
    if (before) {
      const at = next.findIndex((c) => c.id === card.id);
      next[at] = { ...before, title: card.title, detail: card.detail, owner: card.owner, dependsOn: deps, order: index, updatedAt: now };
    } else {
      next.push({ id: card.id, title: card.title, detail: card.detail, owner: card.owner, turn, ...(card.ask ? { ask: card.ask } : {}), dependsOn: deps, order: index, createdAt: now, updatedAt: now, history: [{ at: now, by, turn, note: "카드를 만들었어요" }] });
    }
  });
  // 서로 기다리는 고리가 있으면 아무도 시작하지 못한다.
  const map = new Map(next.map((card) => [card.id, card]));
  const visiting = new Set<string>(); const safe = new Set<string>();
  const walk = (id: string): boolean => {
    if (safe.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const cyc = (map.get(id)?.dependsOn ?? []).some(walk);
    visiting.delete(id); safe.add(id);
    return cyc;
  };
  if (next.some((card) => walk(card.id))) throw new BoardError("카드들이 서로를 기다리고 있어요. 순서(dependsOn)를 다시 정해주세요.");
  return { ...board, cards: next, updatedAt: now };
}

export function moveCard(board: Board, cardId: string, change: { turn: CardTurn; ask?: string; waiting?: WorkCard["waiting"]; note?: string }, by: AgentId | "person", now = new Date().toISOString()): Board {
  const card = board.cards.find((c) => c.id === cardId);
  if (!card) throw new BoardError("작업 카드를 찾을 수 없어요. get_project의 board.cards에서 id를 확인하세요.");
  if (change.turn === "person" && !change.ask?.trim()) throw new BoardError("사람 차례로 넘기려면 무엇을 해 달라는지(ask)를 구체적으로 적어주세요. 예: '뚜껑 안쪽 폭을 캘리퍼스로 재서 mm로 알려주세요'");
  if (change.turn === "waiting" && !change.waiting?.what?.trim()) throw new BoardError("현실 대기로 두려면 무엇을 기다리는지(waiting.what)를 적어주세요.");
  if (change.turn === "blocked" && !change.note?.trim()) throw new BoardError("막혔다면 무엇 때문인지(note)를 적어주세요.");
  // 사람의 확인을 기다리던 카드를 달그락이 혼자 끝낼 수는 없다. 결정은 사람이 한다.
  if (change.turn === "done" && card.turn === "person" && by !== "person") throw new BoardError("사람의 확인을 기다리는 카드예요. 사람이 확인한 뒤(차례가 돌아온 뒤)에 완료로 바꿀 수 있어요.");
  const unfinished = card.dependsOn.filter((id) => board.cards.some((c) => c.id === id && c.turn !== "done"));
  if (change.turn === "done" && unfinished.length) throw new BoardError(`먼저 끝나야 하는 카드가 남아 있어요: ${unfinished.join(", ")}`);
  const next: WorkCard = { ...card, turn: change.turn, updatedAt: now, history: [...card.history, { at: now, by, turn: change.turn, note: (change.ask ?? change.waiting?.what ?? change.note ?? "").slice(0, 300) }].slice(-30) };
  delete next.ask; delete next.waiting;
  if (change.turn === "person") next.ask = change.ask!.trim();
  if (change.turn === "waiting") next.waiting = { what: change.waiting!.what.trim(), kind: change.waiting!.kind ?? "other", expectedAt: change.waiting!.expectedAt ?? null };
  if (change.note?.trim()) next.note = change.note.trim(); else if (change.turn !== "blocked") delete next.note;
  return { ...board, cards: board.cards.map((c) => (c.id === cardId ? next : c)), updatedAt: now };
}

export function recordReal(board: Board, input: { now?: string | null; availability?: string | null; event?: string; delivery?: { label: string; ref?: string; status: Delivery["status"]; expectedAt?: string | null; note?: string } }, at = new Date().toISOString()): Board {
  const real: RealWorld = { ...board.real, deliveries: [...board.real.deliveries], events: [...board.real.events] };
  if (input.now !== undefined) real.now = input.now?.trim() ? { text: input.now.trim(), at } : null;
  if (input.availability !== undefined) real.availability = input.availability?.trim() ? { text: input.availability.trim(), at } : null;
  if (input.event?.trim()) real.events = [...real.events, { at, text: input.event.trim() }].slice(-40);
  if (input.delivery) {
    const d = input.delivery;
    const key = (x: { label: string; ref?: string }) => (x.ref ?? x.label).trim().toLowerCase();
    const index = real.deliveries.findIndex((x) => key(x) === key(d));
    const before = index >= 0 ? real.deliveries[index] : null;
    const next: Delivery = {
      ...(before ?? {}), label: d.label.trim(), ...(d.ref ? { ref: d.ref } : {}), status: d.status, updatedAt: at,
      orderedAt: before?.orderedAt ?? at,
      ...(d.expectedAt !== undefined ? { expectedAt: d.expectedAt } : {}),
      ...(d.status === "arrived" ? { arrivedAt: at } : {}),
      ...(d.note !== undefined ? { note: d.note } : {})
    };
    if (index >= 0) real.deliveries[index] = next; else real.deliveries.push(next);
    // 일정이 밀린 것은 그 자체로 현실의 사건이다. 따로 적지 않아도 남긴다.
    if (before && before.expectedAt && d.expectedAt && before.expectedAt !== d.expectedAt) real.events = [...real.events, { at, text: `${next.label} 도착 예정이 ${before.expectedAt} → ${d.expectedAt}로 바뀌었어요` }].slice(-40);
    if (d.status === "arrived" && before?.status !== "arrived") real.events = [...real.events, { at, text: `${next.label} 도착` }].slice(-40);
  }
  return { ...board, real, updatedAt: at };
}
