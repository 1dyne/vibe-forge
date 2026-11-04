import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentPlan, BuildResult, DesignSlot, ImageAttachment, LocalProject, MakerProfile } from "./project-types";
import { workflowFor } from "./workflow";
import { forgetLegacyTokens, takeLegacyTokens } from "./users";
import { currentVault, open, seal, vaultFor, withVault, type Vault } from "./vault";

const labels: Array<[DesignSlot["key"], string]> = [
  ["power", "전원"],
  ["wireless", "무선 필요 여부"],
  ["sensing", "감지 대상과 정밀도"],
  ["actuation", "움직임·표시"],
  ["data_sink", "데이터 행선지"],
  ["form", "폼팩터·환경 제약"],
  ["runtime", "구동 시간"],
  ["fab", "제작 방식"]
];

type SealedProject = { id: string; ownerId: string; updatedAt: string; sealed: string };
type SealedProfile = { sealed: string };
type StoredDatabase = { version: 1; projects: Array<LocalProject | SealedProject>; profile?: MakerProfile; profiles?: Record<string, MakerProfile | SealedProfile> };
// In memory: the operator's projects and the current participant's opened
// records are plain; every other participant's records stay sealed in hidden.
type Database = { version: 1; projects: LocalProject[]; profile?: MakerProfile; profiles?: Record<string, MakerProfile>; hidden: { projects: SealedProject[]; profiles: Record<string, SealedProfile> } };
let queue: Promise<unknown> = Promise.resolve();
let migration: Promise<void> | null = null;

function dataFile() {
  if (process.env.FORGE_TEST_DATA_FILE && process.env.NODE_ENV === "test") return process.env.FORGE_TEST_DATA_FILE;
  const cwd = process.cwd();
  const workspace = path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps" ? path.resolve(cwd, "../..") : cwd;
  return path.join(workspace, ".data", "local-projects.json");
}

const isSealed = (value: unknown): value is { sealed: string } => typeof (value as { sealed?: unknown })?.sealed === "string";
const projectLabel = (id: string, ownerId: string) => `project:${id}:${ownerId}`;
const profileLabel = (ownerId: string) => `profile:${ownerId}`;

async function readStored(): Promise<StoredDatabase> {
  try {
    const parsed = JSON.parse(await readFile(/* turbopackIgnore: true */ dataFile(), "utf8")) as StoredDatabase;
    if (parsed.version !== 1 || !Array.isArray(parsed.projects)) throw new Error("저장된 프로젝트 형식을 읽을 수 없습니다.");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, projects: [] };
    throw error;
  }
}

async function writeStored(database: StoredDatabase) {
  const file = dataFile();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(database, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
}

function sealOwned(database: StoredDatabase, vault: Vault): StoredDatabase {
  const projects = database.projects.map((project) => !isSealed(project) && project.ownerId === vault.ownerId
    ? { id: project.id, ownerId: vault.ownerId, updatedAt: project.updatedAt, sealed: seal(project, vault.key, projectLabel(project.id, vault.ownerId)) }
    : project);
  const profiles = { ...database.profiles };
  const profile = profiles[vault.ownerId];
  if (profile && !isSealed(profile)) profiles[vault.ownerId] = { sealed: seal(profile, vault.key, profileLabel(vault.ownerId)) };
  return { ...database, projects, ...(database.profiles ? { profiles } : {}) };
}

// Records written before sealing existed were plain JSON. The tokens those
// participants were issued are still recoverable once, so seal their records
// now and then forget the recoverable copy of each token.
function migrateLegacy(): Promise<void> {
  migration ??= (async () => {
    const legacy = await takeLegacyTokens();
    if (!legacy.length) return;
    let stored = await readStored();
    for (const { id, token } of legacy) stored = sealOwned(stored, vaultFor(token, id));
    await writeStored(stored);
    await forgetLegacyTokens(legacy.map(({ id }) => id));
  })().catch((error) => { migration = null; throw error; });
  return migration;
}

async function readDatabase(): Promise<Database> {
  await migrateLegacy();
  const stored = await readStored();
  const vault = currentVault();
  const database: Database = { version: 1, projects: [], ...(stored.profile ? { profile: stored.profile } : {}), hidden: { projects: [], profiles: {} } };
  for (const item of stored.projects) {
    if (!isSealed(item)) { database.projects.push(item); continue; }
    const opened = vault && item.ownerId === vault.ownerId ? open<LocalProject>(item.sealed, vault.key, projectLabel(item.id, item.ownerId)) : null;
    if (opened) database.projects.push(opened);
    else database.hidden.projects.push(item);
  }
  for (const project of database.projects) project.workflow = workflowFor(project);
  for (const [ownerId, profile] of Object.entries(stored.profiles ?? {})) {
    const opened = isSealed(profile) ? (vault?.ownerId === ownerId ? open<MakerProfile>(profile.sealed, vault.key, profileLabel(ownerId)) : null) : profile;
    if (opened) (database.profiles ??= {})[ownerId] = opened;
    else if (isSealed(profile)) database.hidden.profiles[ownerId] = profile;
  }
  return database;
}

// Per-participant storage limits keep one account from filling the volume.
export const limits = {
  projectsPerUser: () => Number(process.env.LIMIT_PROJECTS_PER_USER ?? 20),
  projectBytes: () => Number(process.env.LIMIT_PROJECT_BYTES ?? 8_000_000)
};
export class QuotaError extends Error {}

async function writeDatabase(database: Database) {
  const { hidden, ...visible } = database;
  for (const project of visible.projects) {
    if (project.ownerId && Buffer.byteLength(JSON.stringify(project)) > limits.projectBytes()) throw new QuotaError("이 프로젝트의 저장 용량 한도를 넘었어요. 첨부 이미지나 오래된 파일을 줄여주세요.");
  }
  let stored: StoredDatabase = { ...visible, projects: [...visible.projects, ...hidden.projects], profiles: { ...visible.profiles, ...hidden.profiles } };
  const vault = currentVault();
  if (vault) stored = sealOwned(stored, vault);
  await writeStored(stored);
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation, operation);
  queue = next.then(() => undefined, () => undefined);
  return next;
}

// ownerId null lists the operator's own projects; a user id lists only theirs.
export async function listProjects(ownerId: string | null = null): Promise<LocalProject[]> {
  await queue;
  return (await readDatabase()).projects.filter((project) => (ownerId === null ? !project.ownerId : project.ownerId === ownerId)).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<LocalProject | null> {
  await queue;
  return (await readDatabase()).projects.find((project) => project.id === id) ?? null;
}

export function createProject(idea: string, plan: AgentPlan, mode: LocalProject["lastAgentMode"], attachments: ImageAttachment[] = [], owner: { ownerId?: string; origin?: LocalProject["origin"] } = {}): Promise<LocalProject> {
  return serialized(async () => {
    const database = await readDatabase();
    if (owner.ownerId) {
      const owned = database.projects.filter((item) => item.ownerId === owner.ownerId).length + database.hidden.projects.filter((item) => item.ownerId === owner.ownerId).length;
      if (owned >= limits.projectsPerUser()) throw new QuotaError(`프로젝트는 한 사람당 ${limits.projectsPerUser()}개까지 만들 수 있어요. 끝난 프로젝트를 정리한 뒤 다시 시도해주세요.`);
    }
    const now = new Date().toISOString();
    const updates = new Map(plan.slotUpdates.map((slot) => [slot.key, slot]));
    const project: LocalProject = {
      id: randomUUID(),
      ...(owner.ownerId ? { ownerId: owner.ownerId } : {}),
      origin: owner.origin ?? "web",
      name: plan.projectName,
      idea,
      oneLiner: plan.oneLiner,
      stage: "idea",
      designRevision: 1,
      slots: labels.map(([key, label]) => ({ key, label, status: "empty", valueText: null, assumption: null, acknowledged: false, ...updates.get(key) })),
      tasks: plan.tasks.map((task) => ({ ...task, id: randomUUID(), status: "ready" })),
      messages: [
        { id: randomUUID(), role: "user", text: idea, createdAt: now, channel: "main", attachments },
        { id: randomUUID(), role: "assistant", text: plan.reply, createdAt: now, agent: "chief", channel: "main" }
      ],
      build: null,
      lastAgentMode: mode,
      createdAt: now,
      updatedAt: now
    };
    project.workflow = workflowFor(project);
    const savedProfile = profileFor(database, owner.ownerId ?? null);
    if (savedProfile) project.workflow.profile = { ...savedProfile, coreBehavior: "" };
    database.projects.push(project);
    await writeDatabase(database);
    return structuredClone(project);
  });
}

export function applyBuildResult(id: string, build: BuildResult): Promise<LocalProject | null> {
  return serialized(async () => {
    const database = await readDatabase();
    const project = database.projects.find((item) => item.id === id);
    if (!project) return null;
    const now = new Date().toISOString();
    project.build = build;
    const workflow = workflowFor(project);
    workflow.phase = "circuit";
    workflow.circuitApprovedAt = null;
    workflow.mockupApprovedAt = null;
    project.workflow = workflow;
    project.stage = "spec";
    project.designRevision += 1;
    project.lastAgentMode = "live";
    project.updatedAt = now;
    const existing = new Set(project.tasks.filter((task) => task.status === "ready").map((task) => `${task.kind}:${task.title}`));
    const evaluatorTasks = [
      ...build.evaluator.hw.requiredMeasurements.map((plain, index) => ({ kind: "measure" as const, title: `회로 계측 ${index + 1}`, plain })),
      ...build.evaluator.sw.requiredRuns.map((plain, index) => ({ kind: "run_firmware" as const, title: `펌웨어 확인 ${index + 1}`, plain }))
    ];
    for (const task of evaluatorTasks) {
      const key = `${task.kind}:${task.title}`;
      const current = project.tasks.find((item) => item.status === "ready" && `${item.kind}:${item.title}` === key);
      if (current) current.plain = task.plain;
      else if (!existing.has(key)) project.tasks.push({ ...task, id: randomUUID(), status: "ready" });
    }
    project.messages.push({ id: randomUUID(), role: "assistant", text: `회로·3D 목업·펌웨어 초안을 만들고 Evaluator 검토를 마쳤습니다. ${build.evaluator.summary}`, createdAt: now });
    await writeDatabase(database);
    return structuredClone(project);
  });
}

// userText null keeps the conversation out of the record: connector users talk
// in their own Claude, and only the design facts in the plan are stored here.
export function applyAgentPlan(id: string, userText: string | null, plan: AgentPlan, mode: LocalProject["lastAgentMode"], attachments: ImageAttachment[] = []): Promise<LocalProject | null> {
  return serialized(async () => {
    const database = await readDatabase();
    const project = database.projects.find((item) => item.id === id);
    if (!project) return null;
    const now = new Date().toISOString();
    const updates = new Map(plan.slotUpdates.map((slot) => [slot.key, slot]));
    project.slots = project.slots.map((slot) => ({ ...slot, ...updates.get(slot.key) }));
    project.name = plan.projectName || project.name;
    project.oneLiner = plan.oneLiner || project.oneLiner;
    project.tasks.push(...plan.tasks.map((task) => ({ ...task, id: randomUUID(), status: "ready" as const })));
    if (userText !== null) project.messages.push(
      { id: randomUUID(), role: "user", text: userText, createdAt: now, channel: "main", attachments },
      { id: randomUUID(), role: "assistant", text: plan.reply, createdAt: now, agent: "chief", channel: "main" }
    );
    project.designRevision += 1;
    project.lastAgentMode = mode;
    project.updatedAt = now;
    await writeDatabase(database);
    return structuredClone(project);
  });
}

export function mutateProject(id: string, operation: (project: LocalProject) => void, expectedRevision?: number): Promise<LocalProject> {
  return serialized(async () => {
    const database = await readDatabase();
    const project = database.projects.find((item) => item.id === id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");
    if (expectedRevision !== undefined && project.designRevision !== expectedRevision) throw new Error("다른 변경이 먼저 저장됐습니다. 새로고침 후 다시 시도해주세요.");
    operation(project);
    project.designRevision++;
    project.updatedAt = new Date().toISOString();
    await writeDatabase(database);
    return structuredClone(project);
  });
}

function profileFor(database: Database, ownerId: string | null): MakerProfile | null {
  return ownerId ? database.profiles?.[ownerId] ?? null : database.profile ?? null;
}
export async function getMakerProfile(ownerId: string | null = null) { await queue; return profileFor(await readDatabase(), ownerId); }
export function saveMakerProfile(profile: MakerProfile, ownerId: string | null = null) {
  return serialized(async () => {
    const database = await readDatabase();
    if (ownerId) database.profiles = { ...database.profiles, [ownerId]: profile };
    else database.profile = profile;
    await writeDatabase(database);
    return profile;
  });
}

// Permanently removes everything a participant left: projects and maker profile.
export function deleteOwnerData(ownerId: string): Promise<number> {
  return serialized(async () => {
    const database = await readDatabase();
    const kept = database.projects.filter((project) => project.ownerId !== ownerId);
    const keptHidden = database.hidden.projects.filter((project) => project.ownerId !== ownerId);
    const removed = database.projects.length - kept.length + database.hidden.projects.length - keptHidden.length;
    database.projects = kept;
    database.hidden.projects = keptHidden;
    if (database.profiles) delete database.profiles[ownerId];
    delete database.hidden.profiles[ownerId];
    await writeDatabase(database);
    return removed;
  });
}

// Side notes (activity, live status, requests) that must not bump the design
// revision, so they never collide with the person's own edits.
export function annotateProject(id: string, operation: (project: LocalProject) => void): Promise<LocalProject | null> {
  return serialized(async () => {
    const database = await readDatabase();
    const project = database.projects.find((item) => item.id === id);
    if (!project) return null;
    operation(project);
    await writeDatabase(database);
    return structuredClone(project);
  });
}

// Re-seals everything a participant owns under a new link token. Runs inside
// the store queue so no write can land between opening and re-sealing.
export function rekeyOwnerData(from: Vault, to: Vault, commit: () => Promise<void>): Promise<number> {
  return serialized(async () => {
    if (from.ownerId !== to.ownerId) throw new Error("다른 사람의 기록은 옮길 수 없습니다.");
    const database = await withVault(from, () => readDatabase());
    const owned = database.projects.filter((project) => project.ownerId === from.ownerId).length;
    if (database.hidden.projects.some((project) => project.ownerId === from.ownerId)) throw new Error("열 수 없는 기록이 있어 링크를 바꾸지 않았어요.");
    const previous = await readStored();
    await withVault(to, () => writeDatabase(database));
    try {
      await commit();
    } catch (error) {
      await writeStored(previous);
      throw error;
    }
    return owned;
  });
}

// Everything this participant can open, for their own download.
export async function exportOwnerData(ownerId: string): Promise<{ projects: LocalProject[]; profile: MakerProfile | null }> {
  await queue;
  const database = await readDatabase();
  return { projects: database.projects.filter((project) => project.ownerId === ownerId), profile: profileFor(database, ownerId) };
}

export async function countOwnerProjects(ownerId: string): Promise<number> {
  await queue;
  const stored = await readStored();
  return stored.projects.filter((project) => project.ownerId === ownerId).length;
}
