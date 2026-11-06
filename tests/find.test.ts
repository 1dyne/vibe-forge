import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { CATS, FOLLOW, ROOTS, compose, fireName, lookup, reactKind, toChip, type Chip } from "../apps/web/lib/find/chips";
import { analyzeFind, chipTree, classify } from "../apps/web/lib/find/classify";
import { assessMaturity } from "../apps/web/lib/find/maturity";
import { PROJECTS, canShowImage, matchProjects, matchScore } from "../apps/web/lib/find/projects";
import { resetRateLimits } from "../apps/web/lib/find/rate-limit";
import { allWaitlist, clearEvents, endPool, getFire, recordEvent, removeEntry } from "../apps/web/lib/find/store";
import { POST as analyzeRoute } from "../apps/web/app/api/find/analyze/route";
import { POST as fireRoute } from "../apps/web/app/api/find/fires/route";
import { POST as waitlistRoute } from "../apps/web/app/api/find/waitlist/route";
import { proxy } from "../apps/web/proxy";

const all = lookup({ root: ROOTS.map(toChip), follow: FOLLOW });
const chip = (id: string) => all(id)!;

describe("받아 적기 문장", () => {
  it("고른 순서와 상관없이 형태 → 감지 → 반응 → 누구 순서로 짠다", () => {
    const picked = ["w_me", "r_light", "r_blink", "s_time", "f_desk", "f_tiny"];
    expect(compose(picked, all)).toBe("책상 위에 두는, 손바닥만 한 물건이야. 정해진 시간마다 깜빡깜빡 빛으로 알려줘. 나를 위해 만들 거야.");
  });
  it("replaces는 상위 키워드를 문장에서 뺀다", () => {
    expect(compose(["w_pet", "w_cat"], all)).toBe("우리 고양이를 위해 만들 거야.");
    expect(compose(["f_wear", "f_wrist"], all)).toBe("손목에 차는 물건이야.");
  });
  it("tail은 문장 끝에 따로 붙는다", () => {
    expect(compose(["s_dist", "s_off", "r_sound"], all)).toBe("누가 가까이 오면 소리로 알려줘. 버튼 하나로 끌 수 있어.");
  });
  it("처음 고른 반응이 불 색과 이름을 정한다", () => {
    expect(reactKind(["f_desk", "r_sound", "r_light"], all)).toBe("sound");
    expect(fireName(["f_desk", "r_light"], all)).toBe("깜빡이는 책상 도깨비불");
    expect(fireName(["w_pet"], all)).toBe("조용한 집사 도깨비불");
  });
});

describe("규칙 기반 판별", () => {
  it("앱·웹 일은 소프트웨어, 손에 잡히는 단서가 있으면 하드웨어", () => {
    expect(classify("동네 모임 예약 앱 만들고 싶어").kind).toBe("software");
    expect(classify("가계부 자동화 엑셀").kind).toBe("software");
    expect(classify("물 마시는 걸 자꾸 까먹어").kind).toBe("hardware");
    expect(classify("화분 물 줄 때 알려주는 앱").kind).toBe("hardware");
  });
  it("'만들고'를 '들고 다니는'으로 착각하지 않는다", () => {
    expect(classify("문서 정리 앱 만들고 싶어").kind).toBe("software");
  });
  it("상용전원·가열·의료는 정중하게 거절한다", () => {
    expect(classify("220V 히터를 폰으로 켜고 싶어").safety.ok).toBe(false);
    expect(classify("혈압을 재서 진단해주는 기계").safety.ok).toBe(false);
    expect(classify("밤에 불 끄러 일어나기 귀찮아").safety.ok).toBe(true);
  });
  it("뿌리 장작은 갈래마다 2개 이상, 최대 10개이고 입력과 관련된 걸 먼저 준다", () => {
    for (const idea of ["물 마시는 걸 자꾸 까먹어", "고양이가 밥 먹었는지 모르겠어", "뭔가 재밌는 거", "현관문 잠갔는지 매번 불안해"]) {
      const { root } = chipTree(idea);
      const first = root.slice(0, 10);
      for (const cat of CATS) expect(first.filter((c) => c.cat === cat).length, `${idea} ${cat}`).toBeGreaterThanOrEqual(2);
      expect(new Set(root.map((c) => c.id)).size).toBe(ROOTS.length); // 나머지는 빈자리를 채울 예비 장작
    }
    const ids = chipTree("고양이가 밥 먹었는지 모르겠어").root.slice(0, 10).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["f_bowl", "s_weight", "w_pet"]));
  });
  it("AI 응답과 같은 모양을 돌려준다(§4)", () => {
    const a = analyzeFind("화분에 물 줄 때를 모르겠어");
    expect(Object.keys(a).sort()).toEqual(["chips", "engine", "kind", "reason", "safety"]);
    const reachable = new Set([...a.chips.root.map((r) => r.id), ...Object.values(a.chips.follow).flat().map((c) => c.id)]);
    expect(Object.keys(a.chips.follow).every((id) => reachable.has(id))).toBe(true);
  });
});

describe("계속 붙는 장작", () => {
  it("후속 장작을 고르면 그 아래로 또 더 구체적인 장작이 붙는다", () => {
    const { follow } = chipTree("물 마시는 걸 자꾸 까먹어");
    expect(follow.s_time.map((c) => c.id)).toContain("s_cup");
    expect(follow.s_cup.map((c) => c.id)).toContain("s_goal");
    const t = lookup(chipTree("물 마시는 걸 자꾸 까먹어"));
    expect(compose(["f_cup", "s_time", "s_cup", "s_goal", "r_light"], t)).toBe("컵 받침처럼 생긴 물건이야. 정해진 시간마다, 컵 무게로 마셨는지 확인해서, 하루 목표만큼 채웠는지 세어서 빛으로 알려줘.");
  });
});

describe("구상 수준", () => {
  const chipsOf = (ids: string[]) => ids.map(chip);
  it("장작이 적으면 1단계, 빈 갈래부터 채우라고 한다", () => {
    const m = assessMaturity(chipsOf(["s_time"]), new Set(), [], []);
    expect(m.level).toBe(1);
    expect(m.next[0].title).toBe("어떻게 알려줄지 정하기");
  });
  it("갈래가 비면 2단계, 빈 갈래를 짚어준다", () => {
    const m = assessMaturity(chipsOf(["f_desk", "s_time", "r_light"]), new Set(), [], []);
    expect(m.level).toBe(2);
    expect(m.summary).toContain("누구");
  });
  it("네 갈래 + 후속까지 고르면 4단계, 만들기 쪽 할 일을 준다", () => {
    const picked = ["f_cup", "f_thin", "s_time", "s_cup", "r_light", "w_me"];
    const matches = matchProjects(picked, all);
    const m = assessMaturity(chipsOf(picked), new Set(["f_thin", "s_cup"]), matches, ["빛으로 알려줘"]);
    expect(m.level).toBe(4);
    expect(m.next.map((n) => n.title)).toEqual(["닮은 프로젝트 뜯어보기", "네 것만의 부분 생각해두기", "전원 정하기"]);
    expect(m.next[0].href).toBe(matches[0].source_url);
  });
});

describe("닮은 프로젝트", () => {
  it("모든 프로젝트 태그는 정해진 갈래 어휘만 쓴다", () => {
    const vocab = new Set([...ROOTS.flatMap((r) => r.tags), ...Object.values(FOLLOW).flat().flatMap((c) => c.tags), "침대 옆", "심박"]);
    for (const p of PROJECTS) for (const cat of CATS) for (const t of p.tags[cat] ?? []) {
      if (!vocab.has(t)) expect.soft(t, `${p.id}.${cat}`).toBe("(어휘에 없음)");
    }
  });
  it("일치율은 가중합이고 92%를 넘지 않는다", () => {
    const mine = { 형태: ["책상 위"], 반응: ["빛"], 감지: ["시간"], 누구: ["나"] };
    const perfect = { ...PROJECTS[0], tags: { 형태: ["책상 위"], 반응: ["빛"], 감지: ["시간"], 누구: ["나"] } };
    expect(matchScore(mine, perfect).percent).toBe(92);
    const half = { ...PROJECTS[0], tags: { 형태: ["책상 위"], 반응: ["소리"], 감지: ["시간"], 누구: [] } };
    expect(matchScore(mine, half).percent).toBe(60); // (0.25 + 0.35) / 1.0
  });
  it("감지나 반응이 하나도 안 겹치면 보여주지 않는다", () => {
    const matches = matchProjects(["f_pot", "s_soil", "r_light"], all);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.shared.some((t) => ["흙 수분", "빛"].includes(t)))).toBe(true);
  });
  it("이미지는 재게시 허용 라이선스에만 붙는다", () => {
    expect(canShowImage("CC BY-SA")).toBe(true);
    expect(canShowImage("CC BY 4+")).toBe(true);
    expect(canShowImage("MIT")).toBe(true);
    expect(canShowImage("CC BY-NC-SA")).toBe(false);
    expect(canShowImage("CC BY-NC-ND")).toBe(false);
    expect(canShowImage(null)).toBe(false);
    for (const p of PROJECTS) if (p.images.length) expect(canShowImage(p.license), p.id).toBe(true);
  });
});

const origin = "http://localhost:3000";
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`${origin}${url}`, { method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("공개 API와 저장소 (파일 저장)", () => {
  let dir = "";
  beforeEach(async () => {
    resetRateLimits();
    dir = await mkdtemp(path.join(os.tmpdir(), "find-"));
    vi.stubEnv("FIND_TEST_DATA_FILE", path.join(dir, "find.json"));
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL_WEB", "");
    vi.stubEnv("APP_PASSWORD", "test-password");
    vi.stubEnv("SESSION_SECRET", "test-secret-used-only-for-tests");
  });
  afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

  it("로그인 없이 열리고, 관리자 화면은 막혀 있다", async () => {
    for (const p of ["/find", "/find/og.png", "/f/abcd1234", "/f/abcd1234/card.png", "/api/find/analyze", "/find/sprites/idle.webp"]) {
      const res = await proxy(new NextRequest(`${origin}${p}`));
      expect(res.headers.get("location"), p).toBeNull();
      expect(res.status, p).toBe(200);
    }
    expect((await proxy(new NextRequest(`${origin}/admin/find`))).headers.get("location")).toContain("/login");
    expect((await proxy(new NextRequest(`${origin}/api/admin/find/export`))).status).toBe(401);
    expect((await proxy(new NextRequest(`${origin}/start`))).headers.get("location")).toBe(`${origin}/find`);
  });
  it("온보딩 도메인의 첫 화면은 /find 로 바로 보여준다", async () => {
    vi.stubEnv("FIND_HOSTS", "dalgeurak.kr, www.dalgeurak.kr");
    const res = await proxy(new NextRequest("https://dalgeurak.kr/", { headers: { host: "dalgeurak.kr" } }));
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://dalgeurak.kr/find");
    const other = await proxy(new NextRequest("https://web.example.app/", { headers: { host: "web.example.app" } }));
    expect(other.headers.get("x-middleware-rewrite")).toBeNull();
  });
  it("판별 → 불 확정 → 대기 신청 → 친구 추천으로 순번이 앞당겨진다", async () => {
    const analysis = await (await analyzeRoute(post("/api/find/analyze", { idea: "물 마시는 걸 자꾸 까먹어" }))).json();
    const find = lookup(analysis.chips);
    const picked = ["f_cup", "r_light", "s_time"].map((id) => find(id) as Chip);
    const made = await fireRoute(post("/api/find/fires", { idea: "물 마시는 걸 자꾸 까먹어", picked, peak: 64 }));
    expect(made.status).toBe(201);
    const { fire, matches } = await made.json();
    expect(fire.name).toBe("깜빡이는 책상 도깨비불");
    expect(fire.sentence).toContain("정해진 시간마다 빛으로 알려줘.");
    expect(matches.length).toBeGreaterThan(0);

    const join = (email: string, ref: string | null = null) => waitlistRoute(post("/api/find/waitlist", { email, fireId: fire.id, privacyConsent: true, marketingConsent: false, ref }));
    expect((await waitlistRoute(post("/api/find/waitlist", { email: "x@example.com", fireId: null, privacyConsent: false, marketingConsent: false, ref: null }))).status).toBe(400);
    await join("one@example.com");
    await join("two@example.com");
    const third = (await (await join("three@example.com")).json()).standing;
    expect(third.position).toBe(3);
    expect(third.fireName).toBe("깜빡이는 책상 도깨비불");
    await join("friend@example.com", third.code);
    const again = (await (await join("THREE@example.com")).json()).standing;
    expect(again.alreadyJoined).toBe(true);
    expect(again.referrals).toBe(1);
    expect(again.position).toBe(1);
  });
  it("삭제 요청이 오면 신청과 그 사람의 도깨비불을 함께 지운다", async () => {
    const find = lookup(chipTree("화분에 물 줄 때를 모르겠어"));
    const { fire } = await (await fireRoute(post("/api/find/fires", { idea: "화분에 물 줄 때를 모르겠어", picked: ["f_pot", "s_soil", "r_light"].map((id) => find(id)), peak: 50 }))).json();
    await waitlistRoute(post("/api/find/waitlist", { email: "delete-me@example.com", fireId: fire.id, privacyConsent: true, marketingConsent: false, ref: null }));
    const [entry] = await allWaitlist();
    expect(await removeEntry(entry.id)).toBe(true);
    expect(await allWaitlist()).toEqual([]);
    expect(await getFire(fire.id)).toBeNull();
    await recordEvent({ name: "dice", session: "abcdef", props: {}, createdAt: new Date().toISOString() });
    expect(await clearEvents()).toBe(1);
  });
  it("다른 사이트에서 보낸 요청과 봇 칸을 채운 신청은 막는다", async () => {
    expect((await analyzeRoute(post("/api/find/analyze", { idea: "화분" }, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await waitlistRoute(post("/api/find/waitlist", { email: "bot@example.com", fireId: null, privacyConsent: true, marketingConsent: false, ref: null, website: "x" }))).status).toBe(400);
  });
});

// 로컬 Postgres가 있을 때만: FIND_TEST_DATABASE_URL=postgresql://... npx vitest run tests/find.test.ts
const pgUrl = process.env.FIND_TEST_DATABASE_URL;
describe.skipIf(!pgUrl)("Postgres 저장소", () => {
  beforeEach(() => { resetRateLimits(); vi.stubEnv("DATABASE_URL", pgUrl!); });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(() => endPool());
  it("불과 대기 신청을 저장하고 같은 이메일은 한 번만 받는다", async () => {
    const find = lookup(chipTree("택배 왔는지 자꾸 나가봐"));
    const made = await (await fireRoute(post("/api/find/fires", { idea: "택배 왔는지 자꾸 나가봐", picked: ["f_door", "s_door", "r_phone"].map((id) => find(id)), peak: 40 }))).json();
    const email = `pg-${Date.now()}@example.com`;
    const first = await waitlistRoute(post("/api/find/waitlist", { email, fireId: made.fire.id, privacyConsent: true, marketingConsent: true, ref: null }));
    expect(first.status).toBe(201);
    const second = await (await waitlistRoute(post("/api/find/waitlist", { email, fireId: null, privacyConsent: true, marketingConsent: false, ref: null }))).json();
    expect(second.standing.alreadyJoined).toBe(true);
  });
});
