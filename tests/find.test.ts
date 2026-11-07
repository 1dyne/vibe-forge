import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { CATS, FOLLOW, ROOTS, compose, fireName, lookup, reactKind, toChip, type Chip } from "../apps/web/lib/find/chips";
import { analyzeFind, chipTree, classify } from "../apps/web/lib/find/classify";
import { assessMaturity } from "../apps/web/lib/find/maturity";
import { buildCard, comboKey, gradeOf } from "../apps/web/lib/find/card";
import { NAMELESS, cleanNickname, nicknameProblem } from "../apps/web/lib/find/nickname";
import { uniqueToIdea } from "../apps/web/lib/find/projects";
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

describe("도깨비불 카드", () => {
  it("등급은 희귀도와 화력을 섞는다", () => {
    expect(gradeOf({ total: 300, sameCombo: 0, higherPeak: 3 }, 92)).toBe("전설");
    expect(gradeOf({ total: 300, sameCombo: 0, higherPeak: 200 }, 50)).toBe("희귀");
    expect(gradeOf({ total: 300, sameCombo: 40, higherPeak: 20 }, 85)).toBe("희귀"); // 화력 상위 7%
    expect(gradeOf({ total: 300, sameCombo: 40, higherPeak: 150 }, 50)).toBe("흔함");
    expect(gradeOf({ total: 0, sameCombo: 0, higherPeak: 0 }, 60)).toBe("희귀");
  });
  it("도깨비불이 30개 미만이면 희귀도 줄을 숨기고, 화력은 1등·위쪽 절반만 보여준다", () => {
    const chips = ["s_time", "r_light"].map(chip);
    expect(buildCard(chips, 50, { total: 10, sameCombo: 0, higherPeak: 0 }, []).rarityLine).toBeNull();
    expect(buildCard(chips, 50, { total: 10, sameCombo: 0, higherPeak: 0 }, []).peakLine).toBeNull();
    expect(buildCard(chips, 99, { total: 59, sameCombo: 3, higherPeak: 0 }, []).peakLine).toBe("화력 1등");
    expect(buildCard(chips, 20, { total: 59, sameCombo: 3, higherPeak: 40 }, []).peakLine).toBeNull(); // 41위/60 → 꼴찌처럼 읽히니 숨김
    expect(buildCard(chips, 60, { total: 59, sameCombo: 3, higherPeak: 5 }, []).rarityLine).toBe("이 조합, 너 말고 3명이 더 찾았어");
  });
  it("닉네임은 욕설·연락처를 거르고, 없거나 걸리면 이름 없는 도깨비", () => {
    expect(nicknameProblem("시 발")).not.toBeNull();
    expect(nicknameProblem("s.h.i.t")).not.toBeNull();
    expect(nicknameProblem("me@mail.com")).not.toBeNull();
    expect(nicknameProblem("다인")).toBeNull();
    expect(cleanNickname("  다인  ")).toBe("다인");
    expect(cleanNickname("병1신")).toBe(NAMELESS);
    expect(cleanNickname("")).toBe(NAMELESS);
  });
  it("같은 장작이면 고른 순서와 상관없이 같은 조합이다", () => {
    expect(comboKey(["r_light", "f_desk"])).toBe(comboKey(["f_desk", "r_light"]));
  });
  it("한 줄 평·특기·약점·부품을 고른 장작에서 만든다", () => {
    const picked = ["f_cup", "s_time", "s_cup", "r_light", "r_blink", "w_me"].map(chip);
    const card = buildCard(picked, 85, { total: 40, sameCombo: 0, higherPeak: 2 }, matchProjects(picked.map((c) => c.id), all));
    expect(card.grade).toBe("전설");
    expect(card.roast.head).toBe("컵 무게까지 재겠다고?");
    expect(card.specialty).toBe("컵 무게 재기 → 깜빡깜빡");
    expect(card.weakness).toBe("올려두지 않으면 아무것도 모름");
    const roles = card.build.parts as Array<{ key: string; role: string; does: string; parts: Array<{ name: string }> }>;
    expect(roles.map((r) => r.role)).toEqual(["작은 두뇌 보드", "무게를 재는 판", "색이 바뀌는 불빛", "전원", "몸통"]);
    expect(roles.find((r) => r.key === "weight")?.does).toBe("컵을 들었는지, 얼마나 마셨는지 알아채");
    expect(roles.find((r) => r.key === "led")?.does).toBe("때가 되면 깜빡여");
    expect(roles.find((r) => r.key === "weight")?.parts.map((x) => x.name)).toEqual(["로드셀", "HX711 보드"]);
    expect(JSON.stringify(roles)).not.toMatch(/\d\s*원|₩|https?:/); // 가격·구매처는 넣지 않는다
    expect(card.rarityLine).toBe("이 조합은 지금까지 도깨비불 41개 중 너만 찾았어");
    expect(card.peakLine).toBe("화력 상위 8%"); // 3위 / 41개
    expect(card.stats.find((s) => s.cat === "감지")?.value).toBe(2);
  });
});

describe("네 아이디어에만 있는 것", () => {
  it("화면에 보이는 닮은 프로젝트 전체와 비교한다(1위에만 없다고 '없다'고 하지 않는다)", () => {
    const picked = ["f_pot", "s_soil", "r_light", "r_blink"];
    const matches = matchProjects(picked, all);
    const tagsShown = new Set(matches.flatMap((m) => PROJECTS.find((p) => p.id === m.id)!.tags["반응"]));
    const unique = uniqueToIdea(picked, all, matches);
    if (tagsShown.has("빛")) expect(unique).not.toContain("빛으로 알려줘");
    if (tagsShown.has("깜빡임")) expect(unique).not.toContain("깜빡깜빡");
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
    expect(fire.card.rarityLine).toBeNull(); // 아직 30개 미만
    expect(fire.nickname).toBe(NAMELESS);
    const sameCombo = await (await fireRoute(post("/api/find/fires", { idea: "물 마시는 걸 자꾸 까먹어", picked: [...picked].reverse(), peak: 30 }))).json();
    expect(sameCombo.fire.card.grade).toBe("흔함"); // 이미 나온 조합이고 화력도 더 낮다
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

describe("도깨비 마을 (Phase 2)", () => {
  it("장작과 가장 많이 겹치는 골목, 같으면 덜 찬 골목으로 간다", async () => {
    const { pickTheme, plotFor, plotLine, alleyName } = await import("../apps/web/lib/find/village");
    expect(pickTheme(["w_cat", "f_bowl", "r_light"], {}).id).toBe("cat");
    expect(pickTheme(["f_cup", "s_cup"], {}).id).toBe("water");
    expect(pickTheme(["r_light"], { cat: 3, dog: 0, water: 1 }).id).not.toBe("cat"); // 안 겹치면 한산한 골목
    // 새 골목: 와글마을 장난감·꼬마, 깜빡마을 공기
    expect(pickTheme(["r_dance", "f_soft", "w_me"], {}).id).toBe("toy");
    expect(pickTheme(["w_kid", "r_face"], {}).id).toBe("kid");
    expect(pickTheme(["s_air", "r_traffic", "f_wall"], {}).id).toBe("air");
    expect(plotFor(0)).toEqual({ seq: 1, plotNo: 1, left: 99 });
    expect(plotFor(100)).toEqual({ seq: 2, plotNo: 1, left: 99 });
    // 골목은 이름 없이 배치에만 쓰이고, 보이는 주소는 마을 이름
    expect(alleyName("cat", 2)).toBe("꼬물마을");
    expect(alleyName("toy")).toBe("와글마을");
    expect(plotLine("cat", 1, 1, 99)).toBe("꼬물마을에 네 대장간 터가 생겼어");
  });
});

describe("내 대장간·우체통 (파일 저장)", () => {
  let dir = "";
  beforeEach(async () => {
    resetRateLimits();
    dir = await mkdtemp(path.join(os.tmpdir(), "find-village-"));
    vi.stubEnv("FIND_TEST_DATA_FILE", path.join(dir, "find.json"));
    vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DATABASE_URL_WEB", ""); vi.stubEnv("NOTION_TOKEN", "");
  });
  afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await rm(dir, { recursive: true, force: true }); });

  const lock = async (cookie: string | null, ids: string[], nickname = "다인") => {
    const tree = chipTree("고양이가 밥 먹었는지 모르겠어");
    const find = lookup(tree);
    return fireRoute(post("/api/find/fires", { idea: "고양이가 밥 먹었는지 모르겠어", picked: ids.map((id) => find(id)), peak: 70, nickname }, cookie ? { cookie: `find_owner=${cookie}` } : {}));
  };

  it("첫 불에 대장간이 생기고, 같은 기기의 다음 불은 같은 대장간 선반에 쌓인다", async () => {
    const first = await lock(null, ["f_bowl", "s_weight", "w_pet"]);
    const body = await first.json();
    expect(body.forge.isNew).toBe(true);
    expect(body.forge.alley).toBe("꼬물마을");
    expect(body.forge.line).toBe("꼬물마을에 네 대장간 터가 생겼어");
    const cookie = first.cookies.get("find_owner")?.value;
    expect(cookie).toBeTruthy();
    const second = await (await lock(cookie!, ["r_light", "s_time"])).json();
    expect(second.forge.isNew).toBe(false);
    expect(second.forge.id).toBe(body.forge.id);
    const { forgeFires, getForge } = await import("../apps/web/lib/find/village-store");
    expect((await forgeFires(body.forge.id)).map((f) => f.id)).toEqual([second.fire.id, body.fire.id]);
    expect((await getForge(body.forge.id))?.nickname).toBe("다인");
    // 다른 기기는 다른 대장간(같은 골목 2번 터)
    const other = await (await lock(null, ["f_bowl", "w_cat"], "미미")).json();
    expect(other.forge.id).not.toBe(body.forge.id);
    expect(other.forge.plotNo).toBe(2);
  });

  it("공개 범위는 주인만 바꿀 수 있다", async () => {
    const first = await lock(null, ["f_bowl", "w_pet"]);
    const cookie = first.cookies.get("find_owner")!.value;
    const { PATCH } = await import("../apps/web/app/api/find/forge/route");
    const patch = (c: string | null) => PATCH(new NextRequest(`${origin}/api/find/forge`, { method: "PATCH", headers: { origin, "content-type": "application/json", ...(c ? { cookie: `find_owner=${c}` } : {}) }, body: JSON.stringify({ visibility: "private" }) }));
    expect((await patch(null)).status).toBe(403);
    expect((await patch(cookie)).status).toBe(200);
  });

  it("우체통 편지는 저장되고, 반영 완료 답장은 주인의 다음 접속 때 한 번 보인다", async () => {
    const first = await lock(null, ["f_bowl", "w_pet"]);
    const cookie = first.cookies.get("find_owner")!.value;
    const { POST: mailPost } = await import("../apps/web/app/api/find/mail/route");
    const sent = await mailPost(post("/api/find/mail", { kind: "bug", body: "공유 버튼이 안 눌려요", screen: "find:reveal" }, { cookie: `find_owner=${cookie}` }));
    expect(sent.status).toBe(201);
    const { listMail, updateMail } = await import("../apps/web/lib/find/village-store");
    const [mail] = await listMail();
    expect(mail.forgeId).toBeTruthy();
    expect(mail.notionSynced).toBe(false); // 토큰이 없으면 앱 DB에만
    await updateMail(mail.id, { status: "done", reply: "고쳐놨어!" });
    const { GET: meGet, POST: mePost } = await import("../apps/web/app/api/find/me/route");
    const me = await (await meGet(new NextRequest(`${origin}/api/find/me`, { headers: { cookie: `find_owner=${cookie}` } }))).json();
    expect(me.replies).toEqual([{ id: mail.id, asked: "공유 버튼이 안 눌려요", reply: "고쳐놨어!" }]);
    await mePost(post("/api/find/me", { replyIds: [mail.id] }, { cookie: `find_owner=${cookie}` }));
    const again = await (await meGet(new NextRequest(`${origin}/api/find/me`, { headers: { cookie: `find_owner=${cookie}` } }))).json();
    expect(again.replies).toEqual([]);
  });

  it("노션 토큰이 있으면 편지를 노션에 만들고, 노션에서 바꾼 상태·답장을 가져온다", async () => {
    vi.stubEnv("NOTION_TOKEN", "test-token");
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    let appMailId = "";
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      if (url.endsWith("/pages")) { appMailId = body.properties["앱 편지 ID"].rich_text[0].text.content; return new Response(JSON.stringify({ id: "page-1" }), { status: 200 }); }
      return new Response(JSON.stringify({ results: [{ properties: { "앱 편지 ID": { rich_text: [{ plain_text: appMailId }] }, 상태: { status: { name: "반영 완료" } }, 답장: { rich_text: [{ plain_text: "고쳐놨어!" }] } } }] }), { status: 200 });
    });
    const { POST: mailPost } = await import("../apps/web/app/api/find/mail/route");
    await mailPost(post("/api/find/mail", { kind: "feature", body: "밤 테마 골목 있었으면" }));
    expect(calls[0].url).toBe("https://api.notion.com/v1/pages");
    expect(calls[0].body.parent).toEqual({ type: "data_source_id", data_source_id: "979627f3-46da-4900-90dc-0047eb96fce3" });
    expect((calls[0].body.properties as Record<string, { select?: { name: string } }>)["종류"].select?.name).toBe("기능 제안");
    const { syncMailbox } = await import("../apps/web/lib/find/notion");
    expect(await syncMailbox(true)).toEqual({ pushed: 0, pulled: 1 });
    const { listMail } = await import("../apps/web/lib/find/village-store");
    const [mail] = await listMail();
    expect(mail).toMatchObject({ status: "done", reply: "고쳐놨어!", notionSynced: true, notionPageId: "page-1" });
  });
});

describe("놀러 가기 (Phase 3, 파일 저장)", () => {
  let dir = "";
  beforeEach(async () => {
    resetRateLimits();
    dir = await mkdtemp(path.join(os.tmpdir(), "find-social-"));
    vi.stubEnv("FIND_TEST_DATA_FILE", path.join(dir, "find.json"));
    vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DATABASE_URL_WEB", ""); vi.stubEnv("NOTION_TOKEN", "");
  });
  afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

  const makeForge = async (nickname: string, ids = ["f_bowl", "w_pet", "r_light"]) => {
    const find = lookup(chipTree("고양이가 밥 먹었는지 모르겠어"));
    const res = await fireRoute(post("/api/find/fires", { idea: "고양이 밥", picked: ids.map((id) => find(id)), peak: 60, nickname }));
    const body = await res.json();
    return { cookie: res.cookies.get("find_owner")!.value, forgeId: body.forge.id as string, fireId: body.fire.id as string };
  };
  const visit = async (cookie: string | null, host: string, action: string, extra: Record<string, unknown> = {}) => {
    const { POST } = await import("../apps/web/app/api/find/visit/route");
    return POST(post("/api/find/visit", { host, action, ...extra }, cookie ? { cookie: `find_owner=${cookie}` } : {}));
  };

  it("내 대장간이 없으면 행동 대신 도깨비불 찾기로 안내한다", async () => {
    const host = await makeForge("주인");
    const res = await visit(null, host.forgeId, "fuel");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("need_forge");
  });

  it("장작은 같은 집에 하루 1번, 나도 갖고 싶어는 한 번, 정해진 말만 하루 한 마디", async () => {
    const host = await makeForge("주인");
    const guest = await makeForge("손님");
    expect((await (await visit(guest.cookie, host.forgeId, "fuel")).json()).changed).toBe(true);
    expect((await (await visit(guest.cookie, host.forgeId, "fuel")).json()).changed).toBe(false);
    expect((await (await visit(guest.cookie, host.forgeId, "want")).json()).changed).toBe(true);
    expect((await (await visit(guest.cookie, host.forgeId, "want")).json()).changed).toBe(false);
    expect((await visit(guest.cookie, host.forgeId, "note", { phrase: "아무 말이나" })).status).toBe(400);
    const noted = await (await visit(guest.cookie, host.forgeId, "note", { phrase: "이거 천재다" })).json();
    expect(noted.state.notes).toEqual([expect.objectContaining({ phrase: "이거 천재다", nickname: "손님" })]);
    expect((await (await visit(guest.cookie, host.forgeId, "note", { phrase: "응원해" })).json()).changed).toBe(false);
    const after = (await (await visit(guest.cookie, host.forgeId, "neighbor", { on: true })).json()).state;
    expect(after).toMatchObject({ fuelToday: 1, fuelTotal: 1, wants: 1, neighbors: 1, mine: { fuelGivenToday: true, wanted: true, notedToday: true, neighbor: true } });
    expect((await visit(host.cookie, host.forgeId, "fuel")).status).toBe(400); // 내 집엔 못 넣음
    const { neighborsOf } = await import("../apps/web/lib/find/village-store");
    expect((await neighborsOf(guest.forgeId)).map((f) => f.id)).toEqual([host.forgeId]);
  });

  it("들른 집의 도깨비불은 내 도감에 한 칸씩 (같은 불은 한 번만)", async () => {
    const host = await makeForge("주인");
    const guest = await makeForge("손님");
    const { recordVisit, dexOf } = await import("../apps/web/lib/find/village-store");
    expect(await recordVisit(guest.forgeId, host.forgeId, [host.fireId])).toBe(1);
    expect(await recordVisit(guest.forgeId, host.forgeId, [host.fireId])).toBe(0);
    expect(await recordVisit(null, host.forgeId, [host.fireId])).toBe(0);
    expect((await dexOf(guest.forgeId)).map((f) => f.id)).toEqual([host.fireId]);
  });

  it("받은 장작만큼 대기 순번이 앞당겨진다", async () => {
    vi.stubEnv("FIND_FUEL_BOOST", "1");
    const a = await makeForge("가");
    const b = await makeForge("나");
    const c = await makeForge("다");
    const join = async (email: string, fireId: string) => (await (await waitlistRoute(post("/api/find/waitlist", { email, fireId, privacyConsent: true, marketingConsent: false, ref: null }))).json()).standing;
    await join("a@example.com", a.fireId);
    await join("b@example.com", b.fireId);
    expect((await join("c@example.com", c.fireId)).position).toBe(3);
    await visit(a.cookie, c.forgeId, "fuel");
    await visit(b.cookie, c.forgeId, "fuel");
    const again = await join("c@example.com", c.fireId);
    expect(again.fuel).toBe(2);
    expect(again.position).toBe(2); // 3번째 - 장작 2개 = 1번째와 같은 자리, 같으면 먼저 신청한 사람이 앞
  });
});

describe("손바닥 마을 (Phase 4)", () => {
  let dir = "";
  beforeEach(async () => {
    resetRateLimits();
    dir = await mkdtemp(path.join(os.tmpdir(), "find-town-"));
    vi.stubEnv("FIND_TEST_DATA_FILE", path.join(dir, "find.json"));
    vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("DATABASE_URL_WEB", ""); vi.stubEnv("NOTION_TOKEN", "");
  });
  afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

  const makeForge = async (nickname: string, ids: string[]) => {
    const find = lookup(chipTree("고양이가 밥 먹었는지 모르겠어"));
    const res = await fireRoute(post("/api/find/fires", { idea: "고양이", picked: ids.map((id) => find(id)), peak: 60, nickname }));
    const body = await res.json();
    return { cookie: res.cookies.get("find_owner")!.value, forgeId: body.forge.id as string };
  };

  it("본관 공사는 마을 장작 총합으로 25%마다 한 단계, 집 굴뚝 불은 화력+장작", async () => {
    const { hallProgress, chimneyLevel, VILLAGES, ALLEY_THEMES, houseStage } = await import("../apps/web/lib/find/village");
    expect(hallProgress(0)).toMatchObject({ pct: 0, stage: 0, label: "터" });
    expect(hallProgress(500)).toMatchObject({ pct: 50, stage: 2, label: "지붕" });
    expect(hallProgress(5000)).toMatchObject({ pct: 100, stage: 4, label: "완공" });
    expect(chimneyLevel(30, 0)).toBe(1);
    expect(chimneyLevel(60, 10)).toBe(2);
    expect(chimneyLevel(90, 10)).toBe(3);
    // 모든 골목은 마을 하나에 속한다
    for (const t of ALLEY_THEMES) expect(VILLAGES.filter((s) => s.themes.includes(t.id)).length, t.id).toBe(1);
    expect(VILLAGES.map((v) => v.name)).toEqual(["꼬물마을", "뚝딱마을", "째깍마을", "와글마을", "깜빡마을"]);
    expect(houseStage(["w_cat"])).toBe(1);
    expect(houseStage(["f_bowl", "s_count", "w_cat"])).toBe(2);
    expect(houseStage(["f_bowl", "s_count", "r_press", "w_cat"])).toBe(3);
  });

  it("골목 지도는 터 순서대로, 비공개 집은 잠긴 집으로, 이웃은 끈으로", async () => {
    const a = await makeForge("가", ["f_bowl", "w_pet"]);
    const b = await makeForge("나", ["f_bowl", "w_cat"]);
    const c = await makeForge("다", ["f_bowl", "w_pet"]);
    const { setNeighbor, setVisibility, alleyHouses, villageOverview, giveFuel } = await import("../apps/web/lib/find/village-store");
    await setNeighbor(a.forgeId, b.forgeId, true);
    await setNeighbor(a.forgeId, c.forgeId, true);
    await setVisibility(c.forgeId, "private");
    await giveFuel(b.forgeId, a.forgeId);
    const { houses, strings } = await alleyHouses("cat", 1);
    expect(houses.map((h) => [h.plotNo, h.nickname, h.locked])).toEqual([[1, "가", false], [2, "나", false], [3, "잠긴 집", true]]);
    expect(houses[2].forgeId).toBeNull();
    expect(houses[0].fuel).toBe(1);
    expect(strings).toEqual([{ follower: a.forgeId, followee: b.forgeId }]); // 비공개 집으로 가는 끈은 숨김
    const overview = await villageOverview();
    expect(overview).toMatchObject({ totalFuel: 1, totalForges: 3, alleys: [{ theme: "cat", seq: 1, residents: 3 }] });
  });

  it("공사 계획판: 내 장작(1 + 받은 장작) 안에서, 후보당 최대 3개", async () => {
    const a = await makeForge("가", ["f_bowl", "w_pet"]);
    const b = await makeForge("나", ["f_desk", "s_time"]);
    const { createPlan, giveFuel } = await import("../apps/web/lib/find/village-store");
    await createPlan("밤 테마 골목", "");
    await createPlan("도감 교환", "");
    const { POST } = await import("../apps/web/app/api/find/plan/route");
    const vote = (cookie: string | null, planId: number, fuel: number) => POST(post("/api/find/plan", { planId, fuel }, cookie ? { cookie: `find_owner=${cookie}` } : {}));
    expect((await vote(null, 1, 1)).status).toBe(403);
    expect((await vote(a.cookie, 1, 1)).status).toBe(200);
    expect((await vote(a.cookie, 2, 1)).status).toBe(409); // 장작 1개뿐
    await giveFuel(b.forgeId, a.forgeId);
    const ok = await (await vote(a.cookie, 2, 1)).json();
    expect(ok.budget).toEqual({ total: 2, used: 2 });
    expect(ok.plans.map((p: { title: string; fuel: number; mine: number }) => [p.title, p.fuel, p.mine])).toEqual([["밤 테마 골목", 1, 1], ["도감 교환", 1, 1]]);
  });

  it("집 신고는 쌓이고, 운영자가 숨기면 비공개가 된다", async () => {
    const a = await makeForge("가", ["f_bowl", "w_pet"]);
    const { POST } = await import("../apps/web/app/api/find/report/route");
    expect((await POST(post("/api/find/report", { host: a.forgeId, reason: "불쾌한 이름" }))).status).toBe(201);
    expect((await POST(post("/api/find/report", { host: a.forgeId, reason: "아무거나" }))).status).toBe(400);
    const { listReports, resolveReport, setVisibility, getForge } = await import("../apps/web/lib/find/village-store");
    const [r] = await listReports();
    expect(r).toMatchObject({ forgeId: a.forgeId, reason: "불쾌한 이름", resolved: false });
    await setVisibility(a.forgeId, "private"); await resolveReport(r.id);
    expect((await getForge(a.forgeId))?.visibility).toBe("private");
    expect((await listReports())[0].resolved).toBe(true);
  });
});

describe("마을의 기척", () => {
  it("주인이 마을에 들어오면 그 집이 '지금 기척 있음'이 되고, 걷는 마을 집 정보에 실린다", async () => {
    const vs = await import("../apps/web/lib/find/village-store");
    const { forge } = await vs.ensureForge(vs.hashToken(`presence-${Date.now()}`), "기척", ["w_kid", "r_face"]);
    expect(await vs.activeForgeIds()).not.toContain(forge.id);
    await vs.touchForge(forge.id);
    await vs.touchForge(forge.id); // 2분 안에 다시 불러도 괜찮다
    expect(await vs.activeForgeIds()).toContain(forge.id);
    const world = await vs.worldHouses();
    const house = world.houses.find((h) => h.id === forge.id)!;
    expect(house).toMatchObject({ active: true, recent: true, lit: true, theme: "kid", fires: 0, stage: 1 });
  });
});

describe("대장간 꾸미기", () => {
  it("모르는 값과 안 열린 꾸미기는 저장 전에 걸러진다", async () => {
    const { cleanDecor } = await import("../apps/web/lib/find/decor");
    const none = { neighbors: 0, fuel: 0, wants: 0, notes: 0 };
    expect(cleanDecor({ roof: "#123456", sign: "plank", yard: ["pot", "bench", "lamp"] }, none)).toEqual({ sign: "plank", yard: ["pot"] });
    expect(cleanDecor({ roof: "#9B7BFF", yard: ["pot", "pot", "bench", "mailbox", "fence"] }, { ...none, neighbors: 3 })).toEqual({ roof: "#9B7BFF", yard: ["pot", "bench", "mailbox"] });
    expect(cleanDecor({ hidePresence: true }, none)).toEqual({ hidePresence: true });
  });

  it("기척을 숨긴 집은 마을에 있어도 연기·불빛으로 드러나지 않고, 비공개 집도 주인에겐 보인다", async () => {
    const vs = await import("../apps/web/lib/find/village-store");
    const { forge } = await vs.ensureForge(vs.hashToken(`decor-${Date.now()}`), "숨김", ["s_air"]);
    await vs.setDecor(forge.id, { hidePresence: true, roof: "#E2574C" });
    await vs.touchForge(forge.id);
    expect(await vs.activeForgeIds()).not.toContain(forge.id);
    const house = (await vs.worldHouses()).houses.find((h) => h.id === forge.id)!;
    expect(house).toMatchObject({ active: false, decor: { hidePresence: true, roof: "#E2574C" } });
    await vs.setVisibility(forge.id, "private");
    expect((await vs.worldHouses()).houses.some((h) => h.id === forge.id)).toBe(false);
    expect((await vs.worldHouses(forge.id)).houses.some((h) => h.id === forge.id)).toBe(true);
  });
});

describe("마을 문", () => {
  it("대장간 오픈 알림 이메일을 남긴 대장간에만 마을 문이 열린다", async () => {
    const vs = await import("../apps/web/lib/find/village-store");
    const store = await import("../apps/web/lib/find/store");
    const { forge } = await vs.ensureForge(vs.hashToken(`gate-${Date.now()}`), "문지기", ["w_kid"]);
    expect(await vs.villageOpenFor(forge.id)).toBe(false);
    const fire = { id: `gatefire${Date.now()}`, idea: "(테스트)", sentence: "테스트", picked: ["w_kid"], labels: [], peak: 30, color: "#4FB3A6", reactKind: "none", name: "문지기 불", matches: [], comboKey: "x", card: null, nickname: "문지기", forgeId: forge.id, createdAt: new Date().toISOString() };
    await store.backend().saveFire(fire);
    await store.joinWaitlist({ email: `gate-${Date.now()}@example.com`, fireId: fire.id, idea: null, sentence: null, picked: [], peakFire: null, fireColor: null, referredBy: null, marketingConsent: false });
    expect(await vs.villageOpenFor(forge.id)).toBe(true);
  });
});
