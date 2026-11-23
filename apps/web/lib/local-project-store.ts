import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentPlan, BuildResult, DesignSlot, ImageAttachment, LocalProject, MakerProfile } from "./project-types";
import { emptyProfile, personPart, workflowFor } from "./workflow";
import { forgetLegacyTokens, takeLegacyTokens } from "./users";
import { currentVault, open, seal, vaultFor, withVault, type Vault } from "./vault";
import { importOnce, readRows, snapshotOf, usingPostgres, writeRows, type Row } from "./row-store";

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
// 읽을 때 본 모습. 쓸 때 이것과 달라진 행만 쓴다 (row-store.ts의 설명 참고).
// Database로 풀었다가 StoredDatabase로 다시 묶는 동안 함께 따라다녀야 해서
// 심볼 키로 붙인다 — 전개 연산자({...x})가 심볼 키를 그대로 옮겨준다.
const SNAPSHOT = Symbol("rows-as-read");
type Snapshot = { projects: Map<string, string>; profiles: Map<string, string> };
// 운영자의 옛 전역 프로필에는 ownerId가 없다. 행으로 옮기면서 이 이름을 준다.
// 참여자 ownerId는 UUID라서 겹치지 않는다.
const OPERATOR_PROFILE = "(operator)";
type StoredDatabase = { version: 1; projects: Array<LocalProject | SealedProject>; profile?: MakerProfile; profiles?: Record<string, MakerProfile | SealedProfile>; [SNAPSHOT]?: Snapshot };
// In memory: the operator's projects and the current participant's opened
// records are plain; every other participant's records stay sealed in hidden.
type Database = { version: 1; projects: LocalProject[]; profile?: MakerProfile; profiles?: Record<string, MakerProfile>; hidden: { projects: SealedProject[]; profiles: Record<string, SealedProfile> }; [SNAPSHOT]?: Snapshot };
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

async function readFileStored(): Promise<StoredDatabase> {
  try {
    const parsed = JSON.parse(await readFile(/* turbopackIgnore: true */ dataFile(), "utf8")) as StoredDatabase;
    if (parsed.version !== 1 || !Array.isArray(parsed.projects)) throw new Error("저장된 프로젝트 형식을 읽을 수 없습니다.");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, projects: [] };
    throw error;
  }
}

// 볼륨에 있던 local-projects.json을 처음 한 번만 옮긴다. 봉인된 기록은 봉인된
// 채로 옮긴다 — 서버는 열쇠가 없어서 열 수도 없고, 열 이유도 없다.
let imported: Promise<void> | null = null;
function importProjectsOnce(): Promise<void> {
  imported ??= importOnce(`projects:${dataFile()}`, async () => {
    const file = await readFileStored();
    const profiles: Row[] = Object.entries(file.profiles ?? {}).map(([ownerId, profile]) => ({ id: ownerId, data: profile }));
    if (file.profile) profiles.push({ id: OPERATOR_PROFILE, data: file.profile });
    return [
      { table: "forge_projects" as const, rows: file.projects.map((project): Row => ({ id: project.id, data: project })) },
      { table: "forge_profiles" as const, rows: profiles }
    ];
  }).then(() => undefined).catch((error) => { imported = null; throw error; });
  return imported;
}

async function readStored(): Promise<StoredDatabase> {
  if (!usingPostgres()) return readFileStored();
  await importProjectsOnce();
  const [projects, profiles] = await Promise.all([readRows("forge_projects"), readRows("forge_profiles")]);
  const operator = profiles.find((row) => row.id === OPERATOR_PROFILE);
  return {
    version: 1,
    projects: projects.map((row) => row.data as LocalProject | SealedProject),
    ...(operator ? { profile: operator.data as MakerProfile } : {}),
    profiles: Object.fromEntries(profiles.filter((row) => row.id !== OPERATOR_PROFILE).map((row) => [row.id, row.data as MakerProfile | SealedProfile])),
    [SNAPSHOT]: { projects: snapshotOf(projects), profiles: snapshotOf(profiles) }
  };
}

async function writeStored(database: StoredDatabase) {
  if (usingPostgres()) {
    const before = database[SNAPSHOT] ?? { projects: new Map(), profiles: new Map() };
    const profiles: Row[] = Object.entries(database.profiles ?? {}).map(([ownerId, profile]) => ({ id: ownerId, data: profile }));
    if (database.profile) profiles.push({ id: OPERATOR_PROFILE, data: database.profile });
    await writeRows("forge_projects", database.projects.map((project): Row => ({ id: project.id, data: project })), before.projects);
    await writeRows("forge_profiles", profiles, before.profiles);
    return;
  }
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
  const database: Database = { version: 1, projects: [], ...(stored.profile ? { profile: stored.profile } : {}), hidden: { projects: [], profiles: {} }, ...(stored[SNAPSHOT] ? { [SNAPSHOT]: stored[SNAPSHOT] } : {}) };
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
  // 직접 정한 순서가 있으면 그것이 먼저다. 아직 한 번도 끌어놓지 않았으면 예전처럼
  // 최근 작업 순서를 쓴다(order가 모두 없어 비기므로 updatedAt으로 넘어간다).
  return (await readDatabase()).projects
    .filter((project) => (ownerId === null ? !project.ownerId : project.ownerId === ownerId))
    .toSorted((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || b.updatedAt.localeCompare(a.updatedAt));
}

// 이름 바꾸기. 내용은 그대로 두고 이름만 바꾸므로 updatedAt도 올리지 않는다.
export function renameProject(id: string, ownerId: string | null, name: string): Promise<LocalProject | null> {
  return serialized(async () => {
    const database = await readDatabase();
    const project = database.projects.find((item) => item.id === id);
    if (!project || (ownerId === null ? !!project.ownerId : project.ownerId !== ownerId)) return null;
    project.name = name;
    await writeDatabase(database);
    return structuredClone(project);
  });
}

// 끌어놓아 정한 순서를 받는다. 보낸 목록에 없는 내 프로젝트는 뒤로 붙여서,
// 다른 탭에서 새 프로젝트가 생겨도 사라지지 않게 한다.
export function reorderProjects(ownerId: string | null, ids: string[]): Promise<LocalProject[]> {
  return serialized(async () => {
    const database = await readDatabase();
    const mine = database.projects.filter((project) => (ownerId === null ? !project.ownerId : project.ownerId === ownerId));
    const ranked = [...ids.filter((id) => mine.some((project) => project.id === id)), ...mine.filter((project) => !ids.includes(project.id)).map((project) => project.id)];
    for (const project of mine) project.order = ranked.indexOf(project.id);
    await writeDatabase(database);
    return structuredClone(mine.toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  });
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
    // 새 프로젝트는 '사람'에 붙은 것만 물려받는다. 지난 프로젝트의 예산·기한·용도가
    // 따라 들어오면 안 된다.
    const savedProfile = profileFor(database, owner.ownerId ?? null);
    if (savedProfile) {
      project.workflow.profile = { ...emptyProfile(), ...personPart(savedProfile) };
      if (savedProfile.devProfile) project.workflow.devProfile = savedProfile.devProfile;
    }
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
// 계정에는 사람 쪽 값만 담는다. 핵심 동작·예산·기한은 프로젝트의 것이라
// 계정에 올려두면 다음 프로젝트로 새어 들어간다.
// 저장하면 그 사람의 다른 프로젝트에도 사람 쪽 값을 함께 맞춘다. 장비를 한 번
// 바꿨는데 어떤 프로젝트는 옛날 장비로 설계되는 일이 없도록.
export function saveMakerProfile(profile: MakerProfile, ownerId: string | null = null) {
  return serialized(async () => {
    const database = await readDatabase();
    const person = personPart(profile);
    if (ownerId) {
      database.profiles = { ...database.profiles, [ownerId]: { ...emptyProfile(), ...person } };
      for (const project of database.projects) {
        if (project.ownerId !== ownerId || !project.workflow) continue;
        // updatedAt은 건드리지 않는다. 장비를 바꾼 것은 그 프로젝트를 작업한 게 아니라서,
        // 여기서 시각을 올리면 목록 순서가 통째로 흔들린다.
        project.workflow.profile = { ...project.workflow.profile, ...person };
        if (person.devProfile) project.workflow.devProfile = person.devProfile;
      }
    } else {
      database.profile = { ...emptyProfile(), ...person };
    }
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

// Permanently removes one project. The owner check runs here too, so a caller
// that skipped canAccess still cannot delete someone else's project.
export function deleteProject(id: string, ownerId: string | null): Promise<boolean> {
  return serialized(async () => {
    const database = await readDatabase();
    const project = database.projects.find((item) => item.id === id);
    if (!project || (ownerId === null ? Boolean(project.ownerId) : project.ownerId !== ownerId)) return false;
    database.projects = database.projects.filter((item) => item.id !== id);
    await writeDatabase(database);
    return true;
  });
}
