import { describe, expect, it } from "vitest";
import { projectProgress, projectStages } from "../apps/web/lib/progress";
import type { LocalProject } from "../apps/web/lib/project-types";

// 체크리스트를 통과하는 최소 프로필.
const answered = { tools: ["멀티미터"], toolsConfirmed: true, firmwareExperience: "none", coreBehavior: "버튼을 누르면 불이 켜진다" };

const steps = (count: number) => Array.from({ length: count }, (_, i) => ({ step: i + 1 }));
const built = (count: number) => Array.from({ length: count }, (_, i) => ({ step: i + 1, cardId: null, text: "됐어요", createdAt: "2026-01-01T00:00:00.000Z" }));

function project(parts: Record<string, unknown> = {}, workflow: Record<string, unknown> = {}): LocalProject {
  return {
    id: "p1", name: "테스트 프로젝트", idea: "아이디어", oneLiner: "", tasks: [], designRevision: 1, messages: [],
    workflow: { phase: "brainstorm", profile: { ...answered }, activeAgents: [], circuitApprovedAt: null, mockupApprovedAt: null, sharedUpdates: [], purchases: {}, evidence: [], ...workflow },
    ...parts
  } as unknown as LocalProject;
}

// 설계는 다 끝났지만 아직 아무것도 조립하지 않은 상태.
const designDone = (assemblySteps = 4, reports: ReturnType<typeof built> = []) => project({
  productForm: { kind: "box" },
  buildPlan: { track: "hardware", board: { model: "Nano" }, stages: [], io: { inputs: [], outputs: [], wireless: "none" }, preBuyChecks: [] },
  build: { checks: [], blueprint: { title: "회로" }, evaluator: { summary: "" } },
  assembly: { stage: "조립", steps: steps(assemblySteps), base: {}, parts: [], updatedAt: "" },
  assemblyReports: reports
}, { phase: "workshop", circuitApprovedAt: "2026-01-01T00:00:00.000Z", mockupApprovedAt: "2026-01-01T00:00:00.000Z" });

describe("프로젝트 진행률", () => {
  it("막 시작한 프로젝트는 0%이고 체크리스트가 지금 할 일이다", () => {
    const fresh = project({}, { profile: { tools: [], toolsConfirmed: false, firmwareExperience: "unanswered", coreBehavior: "" } });
    const progress = projectProgress(fresh);
    expect(progress.percent).toBe(0);
    expect(progress.current?.label).toBe("체크리스트");
    expect(progress.blocked).toBe(false);
  });

  it("설계만 끝나고 조립을 하나도 안 했으면 한참 남은 것으로 센다", () => {
    const progress = projectProgress(designDone());
    // 여덟 단계를 똑같이 1로 세면 7/8 = 88%가 나온다. 부품도 사지 않은 사람에게
    // 88%라고 말하는 셈이라, 이 숫자가 다시 그렇게 되지 않도록 잠가둔다.
    expect(progress.percent).toBeLessThan(70);
    expect(progress.percent).toBeGreaterThan(0);
    expect(projectStages(designDone()).filter((s) => s.status === "done")).toHaveLength(7);
  });

  it("조립이 진행된 만큼 올라간다", () => {
    const none = projectProgress(designDone(4, [])).percent;
    const half = projectProgress(designDone(4, built(2))).percent;
    expect(half).toBeGreaterThan(none);
    expect(half).toBeLessThan(100);
  });

  it("모든 단계를 마치면 100%다", () => {
    expect(projectProgress(designDone(4, built(4))).percent).toBe(100);
  });

  it("다 끝내기 전에는 100%라고 하지 않는다", () => {
    expect(projectProgress(designDone(4, built(3))).percent).toBeLessThan(100);
  });

  it("꼭 고칠 것은 %에 섞지 않고 따로 알린다", () => {
    const risky = project({
      productForm: { kind: "box" },
      buildPlan: { track: "hardware", board: { model: "Nano" }, stages: [], io: { inputs: [], outputs: [], wireless: "none" }, preBuyChecks: [] },
      build: { checks: [{ id: "C1", severity: "blocked", message: "전압을 확인해주세요", verdict: "fail" }], blueprint: { title: "회로" }, evaluator: { summary: "" } }
    });
    const progress = projectProgress(risky);
    expect(progress.blocked).toBe(true);
    expect(progress.current?.label).toBe("회로 · 규칙 검사");
  });
});
