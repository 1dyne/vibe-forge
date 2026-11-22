import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProject, getMakerProfile, listProjects, saveMakerProfile } from "../apps/web/lib/local-project-store";
import { emptyProfile } from "../apps/web/lib/workflow";
import type { AgentPlan, MakerProfile } from "../apps/web/lib/project-types";

let folder: string;
const plan: AgentPlan = { projectName: "테스트", oneLiner: "프로필 범위 확인", reply: "네", slotUpdates: [], tasks: [] };
const OWNER = "owner-1";

// 사람에게 붙는 값(장비·경험·지역·메이커스페이스)과 프로젝트마다 달라지는 값
// (핵심 동작·예산·기한·용도)이 한 타입에 섞여 있다. 섞인 채로 저장하면 지난
// 프로젝트의 예산이 새 프로젝트로 따라 들어온다.
const filled = (): MakerProfile => ({
  ...emptyProfile(),
  tools: ["멀티미터", "납땜 도구"], toolsConfirmed: true, firmwareExperience: "guided",
  solderingSkill: "tried", printerAccess: "makerspace", region: "서울 마포구", travelRange: "transit30",
  makerspaces: [{ id: "a1", name: "마포 무한상상실", where: "서울 마포구", printers: "뱀부랩 P1S", maxPrintMm: [256, 256, 256], url: "https://example.test", note: "교육 이수 필요" }],
  coreBehavior: "버튼을 누르면 불이 켜진다", budgetKRW: 120_000, purpose: "personal", timelineWeeks: 4
});

beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "forge-profile-test-"));
  vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
  vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
  vi.stubEnv("APP_MODE", "mock");
});
afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });

describe("제작 프로필의 범위", () => {
  it("계정에는 사람 쪽 값만 담고 프로젝트 쪽 값은 올리지 않는다", async () => {
    await saveMakerProfile(filled(), OWNER);
    const saved = await getMakerProfile(OWNER);
    expect(saved?.tools).toEqual(["멀티미터", "납땜 도구"]);
    expect(saved?.region).toBe("서울 마포구");
    expect(saved?.makerspaces?.[0].name).toBe("마포 무한상상실");
    // 프로젝트의 것이라 계정에 남으면 안 된다.
    expect(saved?.coreBehavior).toBe("");
    expect(saved?.budgetKRW).toBeUndefined();
    expect(saved?.timelineWeeks).toBeUndefined();
    expect(saved?.purpose).toBeUndefined();
  });

  it("새 프로젝트는 장비와 경험만 물려받고 지난 예산은 따라오지 않는다", async () => {
    await saveMakerProfile(filled(), OWNER);
    const project = await createProject("새 아이디어", plan, "mock", [], { ownerId: OWNER });
    const profile = project.workflow!.profile;
    expect(profile.tools).toEqual(["멀티미터", "납땜 도구"]);
    expect(profile.firmwareExperience).toBe("guided");
    expect(profile.makerspaces?.[0].maxPrintMm).toEqual([256, 256, 256]);
    // 여기가 핵심. 지난 프로젝트의 예산·기한·핵심 동작이 새 프로젝트에 들어오면 안 된다.
    expect(profile.coreBehavior).toBe("");
    expect(profile.budgetKRW).toBeUndefined();
    expect(profile.timelineWeeks).toBeUndefined();
  });

  it("장비를 바꾸면 이미 있던 내 프로젝트에도 함께 반영된다", async () => {
    await saveMakerProfile(filled(), OWNER);
    const first = await createProject("먼저 만든 것", plan, "mock", [], { ownerId: OWNER });
    expect(first.workflow!.profile.tools).toEqual(["멀티미터", "납땜 도구"]);

    await saveMakerProfile({ ...filled(), tools: ["멀티미터", "납땜 도구", "3D 프린터"] }, OWNER);
    const after = (await listProjects(OWNER)).find((p) => p.id === first.id);
    expect(after?.workflow?.profile.tools).toContain("3D 프린터");
  });

  it("남의 프로젝트는 건드리지 않는다", async () => {
    const other = await createProject("남의 프로젝트", plan, "mock", [], { ownerId: "owner-2" });
    await saveMakerProfile({ ...filled(), tools: ["니퍼"] }, OWNER);
    const after = (await listProjects("owner-2")).find((p) => p.id === other.id);
    expect(after?.workflow?.profile.tools).not.toContain("니퍼");
  });
});
