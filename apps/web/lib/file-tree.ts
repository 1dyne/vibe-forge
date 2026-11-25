import type { AgentId, ChatChannel, LocalProject } from "./project-types";
import { workbenchDownloadUrl, workbenchItems, type WorkbenchItem } from "./workbench";
import { AGENTS } from "./workflow";

// 파일을 "누가 만든 · 무엇의 · 몇 번째 판"으로 모아 본다.
//
// 지금까지 파일은 한 줄 목록이었고, 이름 규칙이 섞여 있었고, 어느 것을 출력해야
// 하는지는 사람이 기억해야 했다. 여기서는 세 가지를 정한다.
//   1. 달그락 > 대상 > 판(최신이 위)으로 묶는다.
//   2. '최종'은 사람만 붙인다. 달그락은 붙일 수 없다.
//   3. 최종 뒤에 바뀐 것은 '개정 N 초안'이고, 사람이 다시 최종으로 표시하기 전에는
//      출력용이 아니다. 대상마다 출력용은 많아야 하나다.
//
// 저장된 파일명은 건드리지 않는다(내려받기와 달그락이 읽는 이름이 달라지면 안 된다).
// 통일된 이름은 displayName으로 따로 준다.

export type FileMark = {
  state: "draft" | "final" | "superseded";
  /** 0 = 첫 최종, 1 = 개정1 … 최종으로 표시될 때마다 그 대상에서 하나씩 올라간다 */
  revision: number;
  subject: string;
  markedAt: string;
  finalAt?: string;
  /** 최종으로 표시할 때의 내용 지문. 같은 자리의 파일이 그 뒤에 바뀌었는지 알아본다 */
  hash?: string;
};
export type FileMarks = Record<string, FileMark>;

export type FileVersion = {
  itemId: string;
  /** 저장된 이름. 내려받기와 대화에서 쓰는 정확한 이름 */
  filename: string;
  /** 통일된 이름: 프로젝트_달그락_대상_상태.확장자 */
  displayName: string;
  ext: string;
  agent: AgentId;
  /** draft = 초안, final = 지금 유효한 최종, revised = 최종 뒤에 바뀐 초안, superseded = 대체된 예전 최종 */
  state: "draft" | "final" | "revised" | "superseded";
  /** 화면에 붙일 말: 초안 2 · 최종 · 개정 1 · 개정 1 초안 · 대체됨 */
  label: string;
  revision: number;
  /** 3D 출력·재단처럼 실제로 뽑는 파일인가 */
  printable: boolean;
  createdAt: string | null;
  /** 어느 대장간의 대화에서 나왔는지. 알 수 없으면 null */
  fromChannel: ChatChannel | null;
  url: string;
  /** 최종으로 표시한 뒤 같은 자리의 내용이 바뀌었다(그래서 더는 최종이 아니다) */
  changedSinceFinal: boolean;
};
export type FileSubject = { key: string; name: string; agent: AgentId; versions: FileVersion[]; /** 지금 유효한 최종. 없으면 null */ current: FileVersion | null };
export type FileGroup = { agent: AgentId; name: string; subjects: FileSubject[] };
export type FileTree = { projectId: string; groups: FileGroup[]; total: number };

const PRINTABLE = new Set(["stl", "3mf", "step", "stp", "svg", "dxf", "scad", "gcode"]);
const AGENT_ORDER: AgentId[] = ["chief", "hw", "me", "id", "sw"];
const SW_FILES = new Set(["spec.md", "claude.md", "agents.md", "contract.ts"]);

/** 내용이 바뀌었는지만 가리면 된다. 암호용이 아니고, 브라우저에서도 같은 값이 나와야 한다 */
export function contentHash(content: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) { h ^= content.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${content.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

const extOf = (filename: string) => (/\.([A-Za-z0-9]+)$/.exec(filename)?.[1] ?? "").toLowerCase();
const stemOf = (project: Pick<LocalProject, "name">) => project.name.replace(/[\\/:*?"<>|\r\n]/g, "-").slice(0, 80) || "project";
/** 이름 조각 안의 빈칸과 구분자를 하이픈으로. 밑줄은 조각 사이에만 쓴다 */
const token = (value: string) => value.trim().replace(/[\s_\\/:*?"<>|]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "파일";

const DOCUMENT_SUBJECT: Record<string, [AgentId, string]> = {
  "document:mockup": ["me", "정밀 목업"],
  "document:product": ["id", "완성품 형태"],
  "document:assembly": ["hw", "조립 가이드"],
  "document:housing": ["me", "하우징 계획"],
  "document:power": ["hw", "전원"],
  "document:contract": ["hw", "데이터 약속"],
  "document:tests": ["hw", "테스트"],
  "document:safety": ["id", "안전"],
  "document:plan": ["chief", "설계도"],
  "document:bom": ["chief", "부품목록"],
  "document:tasks": ["chief", "작업목록"],
  "document:record": ["chief", "팀기록"],
  "contract:h": ["hw", "데이터 약속 코드(보드)"],
  "contract:ts": ["sw", "데이터 약속 코드(앱)"]
};
const HOUSING_KIND: Record<string, string> = { stl: "", unfold: " 전개도", cut: " 재단", mold: " 주형계획" };

/** 달그락이 붙인 판 표시(_v2, -초안3, (2), _final …)를 떼어 같은 대상으로 묶는다 */
function subjectFromFilename(filename: string): string {
  const base = filename.replace(/\.[A-Za-z0-9]+$/, "");
  const cleaned = base
    .replace(/[\s_-]*\(\d+\)$/u, "")
    .replace(/[\s_-]*(v|ver|rev|r)\.?\d+$/iu, "")
    .replace(/[\s_-]*(초안|개정|draft)[\s_-]*\d*$/iu, "")
    .replace(/[\s_-]*(최종|final)$/iu, "")
    .replace(/[\s_-]+\d+$/u, "");
  return cleaned.trim() || base;
}

type Draft = { item: WorkbenchItem; agent: AgentId; subject: string; createdAt: string | null; fromChannel: ChatChannel | null };

function classify(project: LocalProject, item: WorkbenchItem): Draft {
  const fixed = DOCUMENT_SUBJECT[item.id];
  if (fixed) {
    const at = item.id === "document:product" ? project.productForm?.updatedAt
      : item.id === "document:plan" ? project.buildPlan?.updatedAt
      : item.id === "document:housing" ? project.housing?.updatedAt
      : item.id === "document:mockup" ? project.preciseMockup?.updatedAt
      : undefined;
    return { item, agent: fixed[0], subject: fixed[1], createdAt: at ?? null, fromChannel: null };
  }
  if (item.id.startsWith("housing:")) {
    const [, regionId, kind] = item.id.split(":");
    const region = project.housing?.regions.find((r) => r.id === regionId);
    return { item, agent: "me", subject: `하우징 ${region?.name ?? regionId}${HOUSING_KIND[kind] ?? ""}`, createdAt: project.housing?.updatedAt ?? null, fromChannel: null };
  }
  if (item.id.startsWith("artifact:")) {
    const artifact = project.build?.artifacts.find((a) => `artifact:${a.id}` === item.id);
    const [agent, subject]: [AgentId, string] = item.kind === "cad" ? ["me", "외형 목업"] : item.kind === "firmware" ? ["hw", "펌웨어"] : ["hw", "회로"];
    return { item, agent, subject, createdAt: artifact?.createdAt ?? null, fromChannel: null };
  }
  if (item.id.startsWith("file:")) {
    const file = project.workspaceFiles?.find((f) => `file:${f.id}` === item.id);
    const agent: AgentId = file?.agent ?? (SW_FILES.has(item.filename.toLowerCase()) ? "sw" : "chief");
    // 팀 대화 한 턴은 답과 파일을 같은 시각으로 남긴다. 그 답이 있던 대장간이 파일이 나온 곳이다.
    const said = file ? project.messages.find((m) => m.role === "assistant" && m.createdAt === file.createdAt) : undefined;
    return { item, agent, subject: subjectFromFilename(item.filename), createdAt: file?.createdAt ?? null, fromChannel: said ? said.channel ?? "main" : file ? agent : null };
  }
  return { item, agent: "chief", subject: subjectFromFilename(item.filename), createdAt: null, fromChannel: null };
}

const time = (value: string | null | undefined) => { const t = value ? new Date(value).getTime() : NaN; return Number.isFinite(t) ? t : null; };

export function buildFileTree(project: LocalProject | null): FileTree {
  if (!project) return { projectId: "", groups: [], total: 0 };
  const marks = project.fileMarks ?? {};
  const stem = token(stemOf(project));
  const drafts = workbenchItems(project, { files: true }).map((item) => classify(project, item));
  const bySubject = new Map<string, Draft[]>();
  for (const draft of drafts) {
    // 같은 이름의 대상이라도 확장자가 다르면 다른 줄이다(뚜껑.stl과 뚜껑.scad는 따로 최종이 된다).
    const key = `${draft.agent}|${draft.subject}|${extOf(draft.item.filename)}`;
    bySubject.set(key, [...(bySubject.get(key) ?? []), draft]);
  }

  const subjects: FileSubject[] = [];
  for (const [key, list] of bySubject) {
    // 오래된 것부터 번호를 매긴다. 시각을 모르는 것은 들어온 순서를 따른다.
    const ordered = list.map((draft, index) => ({ draft, index })).sort((a, b) => (time(a.draft.createdAt) ?? 0) - (time(b.draft.createdAt) ?? 0) || a.index - b.index).map((x) => x.draft);
    const { agent, subject } = ordered[0];
    const ext = extOf(ordered[0].item.filename);
    const subjectMarks = Object.values(marks).filter((m) => m.subject === key && (m.state === "final" || m.state === "superseded"));
    const topRevision = subjectMarks.length ? Math.max(...subjectMarks.map((m) => m.revision)) : -1;
    const firstFinalAt = subjectMarks.map((m) => time(m.finalAt ?? m.markedAt)).filter((t): t is number => t != null).sort((a, b) => a - b)[0] ?? null;
    let draftNo = 0;
    const versions = ordered.map(({ item, createdAt, fromChannel }): FileVersion => {
      const mark = marks[item.id];
      const changed = mark?.state === "final" && !!mark.hash && mark.hash !== contentHash(item.content);
      let state: FileVersion["state"]; let label: string; let revision = mark?.revision ?? 0; let nameState: string;
      if (mark?.state === "final" && !changed) { state = "final"; label = revision ? `개정 ${revision}` : "최종"; nameState = revision ? `개정${revision}` : "최종"; }
      else if (mark?.state === "superseded") { state = "superseded"; label = "대체됨"; nameState = revision ? `개정${revision}-대체됨` : "최종-대체됨"; }
      else {
        const made = time(createdAt);
        // 최종 뒤에 바뀌었거나(같은 자리), 최종 뒤에 새로 나온 판이면 개정 초안이다.
        const afterFinal = changed || (firstFinalAt != null && topRevision >= 0 && (made == null || made > firstFinalAt));
        if (afterFinal) { state = "revised"; revision = topRevision + 1; label = `개정 ${revision} 초안`; nameState = `개정${revision}-초안`; }
        else { state = "draft"; draftNo += 1; revision = 0; label = `초안 ${draftNo}`; nameState = `초안${draftNo}`; }
      }
      return {
        itemId: item.id, filename: item.filename, ext, agent, state, label, revision,
        displayName: `${stem}_${AGENTS[agent].short}_${token(subject)}_${nameState}${ext ? `.${ext}` : ""}`,
        printable: PRINTABLE.has(ext), createdAt, fromChannel, url: workbenchDownloadUrl(project.id, item.id), changedSinceFinal: changed
      };
    }).reverse();
    subjects.push({ key, name: subject, agent, versions, current: versions.find((v) => v.state === "final") ?? null });
  }

  const groups = AGENT_ORDER.map((agent): FileGroup => ({ agent, name: AGENTS[agent].name, subjects: subjects.filter((s) => s.agent === agent) })).filter((group) => group.subjects.length > 0);
  return { projectId: project.id, groups, total: drafts.length };
}

export class FileMarkError extends Error {}

/** 사람이 "이것이 최종"이라고 표시한다. 같은 대상의 다른 최종은 대체됨이 된다. 새 표시 묶음을 돌려준다. */
export function markFinal(project: LocalProject, itemId: string, now = new Date().toISOString()): FileMarks {
  const tree = buildFileTree(project);
  const subject = tree.groups.flatMap((g) => g.subjects).find((s) => s.versions.some((v) => v.itemId === itemId));
  const item = workbenchItems(project, { files: true }).find((i) => i.id === itemId);
  if (!subject || !item) throw new FileMarkError("파일을 찾을 수 없어요. 목록을 새로고침해 주세요.");
  const marks: FileMarks = { ...(project.fileMarks ?? {}) };
  const version = subject.versions.find((v) => v.itemId === itemId)!;
  if (version.state === "final") return marks;
  const earlier = Object.values(marks).filter((m) => m.subject === subject.key && (m.state === "final" || m.state === "superseded"));
  const revision = earlier.length ? Math.max(...earlier.map((m) => m.revision)) + 1 : 0;
  for (const other of subject.versions) {
    const mark = marks[other.itemId];
    if (other.itemId !== itemId && mark?.state === "final") marks[other.itemId] = { ...mark, state: "superseded", markedAt: now };
  }
  marks[itemId] = { state: "final", revision, subject: subject.key, markedAt: now, finalAt: now, hash: contentHash(item.content) };
  return marks;
}

/** 최종 표시를 거둔다(잘못 눌렀을 때). 대체됐던 예전 최종을 되살리지는 않는다 — 다시 표시하면 된다. */
export function unmarkFinal(project: LocalProject, itemId: string): FileMarks {
  const marks: FileMarks = { ...(project.fileMarks ?? {}) };
  if (!marks[itemId]) throw new FileMarkError("최종으로 표시된 파일이 아니에요.");
  delete marks[itemId];
  return marks;
}

/** 출력용: 뽑는 파일 가운데 지금 유효한 최종. 대상마다 많아야 하나다. */
export function outputFiles(tree: FileTree): FileVersion[] {
  return tree.groups.flatMap((g) => g.subjects).map((s) => s.current).filter((v): v is FileVersion => !!v && v.printable);
}

/** 대화 속 파일명을 알아보기 위한 색인. 긴 이름부터(짧은 이름이 긴 이름 속에서 먼저 걸리지 않게). */
export function fileNameIndex(project: LocalProject | null): Array<{ name: string; itemId: string; url: string }> {
  const seen = new Map<string, { name: string; itemId: string; url: string }>();
  // 최신 판이 앞에 오므로, 같은 이름이 여러 판에 있으면 최신 것을 가리킨다.
  for (const version of buildFileTree(project).groups.flatMap((g) => g.subjects).flatMap((s) => s.versions)) {
    for (const name of [version.filename, version.displayName]) if (name.length >= 4 && !seen.has(name)) seen.set(name, { name, itemId: version.itemId, url: version.url });
  }
  return [...seen.values()].sort((a, b) => b.name.length - a.name.length || a.name.localeCompare(b.name));
}
