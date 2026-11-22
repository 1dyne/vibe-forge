import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { accountById, createUser } from "../apps/web/lib/users";
import { TURN_USD, allowanceUsd, budgetDenied, chargeTurn, freeDailyUsd, remainingUsd } from "../apps/web/lib/usage";
import type { Viewer } from "../apps/web/lib/viewer";

let folder: string;
const asViewer = (id: string) => ({ kind: "user", user: { id } } as unknown as Viewer);

beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "forge-usage-test-"));
  vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
  vi.stubEnv("FREE_CREDIT_USD_PER_DAY", "0.1");
});
afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });

describe("앱 안 대화 사용량", () => {
  it("쓴 만큼 쌓이고 남은 분량이 줄어든다", async () => {
    const { user } = await createUser("세는 사람", true);
    const before = await accountById(user.id);
    expect(remainingUsd(before!)).toBe(0.1);

    await chargeTurn(asViewer(user.id), "chat");
    const after = await accountById(user.id);
    expect(after?.usage?.turns).toBe(1);
    expect(after?.usage?.usd).toBeCloseTo(TURN_USD.chat, 6);
    expect(after?.usage?.totalUsd).toBeCloseTo(TURN_USD.chat, 6);
    expect(remainingUsd(after!)).toBeCloseTo(0.1 - TURN_USD.chat, 6);
  });

  it("무료 분량을 다 쓰면 402로 막고, 커넥터로 쓰라고 알려준다", async () => {
    const { user } = await createUser("많이 쓴 사람", true);
    for (let i = 0; i < 3; i += 1) await chargeTurn(asViewer(user.id), "chat");
    const denied = await budgetDenied(asViewer(user.id), "chat");
    expect(denied?.status).toBe(402);
    const body = await denied!.json();
    expect(body.code).toBe("credit_exhausted");
    expect(body.error).toContain("커넥터");
  });

  it("남아 있으면 막지 않는다", async () => {
    const { user } = await createUser("조금 쓴 사람", true);
    await chargeTurn(asViewer(user.id), "chat");
    expect(await budgetDenied(asViewer(user.id), "chat")).toBeNull();
  });

  it("비싼 작업은 남은 분량이 그만큼 있어야 한다", async () => {
    const { user } = await createUser("설계 돌릴 사람", true);
    // 회로 설계 한 번이 하루 무료 분량(0.1)보다 비싸다.
    expect(TURN_USD.build).toBeGreaterThan(freeDailyUsd());
    expect((await budgetDenied(asViewer(user.id), "build"))?.status).toBe(402);
  });

  it("운영자는 자기 키를 쓰므로 세지 않는다", async () => {
    const operator = { kind: "operator" } as unknown as Viewer;
    expect(await budgetDenied(operator, "build")).toBeNull();
    await chargeTurn(operator, "build");
  });

  it("사람마다 하루 한도를 따로 줄 수 있다", async () => {
    const { user } = await createUser("한도 받은 사람", true);
    const account = await accountById(user.id);
    expect(allowanceUsd({ ...account!, dailyCreditUsd: 5 })).toBe(5);
    expect(allowanceUsd(account!)).toBe(0.1);
  });
});
