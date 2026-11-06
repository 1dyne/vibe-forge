import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { analyzeIdea } from "../apps/web/lib/onboarding/analyze";
import { CAPABILITY_BY_ID } from "../apps/web/lib/onboarding/capabilities";
import { CATALOG } from "../apps/web/lib/onboarding/catalog";
import { resetRateLimits } from "../apps/web/lib/onboarding/rate-limit";
import { POST as analyzeRoute } from "../apps/web/app/api/start/analyze/route";
import { POST as waitlistRoute } from "../apps/web/app/api/start/waitlist/route";
import { proxy } from "../apps/web/proxy";

describe("idea analysis", () => {
  it("sends software ideas to vibe coding with a starter prompt", () => {
    const a = analyzeIdea("동네 모임 일정을 잡아주는 예약 앱");
    expect(a.kind).toBe("software");
    expect(a.matches).toEqual([]);
    expect(a.vibePrompt).toContain("동네 모임");
  });
  it("matches hardware ideas to real catalog projects with a capped percentage", () => {
    const a = analyzeIdea("손목에 차고 걸음 수랑 심박을 재는 밴드");
    expect(a.kind).toBe("hardware");
    expect(a.matches[0].name).toBe("InfiniTime");
    expect(a.matches[0].matchPercent).toBeLessThanOrEqual(92);
    expect(a.matches[0].url).toBe("https://github.com/InfiniTimeOrg/InfiniTime");
  });
  it("lists what the best match is missing as design gaps", () => {
    const a = analyzeIdea("깔창에 압력 센서를 넣어 걸음을 기록하고 진동으로 알려주기");
    expect(a.gaps.map((g) => g.capability)).toContain("force");
    expect(a.gaps.find((g) => g.capability === "force")?.helper?.name).toBe("HX711");
  });
  it("still returns design gaps when no project matches", () => {
    const a = analyzeIdea("표면에 대면 색을 저장하는 컬러 수집기");
    expect(a.kind).toBe("hardware");
    expect(a.matches).toEqual([]);
    expect(a.gaps.map((g) => g.capability)).toEqual(["color_sense"]);
  });
  it("asks instead of guessing when the idea is vague, and honours the user's answer", () => {
    expect(analyzeIdea("뭔가 멋진 거").kind).toBe("unclear");
    expect(analyzeIdea("뭔가 멋진 거", "software").vibePrompt).toBeTruthy();
  });
  it("only tags catalog entries with known capabilities", () => {
    for (const entry of CATALOG) for (const tag of entry.tags) expect(CAPABILITY_BY_ID.has(tag), `${entry.repo}:${tag}`).toBe(true);
  });
});

const origin = "http://localhost:3000";
function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}${url}`, { method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
const join = (email: string, extra: Record<string, unknown> = {}) => ({
  email, experience: null, wantFirst: ["circuit"], budget: null, shareIdea: false, idea: "비밀 아이디어", ideaKind: "hardware",
  topMatch: null, privacyConsent: true, marketingConsent: false, ref: null, ...extra
});

describe("public onboarding API", () => {
  let dir = "";
  beforeEach(async () => {
    resetRateLimits();
    dir = await mkdtemp(path.join(os.tmpdir(), "waitlist-"));
    vi.stubEnv("WAITLIST_TEST_DATA_FILE", path.join(dir, "waitlist.json"));
    vi.stubEnv("APP_PASSWORD", "test-password");
    vi.stubEnv("SESSION_SECRET", "test-secret-used-only-for-tests");
  });
  afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

  it("is reachable without logging in", async () => {
    for (const p of ["/start", "/api/start/analyze", "/api/start/waitlist"]) {
      const res = await proxy(new NextRequest(`${origin}${p}`));
      expect(res.headers.get("location"), p).toBeNull();
      expect(res.status, p).not.toBe(401);
    }
    expect((await proxy(new NextRequest(`${origin}/api/projects`))).status).toBe(401);
  });
  it("analyzes and rejects cross-site or empty requests", async () => {
    expect((await analyzeRoute(post("/api/start/analyze", { idea: "화분 흙이 마르면 알림" }))).status).toBe(200);
    expect((await analyzeRoute(post("/api/start/analyze", { idea: "a" }))).status).toBe(400);
    expect((await analyzeRoute(post("/api/start/analyze", { idea: "화분 흙" }, { origin: "https://evil.example" }))).status).toBe(403);
  });
  it("requires privacy consent, dedupes email and drops the idea unless shared", async () => {
    expect((await waitlistRoute(post("/api/start/waitlist", join("a@example.com", { privacyConsent: false })))).status).toBe(400);
    const first = await waitlistRoute(post("/api/start/waitlist", join("A@example.com")));
    expect(first.status).toBe(201);
    const again = await waitlistRoute(post("/api/start/waitlist", join("a@example.com")));
    expect((await again.json()).standing.alreadyJoined).toBe(true);
    const { readFile } = await import("node:fs/promises");
    const saved = JSON.parse(await readFile(path.join(dir, "waitlist.json"), "utf8"));
    expect(saved.entries).toHaveLength(1);
    expect(saved.entries[0].idea).toBeNull();
  });
  it("moves referrers up the line", async () => {
    await waitlistRoute(post("/api/start/waitlist", join("one@example.com")));
    await waitlistRoute(post("/api/start/waitlist", join("two@example.com")));
    const third = await (await waitlistRoute(post("/api/start/waitlist", join("three@example.com")))).json();
    expect(third.standing.position).toBe(3);
    await waitlistRoute(post("/api/start/waitlist", join("four@example.com", { ref: third.standing.code })));
    const after = await (await waitlistRoute(post("/api/start/waitlist", join("three@example.com")))).json();
    expect(after.standing.referrals).toBe(1);
    expect(after.standing.position).toBe(1);
  });
  it("refuses bots that fill the hidden field", async () => {
    expect((await waitlistRoute(post("/api/start/waitlist", join("bot@example.com", { website: "spam" })))).status).toBe(400);
  });
});

describe("match relevance", () => {
  it("does not suggest projects that only share connectivity", () => {
    const a = analyzeIdea("화분 흙이 마르면 폰으로 알림 받기");
    expect(a.matches.map((m) => m.name)).toEqual(["LilyGo HiGrow"]);
  });
});
