import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { callTool } from "../apps/web/lib/mcp-tools";
import { tools } from "../apps/web/lib/tools/place-tools";
import { getMakerProfile, getProject } from "../apps/web/lib/local-project-store";
import { createUser } from "../apps/web/lib/users";
import { vaultFor, withVault } from "../apps/web/lib/vault";
import { workflowFor } from "../apps/web/lib/workflow";
import { checklistMissing } from "../apps/web/lib/checklist";

let folder: string;
beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "forge-place-test-"));
  vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
  vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
  vi.stubEnv("FORGE_TEST_AUDIT_FILE", path.join(folder, "audit.jsonl"));
  vi.stubEnv("APP_MODE", "mock");
  vi.stubEnv("SESSION_SECRET", "test-secret-for-place-tools-0123456789");
});
afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });
const plan = { projectName: "상자", oneLiner: "상자", reply: "좋아요", slotUpdates: [], tasks: [] };

describe("만드는 곳·예산·구매처", () => {
  it("사진이나 주소에서 읽은 메이커스페이스를 계정에 등록하고, 같은 이름은 고친다", async () => {
    const { user, token } = await createUser("만드는 사람", false);
    const context = { user, dashboardUrl: "https://forge.example/" };
    const add = tools.find((t) => t.name === "add_makerspace")!;
    await withVault(vaultFor(token, user.id), async () => {
      const id = ((await callTool("create_project", { idea: "라즈베리파이 케이스", plan }, context)).structuredContent as { id: string }).id;
      const first = await add.run({ projectId: id, name: "성수 메이커스페이스", printers: "Bambu Lab P1S", source: "photo" }, context);
      expect(first.text).toContain("비어 있는 것");
      await add.run({ projectId: id, name: "성수 메이커스페이스", maxPrintMm: [256, 256, 256], url: "https://example.com/reserve", source: "link" }, context);
      const spaces = (await getMakerProfile(user.id))?.makerspaces ?? [];
      expect(spaces).toHaveLength(1);
      expect(spaces[0]).toMatchObject({ name: "성수 메이커스페이스", printers: "Bambu Lab P1S", maxPrintMm: [256, 256, 256], url: "https://example.com/reserve" });
      await expect(add.run({ projectId: id, name: "x", url: "javascript:alert(1)", source: "link" }, context)).rejects.toThrow();
    });
  });

  it("예산을 정하지 않기로 한 프로젝트는 예산을 묻지 않고, 구매처는 계정에 남는다", async () => {
    const { user, token } = await createUser("예산 없는 사람", false);
    const context = { user, dashboardUrl: "https://forge.example/" };
    await withVault(vaultFor(token, user.id), async () => {
      const id = ((await callTool("create_project", { idea: "책상 조명", plan }, context)).structuredContent as { id: string }).id;
      expect(checklistMissing(workflowFor((await getProject(id))!).profile).recommended).toContain("예산");
      const saved = await callTool("set_maker_profile", { projectId: id, coreBehavior: "책상을 비추는 조명", tools: [], toolsConfirmed: true, firmwareExperience: "none", budgetOff: true, preferredShops: ["디바이스마트", "엘레파츠"] }, context);
      expect(saved.isError ?? false).toBe(false);
      const profile = workflowFor((await getProject(id))!).profile;
      expect(profile.budgetOff).toBe(true);
      expect(checklistMissing(profile).recommended).not.toContain("예산");
      expect((await getMakerProfile(user.id))?.preferredShops).toEqual(["디바이스마트", "엘레파츠"]);
      // 다른 프로젝트는 예산을 다시 물을 수 있다(프로젝트마다 다르다)
      const other = ((await callTool("create_project", { idea: "화분 센서", plan }, context)).structuredContent as { id: string }).id;
      const p2 = workflowFor((await getProject(other))!).profile;
      expect(p2.budgetOff ?? false).toBe(false);
      expect(p2.preferredShops).toEqual(["디바이스마트", "엘레파츠"]);
    });
  });
});
