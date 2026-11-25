import { randomUUID } from "node:crypto";

// 달그락 연결 앱(사용자 컴퓨터에서 도는 오픈소스 앱)와 이 서버 사이의 우체통.
//
// AI 호출과 ChatGPT 로그인은 연결 앱이 맡는다. 서버는 로그인 토큰을 받지도, 보지도
// 않는다. 서버가 하는 일은 두 가지뿐이다: 화면(어느 기기든)에서 온 말을 연결 앱에게
// 건네고, 연결 앱이 돌려주는 답을 화면으로 흘려보낸다.
//
// 지금은 메모리에만 둔다. 서버가 한 대일 때만 맞는 구조이고, 재시작하면 진행 중이던
// 한 턴이 끊긴다(대화 기록은 프로젝트에 저장되므로 남는다). 서버를 여러 대로 늘리면
// 이 우체통을 Postgres나 Redis로 옮겨야 한다.

export type HelperEvent =
  | { type: "delta"; text: string }
  | { type: "status"; text: string }
  | { type: "done"; text: string }
  | { type: "error"; code: string; message: string };

export type HelperJob = {
  id: string;
  userId: string;
  projectId: string | null;
  channel: string;
  text: string;
  /** 사용자가 화면에서 고른 모델. 연결 앱이 쓸 수 있는 것일 때만 따른다 */
  model: string | null;
  createdAt: number;
  claimedAt: number | null;
  events: HelperEvent[];
  finished: boolean;
  watchers: Set<() => void>;
};

export type HelperModel = { slug: string; name: string };
type Presence = { lastSeen: number; model: string | null; version: string | null; account: string | null; models: HelperModel[] };
type State = { presence: Map<string, Presence>; queues: Map<string, HelperJob[]>; jobs: Map<string, HelperJob>; pollers: Map<string, Set<() => void>> };

// Next가 라우트마다 모듈을 따로 묶어도 우체통은 하나여야 한다.
const globalKey = Symbol.for("dalgeurak.helperRelay");
const state: State = ((globalThis as Record<symbol, unknown>)[globalKey] as State | undefined) ?? { presence: new Map(), queues: new Map(), jobs: new Map(), pollers: new Map() };
(globalThis as Record<symbol, unknown>)[globalKey] = state;

export const ONLINE_WINDOW_MS = 45_000;
export const POLL_WAIT_MS = 25_000;
const JOB_TTL_MS = 15 * 60_000;
const CLAIM_TIMEOUT_MS = 60_000;
const MAX_QUEUED = 3;
const MAX_EVENTS = 4000;

function sweep(now = Date.now()) {
  for (const [id, job] of state.jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      if (!job.finished) finish(job, { type: "error", code: "timeout", message: "답변이 너무 오래 걸려 멈췄어요. 다시 보내주세요." });
      state.jobs.delete(id);
    }
  }
}

function finish(job: HelperJob, event: HelperEvent) {
  job.events.push(event);
  job.finished = true;
  for (const wake of job.watchers) wake();
  job.watchers.clear();
}

export function touchHelper(userId: string, info: Partial<Omit<Presence, "lastSeen">> = {}) {
  const before = state.presence.get(userId);
  state.presence.set(userId, { lastSeen: Date.now(), model: info.model ?? before?.model ?? null, version: info.version ?? before?.version ?? null, account: info.account ?? before?.account ?? null, models: info.models ?? before?.models ?? [] });
}

export function helperStatus(userId: string, now = Date.now()): { online: boolean; model: string | null; version: string | null; account: string | null; models: HelperModel[] } {
  const p = state.presence.get(userId);
  return { online: !!p && now - p.lastSeen < ONLINE_WINDOW_MS, model: p?.model ?? null, version: p?.version ?? null, account: p?.account ?? null, models: p?.models ?? [] };
}

export class RelayError extends Error {
  constructor(public code: "offline" | "busy" | "not_found", message: string) { super(message); }
}

export function enqueueJob(input: { userId: string; projectId: string | null; channel: string; text: string; model?: string | null }): HelperJob {
  sweep();
  if (!helperStatus(input.userId).online) throw new RelayError("offline", "컴퓨터의 달그락 연결 앱이 꺼져 있어요. 연결 앱을 켜면 여기서 바로 대화할 수 있어요.");
  const queue = state.queues.get(input.userId) ?? [];
  const active = [...state.jobs.values()].filter((job) => job.userId === input.userId && !job.finished).length;
  if (active >= MAX_QUEUED) throw new RelayError("busy", "앞서 보낸 말에 답하는 중이에요. 답이 끝나면 다시 보내주세요.");
  const job: HelperJob = { id: randomUUID(), userId: input.userId, projectId: input.projectId, channel: input.channel, text: input.text, model: input.model ?? null, createdAt: Date.now(), claimedAt: null, events: [], finished: false, watchers: new Set() };
  state.jobs.set(job.id, job);
  queue.push(job);
  state.queues.set(input.userId, queue);
  for (const wake of state.pollers.get(input.userId) ?? []) wake();
  return job;
}

/** 연결 앱이 일을 가져간다. 없으면 waitMs까지 기다렸다가 null. */
export async function claimJob(userId: string, waitMs = POLL_WAIT_MS): Promise<HelperJob | null> {
  const take = () => {
    const queue = state.queues.get(userId) ?? [];
    while (queue.length) {
      const job = queue.shift()!;
      if (job.finished) continue;
      job.claimedAt = Date.now();
      return job;
    }
    return null;
  };
  const ready = take();
  if (ready || waitMs <= 0) return ready;
  return new Promise((resolve) => {
    const pollers = state.pollers.get(userId) ?? new Set();
    state.pollers.set(userId, pollers);
    const done = () => { clearTimeout(timer); pollers.delete(done); resolve(take()); };
    const timer = setTimeout(done, waitMs);
    pollers.add(done);
  });
}

export function jobFor(jobId: string, userId: string): HelperJob {
  const job = state.jobs.get(jobId);
  if (!job || job.userId !== userId) throw new RelayError("not_found", "대화 요청을 찾을 수 없어요.");
  return job;
}

export function pushJobEvent(jobId: string, userId: string, event: HelperEvent): HelperJob {
  const job = jobFor(jobId, userId);
  if (job.finished) return job;
  if (event.type === "done" || event.type === "error") finish(job, event);
  else if (job.events.length < MAX_EVENTS) {
    job.events.push(event);
    for (const wake of job.watchers) wake();
    job.watchers.clear();
  }
  return job;
}

/** 화면이 from번째 이후의 사건을 읽는다. 새 사건이 없으면 waitMs까지 기다린다. */
export async function readJobEvents(jobId: string, userId: string, from: number, waitMs = 20_000): Promise<{ events: HelperEvent[]; next: number; finished: boolean }> {
  const job = jobFor(jobId, userId);
  const snapshot = () => ({ events: job.events.slice(from), next: job.events.length, finished: job.finished });
  // 연결 앱이 가져가지 않은 채 오래 남았으면, 연결 앱이 꺼진 것이다.
  if (!job.finished && !job.claimedAt && Date.now() - job.createdAt > CLAIM_TIMEOUT_MS) finish(job, { type: "error", code: "offline", message: "컴퓨터의 달그락 연결 앱이 응답하지 않아요. 연결 앱이 켜져 있는지 확인해주세요." });
  if (job.events.length > from || job.finished || waitMs <= 0) return snapshot();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); job.watchers.delete(done); resolve(snapshot()); };
    const timer = setTimeout(done, waitMs);
    job.watchers.add(done);
  });
}

export function resetHelperRelay() {
  state.presence.clear(); state.queues.clear(); state.jobs.clear(); state.pollers.clear();
}

/** 그 사람의 연결 앱이 지금 답하고 있거나 답할 일이 쌓여 있는가 */
export function hasActiveJob(userId: string): boolean {
  sweep();
  return [...state.jobs.values()].some((job) => job.userId === userId && !job.finished);
}
