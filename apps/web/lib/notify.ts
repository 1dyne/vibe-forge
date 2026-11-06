import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import webpush from "web-push";
import { finalizeBlockers, assigneeOf, isOpenTask } from "./coordination";
import { mailConfigured, sendMail } from "./mailer";
import type { LocalProject } from "./project-types";
import { getActiveUser } from "./users";
import { workflowFor } from "./workflow";

// Notifications to the person when something needs them: a new or changed
// task, a decision card, an approval, an answer to their question. Agents'
// own progress does not notify.
//
// What is stored here is NOT sealed, by the person's choice for the sealed
// lock as well: push subscriptions, the email on/off switch, and deadlines
// for requests sent to a coding agent (ids and a due time, no content). The
// text of a notification (a task title) is built in memory while the person's
// key is present and is never written to disk.

export type PushSubscriptionRecord = { endpoint: string; keys: { p256dh: string; auth: string }; addedAt: string; label?: string };
type Deadline = { id: string; userId: string; projectId: string; taskId: string; dueAt: string; kind: "dispatch" };
type NotifyDatabase = { version: 1; users: Record<string, { push: PushSubscriptionRecord[]; email: boolean }>; deadlines: Deadline[] };
export type Notice = { title: string; url: string };

const BATCH_MS = 10 * 60 * 1000;
let queue: Promise<unknown> = Promise.resolve();

function dataFile() {
  if (process.env.FORGE_TEST_NOTIFY_FILE && process.env.NODE_ENV === "test") return process.env.FORGE_TEST_NOTIFY_FILE;
  const cwd = process.cwd();
  const workspace = path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps" ? path.resolve(cwd, "../..") : cwd;
  return path.join(workspace, ".data", "notify.json");
}
async function read(): Promise<NotifyDatabase> {
  try {
    const parsed = JSON.parse(await readFile(/* turbopackIgnore: true */ dataFile(), "utf8")) as NotifyDatabase;
    return parsed.version === 1 ? { version: 1, users: parsed.users ?? {}, deadlines: parsed.deadlines ?? [] } : { version: 1, users: {}, deadlines: [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, users: {}, deadlines: [] };
    throw error;
  }
}
function update<T>(change: (db: NotifyDatabase) => T): Promise<T> {
  const run = async () => {
    const db = await read();
    const result = change(db);
    const file = dataFile();
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(db), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, file);
    return result;
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

export function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;

export async function notifySettings(userId: string) {
  const entry = (await read()).users[userId];
  return { pushDevices: entry?.push.length ?? 0, email: entry?.email ?? false, pushAvailable: pushConfigured(), emailAvailable: mailConfigured(), publicKey: vapidPublicKey() };
}
export async function addPushSubscription(userId: string, sub: Omit<PushSubscriptionRecord, "addedAt">) {
  await update((db) => {
    const entry = db.users[userId] ?? { push: [], email: false };
    entry.push = [...entry.push.filter((s) => s.endpoint !== sub.endpoint), { ...sub, addedAt: new Date().toISOString() }].slice(-5);
    db.users[userId] = entry;
  });
}
export async function removePushSubscription(userId: string, endpoint: string) {
  await update((db) => { const entry = db.users[userId]; if (entry) entry.push = entry.push.filter((s) => s.endpoint !== endpoint); });
}
export async function setEmailNotices(userId: string, on: boolean) {
  await update((db) => { db.users[userId] = { push: db.users[userId]?.push ?? [], email: on }; });
}
export async function forgetUser(userId: string) {
  await update((db) => { delete db.users[userId]; db.deadlines = db.deadlines.filter((d) => d.userId !== userId); });
}

// Sends one notification (or one combined one) through every channel the
// person turned on. Failing channels never fail the caller.
export const sentLog: Array<{ userId: string; channel: "push" | "email"; title: string; body: string; url: string }> = [];
async function deliver(userId: string, title: string, lines: string[], url: string) {
  const db = await read();
  const entry = db.users[userId];
  if (!entry) return;
  const body = lines.slice(0, 5).join("\n") + (lines.length > 5 ? `\n외 ${lines.length - 5}건` : "");
  if (entry.push.length && pushConfigured()) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:noreply@dalgeurak.invalid", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    const gone: string[] = [];
    await Promise.all(entry.push.map(async (sub) => {
      try {
        if (process.env.NODE_ENV === "test") { sentLog.push({ userId, channel: "push", title, body, url }); return; }
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({ title, body, url }), { TTL: 60 * 60 * 24 });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(sub.endpoint);
        else console.error("push failed", status ?? "unknown");
      }
    }));
    if (gone.length) await update((d) => { const e = d.users[userId]; if (e) e.push = e.push.filter((s) => !gone.includes(s.endpoint)); });
  }
  if (entry.email && mailConfigured()) {
    const user = await getActiveUser(userId);
    if (user?.email && user.emailVerifiedAt) {
      try {
        if (process.env.NODE_ENV === "test") sentLog.push({ userId, channel: "email", title, body, url });
        await sendMail({ to: user.email, subject: `[달그락 대장간] ${title}`, text: `${title}\n\n${lines.join("\n")}\n\n열기: ${url}\n\n알림은 대장간의 내 계정 → 알림에서 끌 수 있어요.`, html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px"><h2 style="font-size:17px">${esc(title)}</h2><ul>${lines.map((l) => `<li style="line-height:1.7">${esc(l)}</li>`).join("")}</ul><p><a href="${esc(url)}" style="display:inline-block;background:#8fd0bd;color:#10241c;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">대장간에서 열기</a></p><p style="font-size:12px;color:#6b776f">알림은 대장간의 내 계정 → 알림에서 끌 수 있어요.</p></div>` });
      } catch (error) { console.error("notice mail failed", error instanceof Error ? error.message : "unknown"); }
    }
  }
}
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// One project sends at most one notification per ten minutes: the first goes
// out at once, later ones in that window are combined and sent when it ends.
// Held in memory only; a restart drops a pending combined notice.
const batches = new Map<string, { lastSentAt: number; pending: Notice[]; timer: ReturnType<typeof setTimeout> | null; projectName: string }>();
export async function notifyPerson(userId: string, projectId: string, projectName: string, notices: Notice[]) {
  if (!notices.length) return;
  const key = `${userId}:${projectId}`;
  const now = Date.now();
  const batch = batches.get(key) ?? { lastSentAt: 0, pending: [], timer: null, projectName };
  batch.projectName = projectName;
  batches.set(key, batch);
  if (now - batch.lastSentAt >= BATCH_MS && !batch.timer) {
    batch.lastSentAt = now;
    await deliver(userId, notices.length === 1 ? notices[0].title : `${projectName}: 확인할 것 ${notices.length}건`, notices.map((n) => n.title), notices[0].url);
    return;
  }
  batch.pending.push(...notices);
  if (!batch.timer) {
    batch.timer = setTimeout(() => {
      const items = batch.pending.splice(0);
      batch.timer = null;
      batch.lastSentAt = Date.now();
      if (items.length) void deliver(userId, `${batch.projectName}: 확인할 것 ${items.length}건`, items.map((n) => n.title), items[0].url).catch(() => {});
    }, Math.max(1000, batch.lastSentAt + BATCH_MS - now));
    batch.timer.unref?.();
  }
}
export function flushBatchesForTest() { for (const b of batches.values()) if (b.timer) clearTimeout(b.timer); batches.clear(); }

// What changed for the person between two versions of a project.
export function noticesBetween(before: LocalProject | null, after: LocalProject, base: string): Notice[] {
  const url = (open?: string) => { const u = new URL("/", base); u.searchParams.set("p", after.id); if (open) u.searchParams.set("open", open); return u.toString(); };
  const notices: Notice[] = [];
  const prevTasks = new Map((before?.tasks ?? []).map((t) => [t.id, t]));
  for (const t of after.tasks) {
    if (assigneeOf(t) !== "human" || !isOpenTask(t) || t.status !== "ready") continue;
    const prev = prevTasks.get(t.id);
    if (!prev) notices.push({ title: `${t.kind === "measure" ? "측정 요청" : t.form ? "정보 요청" : "새 할 일"}: ${t.title}`, url: url(`task:${t.id}`) });
    else if (prev.title !== t.title || prev.plain !== t.plain || JSON.stringify(prev.form) !== JSON.stringify(t.form) || JSON.stringify(prev.howTo) !== JSON.stringify(t.howTo) || !isOpenTask(prev)) notices.push({ title: `할 일이 바뀌었어요: ${t.title}`, url: url(`task:${t.id}`) });
    for (const q of t.questions ?? []) if (q.answer && !prev?.questions?.find((x) => x.id === q.id)?.answer) notices.push({ title: `질문에 답이 왔어요: ${t.title}`, url: url(`task:${t.id}`) });
  }
  for (const t of after.tasks) {
    if (assigneeOf(t) !== "human" || t.status === "ready") continue;
    const prev = prevTasks.get(t.id);
    for (const q of t.questions ?? []) if (q.answer && !prev?.questions?.find((x) => x.id === q.id)?.answer) notices.push({ title: `질문에 답이 왔어요: ${t.title}`, url: url(`task:${t.id}`) });
  }
  const prevConflicts = new Map((before?.conflicts ?? []).map((c) => [c.id, c]));
  for (const c of after.conflicts ?? []) {
    if (c.status !== "open" || !c.options.length) continue;
    const prev = prevConflicts.get(c.id);
    if (!prev || prev.updatedAt !== c.updatedAt) notices.push({ title: `${c.afterFinal ? "변경 제안" : "결정해 주세요"}: ${c.title}`, url: url(`conflict:${c.id}`) });
  }
  const bw = before ? workflowFor(before) : null;
  const aw = workflowFor(after);
  if (aw.contract?.draft && aw.contract.draft.at !== bw?.contract?.draft?.at) notices.push({ title: `연결 약속 v${aw.contract.draft.version}을 확인해 주세요`, url: url("decisions") });
  const newRefs = (aw.design?.refs ?? []).filter((r) => !(bw?.design?.refs ?? []).some((x) => x.id === r.id));
  if (newRefs.length) notices.push({ title: `디자인 레퍼런스 ${newRefs.length}개를 골라 주세요`, url: url("decisions") });
  if (aw.design?.brief && !aw.design.brief.approvedAt && aw.design.brief.at !== bw?.design?.brief?.at) notices.push({ title: "디자인 방향을 확인해 주세요", url: url("decisions") });
  for (const t of after.tasks) {
    if (t.assignee !== "chief" || t.createdBy !== "human" || t.status !== "completed") continue;
    const prev = prevTasks.get(t.id);
    if (prev && prev.status !== "completed") notices.push({ title: `질문에 답이 왔어요: ${t.title.replace(/^질문 · /, "")}`, url: url("decisions") });
  }
  const was = before ? workflowFor(before).phase : null;
  const now = workflowFor(after).phase;
  if (now === "circuit" && after.build && (was !== "circuit" || before?.build?.createdAt !== after.build.createdAt)) notices.push({ title: "회로를 확인하고 승인해 주세요", url: url() });
  if (now === "mockup" && was !== "mockup") notices.push({ title: "3D 목업을 확인하고 승인해 주세요", url: url() });
  if (now === "handoff" && before && workflowFor(before).phase === "handoff" && finalizeBlockers(before).length && !finalizeBlockers(after).length) notices.push({ title: "최종 설계를 확정할 수 있어요", url: url() });
  return notices;
}

// Requests sent to a coding agent: if no session takes the task by the due
// time, the person is told to check the computer or the scheduled task. The
// claim (update_task in_progress) clears the deadline.
export async function addDeadline(d: Omit<Deadline, "id" | "kind">) {
  await update((db) => { db.deadlines = [...db.deadlines.filter((x) => x.taskId !== d.taskId), { ...d, id: crypto.randomUUID(), kind: "dispatch" as const }].slice(-500); });
}
export async function clearDeadline(taskId: string) {
  await update((db) => { db.deadlines = db.deadlines.filter((d) => d.taskId !== taskId); });
}
export async function checkDeadlines(now = Date.now(), base = process.env.APP_BASE_URL ?? "http://localhost:3000") {
  const due = await update((db) => { const hit = db.deadlines.filter((d) => Date.parse(d.dueAt) <= now); db.deadlines = db.deadlines.filter((d) => Date.parse(d.dueAt) > now); return hit; });
  for (const d of due) {
    const u = new URL("/", base); u.searchParams.set("p", d.projectId); u.searchParams.set("open", `task:${d.taskId}`);
    await deliver(d.userId, "보낸 작업에 아직 응답이 없어요", ["Claude Code나 Codex가 요청을 받지 못했을 수 있어요.", "내 컴퓨터에서 쓰는 경우 컴퓨터와 Claude Code가 켜져 있는지, 예약 작업을 쓰는 경우 claude.ai/code/routines에서 실행 기록을 확인해 주세요."], u.toString()).catch(() => {});
  }
  return due.length;
}
const g = globalThis as { __forgeDeadlineTimer?: ReturnType<typeof setInterval> };
export function startDeadlineWatch() {
  if (g.__forgeDeadlineTimer || process.env.NODE_ENV === "test") return;
  g.__forgeDeadlineTimer = setInterval(() => { void checkDeadlines().catch((e) => console.error("deadline check failed", e instanceof Error ? e.message : "unknown")); }, 60_000);
  g.__forgeDeadlineTimer.unref?.();
}

// "알림 시험" from the account panel: goes out at once, outside the batch.
export async function sendTestNotice(userId: string, base: string) {
  await deliver(userId, "달그락 대장간 알림 시험", ["이 기기나 이메일로 알림이 와요."], new URL("/", base).toString());
}
