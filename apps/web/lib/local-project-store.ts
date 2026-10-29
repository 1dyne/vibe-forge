import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentPlan, BuildResult, DesignSlot, ImageAttachment, LocalProject, MakerProfile } from "./project-types";
import { workflowFor } from "./workflow";

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

type Database = { version: 1; projects: LocalProject[]; profile?: MakerProfile };
let queue: Promise<unknown> = Promise.resolve();

function dataFile() {
  if (process.env.FORGE_TEST_DATA_FILE && process.env.NODE_ENV === "test") return process.env.FORGE_TEST_DATA_FILE;
  const cwd = process.cwd();
  const workspace = path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps" ? path.resolve(cwd, "../..") : cwd;
  return path.join(workspace, ".data", "local-projects.json");
}

async function readDatabase(): Promise<Database> {
  try {
    const parsed = JSON.parse(await readFile(/* turbopackIgnore: true */ dataFile(), "utf8")) as Database;
    if (parsed.version !== 1 || !Array.isArray(parsed.projects)) throw new Error("저장된 프로젝트 형식을 읽을 수 없습니다.");
    for (const project of parsed.projects) project.workflow = workflowFor(project);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, projects: [] };
    throw error;
  }
}

async function writeDatabase(database: Database) {
  const file = dataFile();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(database, null, 2), "utf8");
  await rename(temporary, file);
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation, operation);
  queue = next.then(() => undefined, () => undefined);
  return next;
}

export async function listProjects(): Promise<LocalProject[]> {
  await queue;
  return (await readDatabase()).projects.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<LocalProject | null> {
  await queue;
  return (await readDatabase()).projects.find((project) => project.id === id) ?? null;
}

export function createProject(idea: string, plan: AgentPlan, mode: LocalProject["lastAgentMode"], attachments: ImageAttachment[] = []): Promise<LocalProject> {
  return serialized(async () => {
    const database = await readDatabase();
    const now = new Date().toISOString();
    const updates = new Map(plan.slotUpdates.map((slot) => [slot.key, slot]));
    const project: LocalProject = {
      id: randomUUID(),
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
    if (database.profile) project.workflow.profile = { ...database.profile, coreBehavior: "" };
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

export function applyAgentPlan(id: string, userText: string, plan: AgentPlan, mode: LocalProject["lastAgentMode"], attachments: ImageAttachment[] = []): Promise<LocalProject | null> {
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
    project.messages.push(
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

export async function getMakerProfile() { await queue; return (await readDatabase()).profile ?? null; }
export function saveMakerProfile(profile: MakerProfile) {
  return serialized(async () => { const database = await readDatabase(); database.profile = profile; await writeDatabase(database); return profile; });
}
