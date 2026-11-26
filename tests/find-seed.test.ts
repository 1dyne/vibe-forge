import { describe, expect, it, vi } from "vitest";
import { makeSeed, readSeed } from "../apps/web/lib/find/seed";

describe("온보딩 아이디어 쪽지", () => {
  it("서명이 맞는 쪽지만 읽고, 손댄 쪽지와 일주일 지난 쪽지는 버린다", () => {
    vi.stubEnv("SESSION_SECRET", "test-secret-for-seed-0123456789abcdef");
    const base = { idea: "화분 흙이 마르면 알려주는 것", kind: "hardware" as const, sentence: "흙이 마르면 불빛으로 알려줘", fireId: "abc123", fireName: "목마른 화분", forgeId: "f1" };
    const now = Date.UTC(2026, 10, 26);
    const token = makeSeed(base, now);
    expect(readSeed(token, now + 1000)).toMatchObject(base);
    // 내용을 바꾸면 서명이 맞지 않는다
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...base, forgeId: "someone-else", at: now })).toString("base64url");
    expect(readSeed(`${forged}.${mac}`, now)).toBeNull();
    expect(readSeed(`${body}.${mac.slice(0, -2)}xx`, now)).toBeNull();
    expect(readSeed(token, now + 8 * 24 * 60 * 60 * 1000)).toBeNull();
    expect(readSeed("garbage", now)).toBeNull();
    expect(readSeed(null, now)).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe("대장간의 진행이 마을의 방을 키운다", () => {
  it("이름과 내용 없이 숫자만 만들고, 멀리 갈수록 방이 자란다", async () => {
    const { progressOf, roomStage, readProgress } = await import("../apps/web/lib/find/progress");
    const p = (extra: object) => ({ name: "비밀 프로젝트", idea: "비밀", tasks: [], messages: [], ...extra }) as never;
    expect(roomStage(null)).toBe(1);
    const idea = progressOf([p({})]);
    expect(idea).toMatchObject({ projects: 1, furthest: 0 }); expect(roomStage(idea)).toBe(1);
    const planned = progressOf([p({}), p({ buildPlan: {} })]);
    expect(planned.furthest).toBe(1); expect(roomStage(planned)).toBe(2);
    const mocked = progressOf([p({ preciseMockup: {} })]);
    expect(mocked).toMatchObject({ furthest: 3, printed: 1 }); expect(roomStage(mocked)).toBe(3);
    expect(JSON.stringify(mocked)).not.toContain("비밀");
    expect(readProgress(JSON.stringify(mocked))?.furthest).toBe(3);
    expect(readProgress("not json")).toBeNull();
  });
});
