import type { AgentId, LocalProject } from "./project-types";

// 작업대: 프로젝트의 일이 지금 누구 차례인지, 그리고 화면 밖 현실에서 무슨 일이
// 벌어지고 있는지를 한곳에 둔다.
//
// 대화는 대장간마다 따로 흐르지만 작업대는 하나다. 어느 대장간의 달그락이든 이것을 읽고
// 답하므로, EE 달그락도 "ME가 뚜껑 치수를 기다리는 중"과 "로드셀이 금요일에 온다"를
// 안다. 사람에게는 여기서 계산한 "지금 할 일 하나"와 대장간마다의 알림 수가 나간다.
//
// 좌표가 아니라 차례를 저장한다: 누가 다음에 움직여야 하는가.

export type CardTurn =
  | "agent"     // 달그락이 작업 중
  | "person"    // 사람의 확인·결정·측정·조립이 필요
  | "waiting"   // 현실 대기(배송, 출력, 예약, 접착제 굳기)
  | "blocked"   // 막힘: 무엇 때문인지 note에 적는다
  | "done";

// 사람에게 차례를 넘기는 세 가지 방식.
//   요청(request)  : 사실을 알려 달라. 재서, 세어서, 확인해서 적는 칸(폼)으로 받는다.
//   질문(question) : 사람의 뜻을 더 구체화한다. 고를 수 있는 보기와 그 차이를 준다.
//   제안(proposal) : 병목이나 충돌이 생겼을 때 길을 고르게 한다. 보기마다 무엇이 달라지는지 적는다.
export type PromptField = { id: string; label: string; kind: "number" | "text" | "choice" | "multi" | "date" | "yes_no"; unit?: string; options?: string[]; hint?: string; required?: boolean };
export type PromptOption = { id: string; label: string; /** 이걸 고르면 무엇이 달라지는지 (비용·기간·바뀌는 것) */ effect?: string };
export type CardPrompt =
  | { kind: "request"; fields: PromptField[] }
  | { kind: "question"; options: PromptOption[]; allowOther?: boolean }
  | { kind: "proposal"; options: PromptOption[]; /** 달그락이 권하는 보기의 id와 이유 */ recommend?: { id: string; why: string } };
export type CardAnswer = { at: string; values?: Record<string, string | number | boolean | string[]>; choice?: string; note?: string };

/** 한 달그락의 결정이나 현실의 변화가 다른 달그락의 일에 영향을 줄 때 남기는 알림 */
export type Notice = { id: string; from: AgentId | "person" | "system"; text: string; affects: AgentId[]; at: string; seenBy: AgentId[] };

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
  /** turn=person일 때 사람에게 보여줄 요청·질문·제안 */
  prompt?: CardPrompt;
  /** 사람이 마지막으로 준 답. 달그락이 읽고 이어서 작업한다 */
  answer?: CardAnswer;
  /** 대장이 이 카드를 담당 달그락에게 몇 번, 언제 넘겼는지 (자동 진행) */
  dispatch?: { count: number; at: string };
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
export type AutoState = { on: boolean; day?: string; count?: number; pausedReason?: string };
export type Board = { cards: WorkCard[]; real: RealWorld; updatedAt: string; notices?: Notice[]; /** 대장이 사람 없이 달그락들에게 일을 이어서 맡기는 중인지 */ auto?: AutoState };

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
  for (const n of (board.notices ?? []).filter((x) => x.seenBy.length < x.affects.length).slice(-5)) lines.push(`바뀐 것(확인 안 한 달그락: ${n.affects.filter((a) => !n.seenBy.includes(a)).map((a) => a.toUpperCase()).join("·")}): ${n.text}`);
  for (const card of cards.filter((c) => c.turn === "agent" && c.answer)) lines.push(`사람의 답(${card.title}): ${answerText(card)}`);
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

export function moveCard(board: Board, cardId: string, change: { turn: CardTurn; ask?: string; waiting?: WorkCard["waiting"]; note?: string; prompt?: CardPrompt }, by: AgentId | "person", now = new Date().toISOString()): Board {
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
  if (change.turn === "person") {
    next.ask = change.ask!.trim();
    delete next.prompt; delete next.answer;
    if (change.prompt) { checkPrompt(change.prompt); next.prompt = change.prompt; }
  }
  // 차례가 바뀌면 "몇 번 넘겼는지"를 새로 센다.
  if (change.turn !== card.turn) delete next.dispatch;
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


// ── 요청·질문·제안과 그 답 ───────────────────────────────────────────────────

function checkPrompt(prompt: CardPrompt) {
  if (prompt.kind === "request") {
    if (!prompt.fields.length) throw new BoardError("요청에는 사람이 채울 칸(fields)이 하나 이상 있어야 해요.");
    const ids = new Set(prompt.fields.map((f) => f.id));
    if (ids.size !== prompt.fields.length) throw new BoardError("요청의 칸 id가 겹쳐요.");
    for (const f of prompt.fields) if ((f.kind === "choice" || f.kind === "multi") && !(f.options?.length)) throw new BoardError(`'${f.label}' 칸은 고를 보기(options)가 있어야 해요.`);
  } else {
    if (prompt.options.length < 2) throw new BoardError("질문과 제안에는 고를 보기가 둘 이상 있어야 해요.");
    if (new Set(prompt.options.map((o) => o.id)).size !== prompt.options.length) throw new BoardError("보기 id가 겹쳐요.");
    if (prompt.kind === "proposal") {
      if (prompt.options.some((o) => !o.effect?.trim())) throw new BoardError("제안의 보기마다 무엇이 달라지는지(effect: 비용·기간·바뀌는 것)를 적어주세요. 사람이 비교해서 고를 수 있어야 해요.");
      if (prompt.recommend && !prompt.options.some((o) => o.id === prompt.recommend!.id)) throw new BoardError("권하는 보기(recommend.id)가 보기 목록에 없어요.");
    }
  }
}

/** 사람이 준 답을 한 줄 글로. 달그락에게 그대로 전한다. */
export function answerText(card: Pick<WorkCard, "prompt" | "answer">): string {
  const a = card.answer; if (!a) return "";
  const parts: string[] = [];
  const p = card.prompt;
  if (a.choice) parts.push(p && p.kind !== "request" ? (p.options.find((o) => o.id === a.choice)?.label ?? a.choice) : a.choice);
  if (a.values) for (const [id, value] of Object.entries(a.values)) {
    const field = p?.kind === "request" ? p.fields.find((f) => f.id === id) : undefined;
    const shown = typeof value === "boolean" ? (value ? "예" : "아니요") : Array.isArray(value) ? value.join(", ") : String(value);
    parts.push(`${field?.label ?? id}: ${shown}${field?.unit && typeof value === "number" ? field.unit : ""}`);
  }
  if (a.note?.trim()) parts.push(a.note.trim());
  return parts.join(" / ");
}

/** 사람이 자기 차례인 카드에 답한다. 답은 카드에 남고 차례는 달그락에게 돌아간다. */
export function answerCard(board: Board, cardId: string, input: { values?: CardAnswer["values"]; choice?: string; note?: string }, now = new Date().toISOString()): Board {
  const card = board.cards.find((c) => c.id === cardId);
  if (!card) throw new BoardError("작업 카드를 찾을 수 없어요.");
  if (card.turn !== "person") throw new BoardError("지금은 답을 기다리는 카드가 아니에요.");
  const p = card.prompt;
  const answer: CardAnswer = { at: now };
  if (p?.kind === "request") {
    const values: NonNullable<CardAnswer["values"]> = {};
    for (const f of p.fields) {
      const v = input.values?.[f.id];
      const empty = v == null || v === "" || (Array.isArray(v) && !v.length);
// 모르는 칸은 비워 둘 수 있다. 다만 왜 비웠는지 메모가 있어야 한다(모르는 것을 지어내게 하지 않는다).
      if (empty) { if (f.required !== false && !input.note?.trim()) throw new BoardError(`'${f.label}'을(를) 적어주세요. 모르면 비워 두고 아래 메모에 모른다고 적어주세요.`); continue; }
      if (f.kind === "number" && typeof v !== "number") throw new BoardError(`'${f.label}'은(는) 숫자로 적어주세요.`);
      if (f.kind === "yes_no" && typeof v !== "boolean") throw new BoardError(`'${f.label}'은(는) 예/아니요로 골라주세요.`);
      if (f.kind === "choice" && !(typeof v === "string" && f.options!.includes(v))) throw new BoardError(`'${f.label}'은(는) 보기 가운데서 골라주세요.`);
      if (f.kind === "multi" && !(Array.isArray(v) && v.every((x) => f.options!.includes(x)))) throw new BoardError(`'${f.label}'은(는) 보기 가운데서 골라주세요.`);
      values[f.id] = v as string | number | boolean | string[];
    }
    answer.values = values;
  } else if (p) {
    const known = input.choice && p.options.some((o) => o.id === input.choice);
    const other = p.kind === "question" && p.allowOther !== false && !!input.note?.trim();
    if (!known && !other) throw new BoardError(p.kind === "proposal" ? "보기 가운데 하나를 골라주세요. 다른 길을 원하면 달그락에게 대화로 말해주세요." : "보기를 고르거나 생각을 직접 적어주세요.");
    if (known) answer.choice = input.choice;
  }
  if (input.note?.trim()) answer.note = input.note.trim().slice(0, 600);
  const withAnswer = { ...card, answer };
  const text = answerText(withAnswer) || "확인했어요";
  const next: WorkCard = { ...withAnswer, turn: "agent", updatedAt: now, history: [...card.history, { at: now, by: "person" as const, turn: "agent" as const, note: `답: ${text}`.slice(0, 300) }].slice(-30) };
  delete next.ask; delete next.dispatch;
  return { ...board, cards: board.cards.map((c) => (c.id === cardId ? next : c)), updatedAt: now };
}

// ── 알림: 한 곳의 변화가 다른 달그락의 일에 닿을 때 ──────────────────────────

export function postNotice(board: Board, input: { from: Notice["from"]; text: string; affects: AgentId[] }, id: string, now = new Date().toISOString()): Board {
  const affects = [...new Set(input.affects)].filter((a) => a !== input.from);
  if (!input.text.trim() || !affects.length) return board;
  const notice: Notice = { id, from: input.from, text: input.text.trim().slice(0, 500), affects, at: now, seenBy: [] };
  return { ...board, notices: [...(board.notices ?? []), notice].slice(-60), updatedAt: now };
}
export const unseenNotices = (board: Board, room: AgentId) => (board.notices ?? []).filter((n) => n.affects.includes(room) && !n.seenBy.includes(room));
export function seeNotices(board: Board, room: AgentId, ids?: string[]): Board {
  return { ...board, notices: (board.notices ?? []).map((n) => (n.affects.includes(room) && !n.seenBy.includes(room) && (!ids || ids.includes(n.id)) ? { ...n, seenBy: [...n.seenBy, room] } : n)) };
}

// ── 자동 진행: 대장이 다음에 누구에게 무엇을 시킬지 ────────────────────────────

export const AUTO_DAILY_LIMIT = 40;   // 하루에 자동으로 넘기는 횟수의 한도. 사람의 요금제 사용량을 지킨다.
const RETRY_LIMIT = 2;                // 같은 카드를 차례 변화 없이 다시 넘기는 횟수

export type Dispatch = { room: AgentId; reason: "answer" | "notice" | "card"; cardId?: string; noticeIds?: string[]; text: string };

/** 지금 달그락에게 넘길 일 하나. 사람을 기다려야 하면 null. */
export function nextDispatch(board: Board, team: AgentId[], now = new Date().toISOString()): Dispatch | null {
  const auto = board.auto;
  if (!auto?.on) return null;
  if (auto.day === now.slice(0, 10) && (auto.count ?? 0) >= AUTO_DAILY_LIMIT) return null;
  const view = viewBoard(board, new Date(now).getTime());
  const rooms: AgentId[] = ["chief", ...team.filter((a) => a !== "chief")];
  // 1. 사람이 방금 답한 카드: 답을 읽고 이어서 한다.
  for (const card of view.cards) {
    if (card.turn === "agent" && card.active && card.answer && !card.dispatch && rooms.includes(card.owner))
      return { room: card.owner, reason: "answer", cardId: card.id, text: `[대장의 전달] 「${card.title}」에 사람이 답했어요: ${answerText(card)}\n이 답을 반영해 이어서 작업하고, 끝나면 update_work_card로 차례를 넘겨 주세요(사람이 더 할 것이 있으면 person, 기다릴 것이 있으면 waiting, 다 됐으면 done).` };
  }
  // 2. 아직 확인하지 않은 변경 알림
  for (const room of rooms) {
    const unseen = unseenNotices(board, room);
    if (unseen.length) return { room, reason: "notice", noticeIds: unseen.map((n) => n.id), text: `[대장의 전달] 다른 곳에서 바뀐 것이 있어요:\n${unseen.map((n) => `- ${n.text}`).join("\n")}\n이 변화가 내 작업(카드, 파일, 치수, 부품)에 주는 영향을 확인해 주세요. 고칠 것이 있으면 고치고, 승인된 설계를 바꿔야 하면 propose_design_change로 수정안을 내고, 사람이 정해야 하면 update_work_card로 제안(proposal)을 넘겨 주세요. 영향이 없으면 없다고 한 줄로 답해 주세요.` };
  }
  // 3. 달그락 차례인 카드. 차례 변화 없이 두 번 넘겼으면 더 넘기지 않는다(같은 자리에서 맴도는 것을 막는다).
  for (const card of view.cards) {
    if (card.turn === "agent" && card.active && rooms.includes(card.owner) && (card.dispatch?.count ?? 0) < RETRY_LIMIT)
      return { room: card.owner, reason: "card", cardId: card.id, text: `[대장의 작업 지시] 「${card.title}」: ${card.detail}${card.answer ? `\n사람이 준 답: ${answerText(card)}` : ""}\n지금 할 수 있는 데까지 작업하고 결과를 도구로 기록해 주세요. 끝나면 반드시 update_work_card로 차례를 넘겨 주세요: 사람에게 사실을 받아야 하면 요청(request), 사람의 뜻을 물어야 하면 질문(question), 막힌 것을 풀 길을 골라야 하면 제안(proposal), 현실을 기다려야 하면 waiting, 다 됐으면 done.${(card.dispatch?.count ?? 0) > 0 ? "\n(앞서 한 번 넘겼는데 차례가 그대로였어요. 이번에는 꼭 차례를 바꿔 주세요.)" : ""}` };
  }
  return null;
}

export function markDispatched(board: Board, d: Dispatch, now = new Date().toISOString()): Board {
  const day = now.slice(0, 10);
  const auto: AutoState = { ...(board.auto ?? { on: true }), day, count: (board.auto?.day === day ? board.auto.count ?? 0 : 0) + 1 };
  let next: Board = { ...board, auto, updatedAt: now };
  if (d.cardId) next = { ...next, cards: next.cards.map((c) => (c.id === d.cardId ? { ...c, dispatch: { count: (c.dispatch?.count ?? 0) + 1, at: now } } : c)) };
  if (d.noticeIds?.length) next = seeNotices(next, d.room, d.noticeIds);
  return next;
}

/** 자동 진행이 멈춰 있는 까닭(화면과 달그락에게 보여준다) */
export function autoStatus(board: Board, team: AgentId[], now = new Date().toISOString()): { on: boolean; state: "off" | "running" | "waiting_person" | "waiting_world" | "stalled" | "limit" | "idle"; text: string } {
  if (!board.auto?.on) return { on: false, state: "off", text: "자동 진행이 꺼져 있어요" };
  if (board.auto.day === now.slice(0, 10) && (board.auto.count ?? 0) >= AUTO_DAILY_LIMIT) return { on: true, state: "limit", text: "오늘 자동으로 넘길 수 있는 횟수를 다 썼어요. 내일 이어가거나 직접 말을 걸어 주세요" };
  if (nextDispatch(board, team, now)) return { on: true, state: "running", text: "달그락들이 이어서 일하는 중이에요" };
  const view = viewBoard(board, new Date(now).getTime());
  if (view.nextForPerson) return { on: true, state: "waiting_person", text: "내 답을 기다리고 있어요" };
  if (view.cards.some((c) => c.turn === "agent" && c.active && (c.dispatch?.count ?? 0) >= RETRY_LIMIT)) return { on: true, state: "stalled", text: "달그락이 차례를 넘기지 않아 멈췄어요. 그 대장간에서 직접 말을 걸어 주세요" };
  if (view.cards.some((c) => c.turn === "waiting")) return { on: true, state: "waiting_world", text: "도착이나 출력을 기다리는 중이에요" };
  return { on: true, state: "idle", text: view.cards.length && view.cards.every((c) => c.turn === "done") ? "모든 일이 끝났어요" : "지금 넘길 일이 없어요" };
}
