import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProject, listProjects, renameProject, reorderProjects } from "../apps/web/lib/local-project-store";
import type { AgentPlan } from "../apps/web/lib/project-types";

let folder: string;
const plan: AgentPlan = { projectName: "테스트", oneLiner: "순서 확인", reply: "네", slotUpdates: [], tasks: [] };
const OWNER = "owner-order";
const names = async (ownerId: string) => (await listProjects(ownerId)).map((p) => p.name);

beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "forge-order-test-"));
  vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
  vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
  vi.stubEnv("APP_MODE", "mock");
});
afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });

describe("프로젝트 목록 순서와 이름", () => {
  it("순서를 정하기 전에는 최근 작업 순으로 보인다", async () => {
    await createProject("첫째", { ...plan, projectName: "첫째" }, "mock", [], { ownerId: OWNER });
    await new Promise((r) => setTimeout(r, 5));
    await createProject("둘째", { ...plan, projectName: "둘째" }, "mock", [], { ownerId: OWNER });
    expect(await names(OWNER)).toEqual(["둘째", "첫째"]);
  });

  it("끌어놓은 순서가 최근 작업 순서를 이긴다", async () => {
    const mine = await listProjects(OWNER);
    const flipped = [...mine].reverse().map((p) => p.id);
    await reorderProjects(OWNER, flipped);
    expect(await names(OWNER)).toEqual(["첫째", "둘째"]);
  });

  it("보낸 목록에 없던 프로젝트도 사라지지 않고 뒤에 붙는다", async () => {
    const before = await listProjects(OWNER);
    const fresh = await createProject("셋째", { ...plan, projectName: "셋째" }, "mock", [], { ownerId: OWNER });
    // 다른 탭에서 만들어진 프로젝트를 모르는 채로 예전 순서만 보낸 상황.
    await reorderProjects(OWNER, before.map((p) => p.id));
    const after = await names(OWNER);
    expect(after).toContain("셋째");
    expect(after.at(-1)).toBe("셋째");
    expect(after).toHaveLength(3);
    expect((await listProjects(OWNER)).find((p) => p.id === fresh.id)?.order).toBe(2);
  });

  it("남의 프로젝트 순서는 건드리지 않는다", async () => {
    const other = await createProject("남의 것", { ...plan, projectName: "남의 것" }, "mock", [], { ownerId: "owner-other" });
    await reorderProjects(OWNER, (await listProjects(OWNER)).map((p) => p.id).reverse());
    expect((await listProjects("owner-other")).map((p) => p.id)).toEqual([other.id]);
  });

  it("이름을 바꿔도 주인이 아니면 거절한다", async () => {
    const mine = (await listProjects(OWNER))[0];
    expect(await renameProject(mine.id, "owner-other", "가로채기")).toBeNull();
    expect((await listProjects(OWNER))[0].name).toBe(mine.name);
    const renamed = await renameProject(mine.id, OWNER, "새 이름");
    expect(renamed?.name).toBe("새 이름");
  });

  it("이름만 바꿀 때는 최근 작업 시각을 올리지 않는다", async () => {
    const before = (await listProjects(OWNER))[0];
    await renameProject(before.id, OWNER, "또 바꾼 이름");
    const after = (await listProjects(OWNER)).find((p) => p.id === before.id);
    expect(after?.updatedAt).toBe(before.updatedAt);
  });
});
