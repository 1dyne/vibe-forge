import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Postgres가 있을 때만 돈다. 없으면 조용히 건너뛴다 — 파일 모드 테스트는 그대로 돈다.
// 로컬에서 돌리려면:  FORGE_TEST_DATABASE_URL=postgresql://... npx vitest run tests/postgres-store.test.ts
const URL = process.env.FORGE_TEST_DATABASE_URL?.trim();
const when = URL ? describe : describe.skip;

let folder: string;
let store: typeof import("../apps/web/lib/local-project-store");
let users: typeof import("../apps/web/lib/users");
let rowStore: typeof import("../apps/web/lib/row-store");

beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "forge-pg-test-"));
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
  vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
  vi.stubEnv("APP_MODE", "mock");
  vi.stubEnv("SESSION_SECRET", "test-secret-for-postgres-store-0123456789");
  rowStore = await import("../apps/web/lib/row-store");
  store = await import("../apps/web/lib/local-project-store");
  users = await import("../apps/web/lib/users");
});

afterAll(async () => {
  if (URL) await rowStore.endPool();
  await rm(folder, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

async function reset() {
  const pool = await rowStore.db();
  await pool.query(`TRUNCATE ${rowStore.TABLES.join(", ")}`);
}

const plan = { projectName: "테스트", oneLiner: "", reply: "", slotUpdates: [], tasks: [] };

// Postgres 없이도 돈다. 행 단위로 쓸지 말지를 가르는 함수라 늘 확인한다.
describe("바뀐 행 가리기", () => {
  it("키 순서가 달라도 같은 내용으로 본다", async () => {
    const { canonical } = await import("../apps/web/lib/row-store");
    // Postgres는 jsonb 키 순서를 제 식대로 정규화한다. 글자 그대로 견주면
    // 내용이 같아도 늘 "바뀐 것"이 되어 행 단위로 쓰는 뜻이 없어진다.
    expect(canonical({ id: "p1", ownerId: "o", updatedAt: "t", sealed: "x" }))
      .toBe(canonical({ sealed: "x", id: "p1", updatedAt: "t", ownerId: "o" }));
  });

  it("안쪽 객체와 배열까지 내려가며 본다", async () => {
    const { canonical } = await import("../apps/web/lib/row-store");
    expect(canonical({ a: [{ x: 1, y: 2 }] })).toBe(canonical({ a: [{ y: 2, x: 1 }] }));
    // 배열 순서는 뜻이 있으므로 가린다.
    expect(canonical({ a: [1, 2] })).not.toBe(canonical({ a: [2, 1] }));
  });

  it("내용이 다르면 다르게 본다", async () => {
    const { canonical } = await import("../apps/web/lib/row-store");
    expect(canonical({ name: "가" })).not.toBe(canonical({ name: "나" }));
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: 1, b: 2 }));
  });
});

when("Postgres 저장소", () => {
  beforeEach(async () => { await reset(); });

  it("행 단위로 읽고 쓴다", async () => {
    const { user } = await users.createUser("다인", true);
    const read = await users.getActiveUser(user.id);
    expect(read?.name).toBe("다인");

    const pool = await rowStore.db();
    const { rows } = await pool.query("SELECT id FROM forge_users");
    expect(rows).toHaveLength(1);
  });

  // 핵심. 한 사람의 과금 기록을 적을 때 다른 사람의 행까지 다시 쓰면 안 된다.
  it("한 계정을 고쳐도 다른 계정 행은 건드리지 않는다", async () => {
    const a = (await users.createUser("가", true)).user;
    const b = (await users.createUser("나", true)).user;
    const pool = await rowStore.db();
    const stamp = async (id: string) => (await pool.query("SELECT updated_at FROM forge_users WHERE id = $1", [id])).rows[0].updated_at.toISOString();
    const beforeB = await stamp(b.id);

    await users.changeAccount(a.id, (record) => { record.usage = { day: "2026-11-23", usd: 0.04, turns: 1, totalUsd: 0.04 }; });

    expect(await stamp(b.id)).toBe(beforeB);
    const saved = await users.accountById(a.id);
    expect(saved?.usage?.usd).toBe(0.04);
  });

  it("지운 계정은 행도 사라진다", async () => {
    const { user } = await users.createUser("지울 사람", true);
    await users.deleteUser(user.id);
    const pool = await rowStore.db();
    expect((await pool.query("SELECT id FROM forge_users")).rowCount).toBe(0);
  });

  it("프로젝트도 행 단위로 저장된다", async () => {
    const first = await store.createProject("첫 아이디어", plan, "mock", [], {});
    const second = await store.createProject("둘째 아이디어", plan, "mock", [], {});
    const pool = await rowStore.db();
    const stamp = async (id: string) => (await pool.query("SELECT updated_at FROM forge_projects WHERE id = $1", [id])).rows[0].updated_at.toISOString();
    const beforeSecond = await stamp(second.id);

    await store.renameProject(first.id, null, "이름 바꾼 프로젝트");

    expect(await stamp(second.id)).toBe(beforeSecond);
    const list = await store.listProjects(null);
    expect(list.find((p) => p.id === first.id)?.name).toBe("이름 바꾼 프로젝트");
    expect(list).toHaveLength(2);
  });

  // 봉인은 열 때마다 IV가 달라서, 같은 내용을 다시 봉인하면 글자가 달라진다.
  // 그대로 두면 참여자가 저장할 때마다 그 사람의 모든 기록이 바뀐 것으로 보여
  // 행 단위로 쓰는 뜻이 없어진다.
  it("봉인된 기록도 고친 것만 다시 쓴다", async () => {
    const { createUser } = await import("../apps/web/lib/users");
    const { vaultFor, withVault } = await import("../apps/web/lib/vault");
    const { user, token } = await createUser("봉인 참여자", true);
    const vault = vaultFor(token, user.id);

    const [a, b] = await withVault(vault, async () => [
      await store.createProject("첫째", plan, "mock", [], { ownerId: user.id }),
      await store.createProject("둘째", plan, "mock", [], { ownerId: user.id })
    ]);

    const pool = await rowStore.db();
    const stamp = async (id: string) => (await pool.query("SELECT updated_at FROM forge_projects WHERE id = $1", [id])).rows[0].updated_at.toISOString();
    const sealed = async (id: string) => (await pool.query("SELECT data FROM forge_projects WHERE id = $1", [id])).rows[0].data.sealed as string;
    const beforeStamp = await stamp(b.id);
    const beforeSealed = await sealed(b.id);

    await withVault(vault, () => store.renameProject(a.id, user.id, "이름 바꾼 첫째"));

    // 안 고친 쪽은 봉인문도 저장 시각도 그대로여야 한다.
    expect(await sealed(b.id)).toBe(beforeSealed);
    expect(await stamp(b.id)).toBe(beforeStamp);
    // 고친 쪽은 실제로 바뀌고, 그래도 열린다.
    expect(await sealed(a.id)).not.toBe(beforeSealed);
    const opened = await withVault(vault, () => store.getProject(a.id));
    expect(opened?.name).toBe("이름 바꾼 첫째");
  });

  it("계정 프로필이 남고 다시 읽힌다", async () => {
    const profile = { tools: ["멀티미터"], toolsConfirmed: true, firmwareExperience: "guided" as const, coreBehavior: "", ownedParts: [{ id: "p1", name: "저항", qty: 100, catalogId: "resistor", note: "" }] };
    await store.saveMakerProfile(profile, null);
    const read = await store.getMakerProfile(null);
    expect(read?.ownedParts?.[0].name).toBe("저항");
  });
});

when("볼륨의 JSON을 옮기기", () => {
  beforeEach(async () => { await reset(); });

  it("파일에 있던 계정과 프로젝트를 한 번만 옮긴다", async () => {
    const usersFile = path.join(folder, "users.json");
    const projectsFile = path.join(folder, "projects.json");
    await writeFile(usersFile, JSON.stringify({
      version: 1,
      users: [{ id: "u-old", name: "옛 사람", webAi: true, createdAt: "2026-01-01T00:00:00.000Z", revokedAt: null }],
      invites: [{ id: "i-old", label: "밋업", codeHash: "x", maxUses: 1, used: 0, expiresAt: null, createdAt: "2026-01-01T00:00:00.000Z", disabledAt: null }]
    }));
    await writeFile(projectsFile, JSON.stringify({
      version: 1,
      projects: [{ id: "p-old", ownerId: "u-old", updatedAt: "2026-01-01T00:00:00.000Z", sealed: "봉인된-그대로" }],
      profile: { tools: [], toolsConfirmed: false, firmwareExperience: "unanswered", coreBehavior: "" }
    }));

    // 옮겨진 모듈 상태를 새로 읽게 한다.
    vi.resetModules();
    const freshUsers = await import("../apps/web/lib/users");
    const freshStore = await import("../apps/web/lib/local-project-store");

    expect((await freshUsers.listUsers()).map((u) => u.id)).toEqual(["u-old"]);
    expect((await freshUsers.listInvites()).map((i) => i.id)).toEqual(["i-old"]);
    // 봉인된 기록은 봉인된 채로 옮겨지고, 열쇠가 없으면 보이지 않는다.
    expect(await freshStore.listProjects(null)).toHaveLength(0);
    const pool = await rowStore.db();
    expect((await pool.query("SELECT data FROM forge_projects WHERE id = 'p-old'")).rows[0].data.sealed).toBe("봉인된-그대로");
    // 가져오기 표시는 어느 파일에서 가져왔는지를 키에 담는다.
    const marks = (await pool.query("SELECT id FROM forge_meta")).rows.map((r) => r.id as string);
    expect(marks).toContain(`import:users:${usersFile}`);
    expect(marks).toContain(`import:projects:${projectsFile}`);
  });

  it("이미 옮긴 뒤에는 파일이 그대로 있어도 다시 옮기지 않는다", async () => {
    const pool = await rowStore.db();
    await pool.query("INSERT INTO forge_meta (id, data) VALUES ($1, '{}')", [`import:users:${path.join(folder, "users.json")}`]);
    vi.resetModules();
    const freshUsers = await import("../apps/web/lib/users");
    expect(await freshUsers.listUsers()).toHaveLength(0);
  });
});
