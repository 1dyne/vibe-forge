import type { LocalProject } from "../project-types";

// 대장간(제작)의 진행을 마을의 방에 반영할 때 쓰는 숫자. 이름과 내용은 담지 않는다.
export type ForgeProgress = { projects: number; furthest: 0 | 1 | 2 | 3 | 4; printed: number; at: string };
export const FURTHEST_LABEL = ["아이디어", "설계도", "회로", "3D 목업", "만드는 중"] as const;

const step = (p: Pick<LocalProject, "workflow" | "buildPlan" | "build" | "preciseMockup">): ForgeProgress["furthest"] => {
  const phase = p.workflow?.phase;
  if (phase === "workshop" || phase === "handoff") return 4;
  if (p.preciseMockup || p.workflow?.mockupApprovedAt) return 3;
  if (p.build || p.workflow?.circuitApprovedAt) return 2;
  if (p.buildPlan) return 1;
  return 0;
};

export function progressOf(projects: LocalProject[], now = new Date()): ForgeProgress {
  return { projects: projects.length, furthest: projects.reduce<number>((m, p) => Math.max(m, step(p)), 0) as ForgeProgress["furthest"], printed: projects.filter((p) => p.preciseMockup).length, at: now.toISOString() };
}

export function readProgress(raw: string | null): ForgeProgress | null {
  if (!raw) return null;
  try { const p = JSON.parse(raw) as ForgeProgress; return typeof p.projects === "number" && typeof p.furthest === "number" ? p : null; } catch { return null; }
}

/** 방이 자라는 단계(1~3). 도깨비불만 있을 때의 단계보다 작아지지는 않는다 */
export const roomStage = (progress: ForgeProgress | null): 1 | 2 | 3 => (!progress ? 1 : progress.furthest >= 3 ? 3 : progress.furthest >= 1 ? 2 : 1);
