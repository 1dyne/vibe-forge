import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

// Participant records must not be readable by whoever runs the server: not
// through the operator login, not with SESSION_SECRET, not from the data file.
const SECRET = "test-secret-for-vault-routes-0123456789";
let folder: string;
const dataFile = () => path.join(folder, "projects.json");
const usersFile = () => path.join(folder, "users.json");

beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "forge-vault-test-"));
  vi.stubEnv("FORGE_TEST_DATA_FILE", dataFile());
  vi.stubEnv("FORGE_TEST_USERS_FILE", usersFile());
  vi.stubEnv("APP_MODE", "mock");
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("APP_BASE_URL", "https://forge.example");
});
afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });

const plan = { projectName: "비밀 화분", oneLiner: "아무도 모르는 화분 센서", reply: "좋아요", slotUpdates: [], tasks: [] };

describe("sealed participant records", () => {
  it("stores participant projects only as ciphertext and opens them only with that participant's token", async () => {
    const { POST: mcpPost } = await import("../apps/web/app/api/mcp/[token]/route");
    const { GET: listRoute } = await import("../apps/web/app/api/projects/route");
    const { createUser } = await import("../apps/web/lib/users");
    const { signSession, userSessionValue } = await import("../apps/web/lib/session");
    const { user, token } = await createUser("참여자 금고", false);
    const call = async (name: string, args: Record<string, unknown>) => (await (await mcpPost(new NextRequest(`http://localhost/api/mcp/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), { params: Promise.resolve({ token }) })).json()).result;
    const made = await call("create_project", { idea: "잎이 시들면 알려주는 비밀 화분 센서", plan });
    const id = made.structuredContent.id as string;
    await call("set_maker_profile", { projectId: id, coreBehavior: "흙이 마르면 깜빡임", tools: ["멀티미터"], toolsConfirmed: true, firmwareExperience: "none" });

    const raw = await readFile(dataFile(), "utf8");
    expect(raw).not.toContain("비밀 화분");
    expect(raw).not.toContain("흙이 마르면");
    expect(raw).toContain(user.id);
    expect((await stat(dataFile())).mode & 0o077).toBe(0);
    const users = await readFile(usersFile(), "utf8");
    expect(users).not.toContain(token);
    expect(users).not.toContain("tokenSealed");

    const list = async (cookie: string) => listRoute(new NextRequest("http://localhost/api/projects", { headers: { cookie: `dalgeurak_session=${cookie}` } }));
    const own = await (await list(userSessionValue(token))).json();
    expect(own.projects.map((p: { id: string; name: string }) => p.name)).toEqual(["비밀 화분"]);
    const operator = await (await list(await signSession(Date.now() + 60_000, SECRET))).json();
    expect(operator.projects).toEqual([]);

    // A session forged with SESSION_SECRET for this participant's id is refused.
    const { createHmac } = await import("node:crypto");
    const payload = `${Date.now() + 60_000}~${user.id}`;
    const forged = `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
    expect((await list(forged)).status).toBe(401);
    expect((await list(userSessionValue("x".repeat(32)))).status).toBe(401);
  });

  it("seals records written before sealing existed and forgets the recoverable token", async () => {
    vi.resetModules();
    const token = randomBytes(24).toString("base64url");
    const userId = randomUUID();
    const key = createHash("sha256").update(`dalgeurak-token:${SECRET}`).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    const tokenSealed = [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url")).join(".");
    const legacyFolder = await mkdtemp(path.join(folder, "legacy-"));
    vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(legacyFolder, "projects.json"));
    vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(legacyFolder, "users.json"));
    await writeFile(path.join(legacyFolder, "users.json"), JSON.stringify({ version: 1, users: [{ id: userId, name: "예전 참여자", tokenHash: createHash("sha256").update(token).digest("hex"), tokenSealed, webAi: false, createdAt: new Date().toISOString(), revokedAt: null }] }));
    const now = new Date().toISOString();
    const legacyProject = { id: randomUUID(), ownerId: userId, origin: "connector", name: "예전 평문 프로젝트", idea: "평문으로 남아 있던 아이디어", oneLiner: "", stage: "idea", designRevision: 1, slots: [], tasks: [], messages: [], build: null, lastAgentMode: "live", createdAt: now, updatedAt: now };
    await writeFile(path.join(legacyFolder, "projects.json"), JSON.stringify({ version: 1, projects: [legacyProject], profiles: { [userId]: { coreBehavior: "평문 프로필", tools: [], toolsConfirmed: true, firmwareExperience: "none" } } }));

    const store = await import("../apps/web/lib/local-project-store");
    const { vaultFor, withVault } = await import("../apps/web/lib/vault");
    expect(await store.getProject(legacyProject.id)).toBeNull();
    const raw = await readFile(path.join(legacyFolder, "projects.json"), "utf8");
    expect(raw).not.toContain("평문");
    expect(await readFile(path.join(legacyFolder, "users.json"), "utf8")).not.toContain("tokenSealed");
    const opened = await withVault(vaultFor(token, userId), () => store.getProject(legacyProject.id));
    expect(opened?.idea).toBe("평문으로 남아 있던 아이디어");
    expect((await withVault(vaultFor(token, userId), () => store.getMakerProfile(userId)))?.coreBehavior).toBe("평문 프로필");
    // Another participant's key opens nothing.
    expect(await withVault(vaultFor(randomBytes(24).toString("base64url"), userId), () => store.getProject(legacyProject.id))).toBeNull();
    // Erasure still removes sealed records without the key.
    expect(await store.deleteOwnerData(userId)).toBe(1);
  });
});
