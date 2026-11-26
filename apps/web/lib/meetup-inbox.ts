import { createHmac } from "node:crypto";

// ── MEETUP: 2026-11-28 밋업 시연 전용 (lib/meetup.ts 참고). 밋업이 끝나면 지운다 ──
// 로그인하지 않은 사람이 발표자의 시연 프로젝트로 아이디어를 보내는 우편함.
// 프로젝트 기록은 주인의 열쇠로 잠겨 있어 서버가 혼자 열 수 없다. 그래서 받은 글은 여기(메모리)에
// 잠깐 두고, 주인의 화면이 몇 초마다 가져가서 자기 열쇠로 프로젝트에 적는다.
// 메모리에만 있으므로 서버가 한 대일 때만 맞고, 재시작하면 아직 안 가져간 글은 사라진다.

export type InboxItem = { text: string; name: string; at: string };
type State = { open: Map<string, { projectId: string; seenAt: number }>; items: Map<string, InboxItem[]> };
const key = Symbol.for("dalgeurak.meetupInbox");
const state: State = ((globalThis as Record<symbol, unknown>)[key] as State | undefined) ?? { open: new Map(), items: new Map() };
(globalThis as Record<symbol, unknown>)[key] = state;

const OPEN_MS = 3 * 60_000;
const MAX_WAITING = 200;

/** 프로젝트마다 늘 같은 여덟 글자. 주소를 미리 발표 자료에 넣어 둘 수 있게 재시작해도 바뀌지 않는다 */
export const meetupCode = (projectId: string) => createHmac("sha256", process.env.SESSION_SECRET ?? "dev-secret").update(`meetup-idea:${projectId}`).digest("hex").slice(0, 8);

/** 주인의 화면이 열려 있다고 알린다 (몇 초마다). 그동안만 글을 받는다 */
export function openInbox(projectId: string): string {
  const code = meetupCode(projectId);
  state.open.set(code, { projectId, seenAt: Date.now() });
  return code;
}
export const inboxOpen = (code: string) => { const o = state.open.get(code); return !!o && Date.now() - o.seenAt < OPEN_MS; };

export function dropIdea(code: string, item: InboxItem): "ok" | "closed" | "full" {
  if (!inboxOpen(code)) return "closed";
  const waiting = state.items.get(code) ?? [];
  if (waiting.length >= MAX_WAITING) return "full";
  state.items.set(code, [...waiting, item]);
  return "ok";
}
export function takeIdeas(code: string): InboxItem[] {
  const waiting = state.items.get(code) ?? [];
  state.items.delete(code);
  return waiting;
}
