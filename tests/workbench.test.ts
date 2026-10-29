import { describe, expect, it } from "vitest";
import { workbenchItems } from "../apps/web/lib/workbench";
import type { LocalProject } from "../apps/web/lib/project-types";

function project(): LocalProject {
  return { id: "test", name: "나의 조명", idea: "조명", oneLiner: "테스트", stage: "idea", designRevision: 1, slots: [], tasks: [], messages: [], build: null, createdAt: "2026-10-27", updatedAt: "2026-10-27", lastAgentMode: "mock" };
}
function withBuild(): LocalProject {
  return { ...project(), build: { status: "ready", createdAt: "2026-10-27", blueprint: { title: "실제 조명 회로", board: "Nano", supplyVoltage: 5, components: [{ ref: "U1", type: "board", valueOrModel: "<script>bad</script>", reason: "제어" }], nets: [], enclosure: { widthMm: 60, depthMm: 40, heightMm: 25, wallMm: 2 }, firmware: { platform: "arduino", behavior: "조명", pinAssignments: [], loopSteps: [] }, assumptions: [], humanChecks: [] }, checks: [], evaluator: { summary: "실측 필요", hw: { verdict: "unknown", findings: [], requiredMeasurements: [] }, sw: { verdict: "unknown", findings: [], requiredRuns: [] } }, artifacts: [
    { id: "a", filename: "my-light.md", kind: "circuit", mimeType: "text/markdown", content: "회로", createdAt: "2026-10-27" },
    { id: "b", filename: "my-case.scad", kind: "cad", mimeType: "text/plain", content: "cube(20);", createdAt: "2026-10-27" }
  ] } };
}
describe("project workbench documents", () => {
  it("has no placeholder tabs before any deliverable exists", () => {
    expect(workbenchItems(null)).toEqual([]);
    expect(workbenchItems(project())).toEqual([]);
  });
  it("uses actual filenames and includes workshop files even without a build", () => {
    const p = project();
    p.workspaceFiles = [{ id: "room-file", filename: "unique-light.ino", content: "void setup() {}", agent: "sw", createdAt: "2026-10-27" }];
    expect(workbenchItems(p).map(i => i.filename)).toEqual(["unique-light.ino"]);
    p.workspaceFiles[0].filename = "updated-light.ino";
    expect(workbenchItems(p)[0].filename).toBe("updated-light.ino");
  });
  it("keeps CAD inaccessible before approval, including legacy projects", () => {
    const p = withBuild();
    expect(workbenchItems(p).some(i => i.kind === "cad")).toBe(false);
    p.workflow = { phase: "mockup", profile: { tools: [], toolsConfirmed: false, coreBehavior: "", firmwareExperience: "unanswered" }, activeAgents: ["hw"], circuitApprovedAt: "2026-10-27", mockupApprovedAt: null, sharedUpdates: [], purchases: {}, evidence: [] };
    expect(workbenchItems(p).find(i => i.kind === "cad")?.filename).toBe("my-case.scad");
    p.workflow.circuitApprovedAt = null;
    expect(workbenchItems(p).some(i => i.kind === "cad")).toBe(false);
  });
  it("exports project-specific BOM/tasks with escaped HTML and current status", () => {
    const p = withBuild();
    p.name = "../조명<1>";
    p.tasks = [{ id: "task", kind: "measure", title: "전압 확인", plain: "측정값 제출", status: "ready" }];
    const bom = workbenchItems(p).find(i => i.kind === "bom")!;
    expect(bom.content).not.toContain("<script>bad</script>");
    expect(bom.content).toContain("&lt;script&gt;");
    expect(bom.filename).not.toContain("/");
    expect(workbenchItems(p).find(i => i.kind === "tasks")?.content).toContain("- [ ] 전압 확인");
    p.tasks[0].status = "completed";
    expect(workbenchItems(p).find(i => i.kind === "tasks")?.content).toContain("- [x] 전압 확인");
  });
});
