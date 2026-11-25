import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
// mcp-tools를 먼저 불러야 tool-kit의 공용 함수가 채워진다.
import { callTool } from "../apps/web/lib/mcp-tools";
import { GUIDE_SECTION, tools } from "../apps/web/lib/tools/learn-tools";
import { getMakerProfile, getProject } from "../apps/web/lib/local-project-store";
import { createUser } from "../apps/web/lib/users";
import { vaultFor, withVault } from "../apps/web/lib/vault";
import { workflowFor } from "../apps/web/lib/workflow";
import { EXTRA_QUESTIONS } from "../apps/web/lib/checklist";

let folder: string;
beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "forge-learn-test-"));
  vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
  vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
  vi.stubEnv("FORGE_TEST_AUDIT_FILE", path.join(folder, "audit.jsonl"));
  vi.stubEnv("APP_MODE", "mock");
  vi.stubEnv("SESSION_SECRET", "test-secret-for-learn-tools-0123456789");
});
afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });

const plan = { projectName: "학습 램프", oneLiner: "버튼 램프", reply: "좋아요", slotUpdates: [], tasks: [] };

describe("학습 모드 도구", () => {
  it("켜면 계정과 그 사람의 프로젝트에 함께 남고, 끄면 꺼진다", async () => {
    const { user, token } = await createUser("배우는 사람", false);
    const context = { user, dashboardUrl: "https://forge.example/" };
    const vault = vaultFor(token, user.id);
    const tool = tools.find((t) => t.name === "set_learning_mode")!;
    await withVault(vault, async () => {
      const made = await callTool("create_project", { idea: "버튼을 누르면 켜지는 램프", plan }, context);
      const id = (made.structuredContent as { id: string }).id;
      const on = await tool.run({ projectId: id, enabled: true }, context);
      expect(on.text).toContain("학습 모드를 켰어요");
      expect((await getMakerProfile(user.id))?.learningMode).toBe(true);
      expect(workflowFor((await getProject(id))!).profile.learningMode).toBe(true);
      await tool.run({ projectId: id, enabled: false }, context);
      expect((await getMakerProfile(user.id))?.learningMode).toBe(false);
      expect(workflowFor((await getProject(id))!).profile.learningMode).toBe(false);
      // 형식이 다르거나 남의 프로젝트면 받지 않는다
      await expect(tool.run({ projectId: id, enabled: "yes" }, context)).rejects.toThrow();
      await expect(tool.run({ projectId: "00000000-0000-4000-8000-000000000000", enabled: true }, context)).rejects.toThrow();
    });
  });

  it("안내문은 학습 모드의 세 가지와 추가 질문 전부를 담는다", () => {
    expect(GUIDE_SECTION.startsWith("## ")).toBe(true);
    for (const phrase of ["왜 이것을 골랐는지", "다른 선택지", "직접 정하려면", "한 턴에 두 개까지만"]) expect(GUIDE_SECTION).toContain(phrase);
    for (const q of EXTRA_QUESTIONS) expect(GUIDE_SECTION, q.id).toContain(`- ${q.id} (`);
  });
});
