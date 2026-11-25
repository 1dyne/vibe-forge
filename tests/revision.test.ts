import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST as mcp } from "../apps/web/app/api/mcp/route";
import { GET as revisionGet, POST as revisionPost } from "../apps/web/app/api/projects/[id]/revision/route";
import { POST as register } from "../apps/web/app/api/oauth/register/route";
import { POST as authorize } from "../apps/web/app/api/oauth/authorize/route";
import { POST as token } from "../apps/web/app/api/oauth/token/route";
import { createHash, randomBytes } from "node:crypto";
import { getProject, mutateProject } from "../apps/web/lib/local-project-store";
import type { MockupSpec } from "../apps/web/lib/mockup";
import type { BuildResult, HousingPlan, LocalProject, ProductForm } from "../apps/web/lib/project-types";
import { resetRateLimits } from "../apps/web/lib/rate-limit";
import { RevisionError, applyProposal, computeImpact, costText, createProposal, impactText, rejectProposal, revisionOf } from "../apps/web/lib/revision";
import { userSessionValue } from "../apps/web/lib/session";
import { tools } from "../apps/web/lib/tools/revision-tools";
import { createUser } from "../apps/web/lib/users";
import { vaultFor, withVault } from "../apps/web/lib/vault";
import "../apps/web/lib/mcp-tools"; // 도구 공용 판(kit)을 채운다

// ── 계산 ─────────────────────────────────────────────────────────────────────

const build = (components: Array<[string, string, string]>, nets: Array<[string, "power" | "ground" | "signal", string[]]>, behavior = "버튼을 누르면 LED가 켜진다"): BuildResult => ({
  status: "ready",
  blueprint: { title: "램프", board: "Arduino UNO R3", supplyVoltage: 5, components: components.map(([ref, type, valueOrModel]) => ({ ref, type, valueOrModel, reason: "r" })), nets: nets.map(([name, kind, members]) => ({ name, kind, members })), enclosure: { widthMm: 60, depthMm: 40, heightMm: 20, wallMm: 2 }, firmware: { platform: "arduino", behavior, pinAssignments: [], loopSteps: [] }, assumptions: [], humanChecks: [] },
  checks: [], evaluator: {} as BuildResult["evaluator"], artifacts: [{ id: "a1", kind: "firmware", filename: "dalgeurak_firmware.ino", mimeType: "text/plain", content: "x".repeat(4000), createdAt: "2026-11-25T00:00:00.000Z" }] as BuildResult["artifacts"], createdAt: "2026-11-25T00:00:00.000Z"
});
const baseBuild = build([["U1", "board", "Arduino UNO R3"], ["D1", "indicator", "LED 5mm 빨강"], ["R1", "passive", "저항 220Ω"]], [["5V", "power", ["U1.5V"]], ["GND", "ground", ["U1.GND", "D1.K"]], ["LED", "signal", ["U1.D9", "R1.1"]], ["LED_A", "signal", ["R1.2", "D1.A"]]]);
const swappedBuild = build([["U1", "board", "Arduino UNO R3"], ["D1", "indicator", "WS2812B LED 링"], ["R1", "passive", "저항 220Ω"]], [["5V", "power", ["U1.5V", "D1.VCC"]], ["GND", "ground", ["U1.GND", "D1.GND"]], ["LED", "signal", ["U1.D6", "R1.1"]], ["LED_A", "signal", ["R1.2", "D1.DIN"]]]);
const form: ProductForm = { summary: "s", answers: [{ question: "q", answer: "a" }], shape: [{ name: "몸통", primitive: "box", size: [60, 40, 20], position: [0, 0, 0] }, { name: "뚜껑", primitive: "box", size: [60, 40, 3], position: [0, 0, 20] }], features: [{ name: "USB 구멍", kind: "port", facing: "front", position: [0, 20, 8], size: [12, 7] }], internals: [], material: "PLA", updatedAt: "2026-11-25T00:00:00.000Z" };
const region = (id: string, name: string, shapeRefs: number[], access?: HousingPlan["regions"][number]["access"]): HousingPlan["regions"][number] => ({ id, name, role: "r", shapeRefs, method: "print_fdm", why: "w", material: { name: "PLA", thicknessMm: 2 }, join: [], toleranceMm: 0.3, ...(access ? { access } : {}), outputs: [], process: ["바닥을 베드에"], costKRW: null, timeHours: null, feasible: "yes" });
const housing: HousingPlan = { summary: "s", regions: [region("body", "몸통", [0], { purpose: "charging", how: "앞면 USB" }), region("lid", "뚜껑", [1])], environment: { indoorOutdoor: "indoor", water: "none", heatSources: [], skinContact: false, childUse: false }, assemblyOrder: ["body", "lid"], totals: { costKRW: null, timeHours: null, partial: true }, risks: [], updatedAt: "2026-11-25T00:00:00.000Z" };
const project = (over: Partial<LocalProject> = {}): LocalProject => ({
  id: "p1", name: "램프", idea: "i", oneLiner: "o", stage: "workshop", designRevision: 1, tasks: [], messages: [], build: baseBuild, productForm: form, housing,
  buildPlan: { modules: [{ function: "빛", part: "WS2812B LED 링 (12구)", why: "w", connection: "c", whereToBuy: "b", searchKeyword: "k", estPriceKRW: 3500, difficulty: "쉬움" }, { function: "빛", part: "LED 5mm 빨강", why: "w", connection: "c", whereToBuy: "b", searchKeyword: "k", estPriceKRW: 100, difficulty: "쉬움" }] } as LocalProject["buildPlan"],
  workflow: { phase: "workshop", profile: { tools: [], toolsConfirmed: true, firmwareExperience: "none", coreBehavior: "c" }, activeAgents: ["hw", "me"], circuitApprovedAt: "2026-11-20T00:00:00.000Z", mockupApprovedAt: "2026-11-21T00:00:00.000Z", sharedUpdates: [], purchases: { D1: "received", R1: "ordered" }, evidence: [] },
  assembly: { stage: "1단계", base: { name: "브레드보드", kind: "breadboard", width: 80, height: 50 }, parts: [], steps: [{ title: "보드 놓기", action: "a", place: ["U1"], wires: [], check: "c", cards: [] }, { title: "LED 잇기", action: "a", place: ["D1", "R1"], wires: [{ from: "U1.D9", to: "R1.1", color: "yellow" }, { from: "R1.2", to: "D1.A", color: "yellow" }], check: "c", cards: [] }], updatedAt: "2026-11-22T00:00:00.000Z" },
  assemblyReports: [{ step: 2, cardId: null, text: "LED 켜짐", createdAt: "2026-11-23T00:00:00.000Z" }],
  testPlan: { board: "UNO", updatedAt: "2026-11-23T00:00:00.000Z", cases: [{ id: "t1", stage: 1, title: "LED 깜빡임", setup: "s", do: "d", expect: { observe: "깜빡임" }, result: { status: "pass", evidence: "봤음", at: "2026-11-23T00:00:00.000Z", by: "person" } }, { id: "t2", stage: 2, title: "버튼", setup: "s", do: "d", expect: { observe: "o" } }] },
  ...over
} as LocalProject);

describe("수정안의 영향 계산", () => {
  it("부품을 바꾸면 이미 받은 부품, 다시 이을 선, 다시 올릴 코드, 다시 할 조립과 테스트를 찾아낸다", () => {
    const impact = computeImpact(project(), { build: swappedBuild });
    expect(impact.empty).toBe(false);
    expect(impact.fields).toEqual(["회로"]);
    expect(impact.parts.swapped).toEqual(["D1: LED 5mm 빨강 → WS2812B LED 링"]);
    // 이미 받은 D1은 돈을 돌려받는 것으로 치지 않고, 안 쓰게 됐다고 알린다
    expect(impact.invalidated.purchases).toEqual(["D1 LED 5mm 빨강 — 이미 받은 부품인데 더 쓰지 않아요"]);
    expect(impact.cost).toEqual({ addKRW: 3500, saveKRW: 0, unknown: [] });
    expect(costText(impact)).toBe("약 3,500원 더 들어요");
    expect(impact.wiring).toContain("옮기기: R1.1을(를) LED 선에서 LED 선으로".replace("옮기기: R1.1을(를) LED 선에서 LED 선으로", "새로 잇기: U1.D6 → LED 선"));
    expect(impact.wiring).toContain("떼기: U1.D9 (LED 선)");
    expect(impact.wiring).toContain("떼기: D1.K (GND 선)");
    expect(impact.invalidated.firmware).toBe(true);
    // 2단계는 이미 했고(보고가 있다) 바뀐 부품을 다룬다. 1단계는 상관없다.
    expect(impact.invalidated.assemblySteps).toEqual(["2단계 「LED 잇기」"]);
    // 결과가 있는 테스트만 무효가 된다
    expect(impact.invalidated.tests).toEqual(["1단계 LED 깜빡임 (통과 기록)"]);
    expect(impact.redo.map((t) => t.title)).toEqual(["수정된 코드 다시 올리기", "바뀐 부품 구하기", "안 쓰게 된 부품 처리", "선 다시 잇기", "테스트 다시 하기", "고친 조립 가이드 받기", "조립 다시 하기"]);
    expect(impact.redo.find((t) => t.title === "수정된 코드 다시 올리기")!.kind).toBe("run_firmware");
    expect(impactText(impact)).toContain("사람이 다시 할 일:");
  });

  it("가격을 모르는 부품은 모른다고 남기고, 아직 안 산 부품을 빼면 그만큼 줄어든다", () => {
    const p = project({ workflow: { ...project().workflow!, purchases: {} } });
    const added = build([...baseBuild.blueprint.components.map((c) => [c.ref, c.type, c.valueOrModel] as [string, string, string]), ["S1", "sensor", "이름 모를 센서 XYZ"]], baseBuild.blueprint.nets.map((n) => [n.name, n.kind, n.members] as [string, "power" | "ground" | "signal", string[]]));
    expect(computeImpact(p, { build: added }).cost).toEqual({ addKRW: 0, saveKRW: 0, unknown: ["이름 모를 센서 XYZ"] });
    expect(costText(computeImpact(p, { build: added }))).toBe("가격 모름: 이름 모를 센서 XYZ (사기 전에 확인)");
    const removed = build([["U1", "board", "Arduino UNO R3"], ["R1", "passive", "저항 220Ω"]], [["5V", "power", ["U1.5V"]], ["GND", "ground", ["U1.GND"]], ["LED", "signal", ["U1.D9", "R1.1"]]]);
    const impact = computeImpact(p, { build: removed });
    expect(impact.parts.removed).toEqual(["D1 LED 5mm 빨강"]);
    expect(impact.cost.saveKRW).toBe(100);
    expect(impact.invalidated.purchases).toEqual([]);
  });

  it("겉모양을 바꾸면 그 도형을 쓰는 하우징 부위만 다시 뽑게 한다", () => {
    const taller: ProductForm = { ...form, shape: [form.shape[0], { ...form.shape[1], size: [60, 40, 4] }] };
    const impact = computeImpact(project(), { productForm: taller });
    expect(impact.fields).toEqual(["완성품 형태"]);
    expect(impact.invalidated.reprint).toEqual(["뚜껑"]);
    expect(impact.invalidated.firmware).toBe(false);
    expect(impact.invalidated.tests).toEqual([]);
    expect(impact.redo.map((t) => t.title)).toEqual(["하우징 다시 만들기", "고친 자리 실물로 확인"]);
    // 구멍만 옮기면 여는 곳이 있는 부위(몸통)를 든다
    const moved: ProductForm = { ...form, features: [{ ...form.features[0], position: [0, 20, 9] }] };
    expect(computeImpact(project(), { productForm: moved }).invalidated.reprint).toEqual(["몸통"]);
  });

  it("하우징 계획과 정밀 목업은 바뀐 부위만 짚는다", () => {
    const thicker: HousingPlan = { ...housing, regions: [housing.regions[0], { ...housing.regions[1], material: { name: "PLA", thicknessMm: 3 } }] };
    expect(computeImpact(project(), { housing: thicker }).invalidated.reprint).toEqual(["뚜껑"]);
    // 값만 다시 매긴 것(비용·시간)은 다시 뽑을 이유가 아니다
    const priced: HousingPlan = { ...housing, regions: housing.regions.map((r) => ({ ...r, costKRW: 1500 })) };
    expect(computeImpact(project(), { housing: priced }).invalidated.reprint).toEqual([]);
    const mock = (hole: number): MockupSpec => ({ title: "m", summary: "s", parts: [{ id: "body", name: "몸통", group: "housing", basis: "design", solids: [{ shape: "hollowBox", size: [60, 40, 20], at: [0, 0, 0], wall: 2, floor: 2, openings: [{ wall: "front", offset: 0, bottom: hole, width: 12, height: 7 }] }] }, { id: "uno", name: "UNO", group: "measured", basis: "measured", solids: [{ shape: "box", size: [30, 20, 5], at: [0, 0, 2] }] }] });
    const impact = computeImpact(project({ preciseMockup: mock(6) }), { preciseMockup: mock(7) });
    expect(impact.changes).toEqual(["하우징 부위 「몸통」의 치수나 자리가 바뀌어요"]);
    expect(impact.invalidated.reprint).toEqual(["몸통"]);
  });

  it("달라지는 것이 없으면 빈 영향이고, 수정안으로 받지 않는다", () => {
    const same = computeImpact(project(), { build: { ...baseBuild, createdAt: "2026-12-01T00:00:00.000Z" }, productForm: { ...form, updatedAt: "2026-12-01T00:00:00.000Z" }, housing: { ...housing, updatedAt: "2026-12-01T00:00:00.000Z" } });
    expect(same).toMatchObject({ empty: true, fields: [], changes: [], redo: [] });
    expect(impactText(same)).toBe("지금 설계와 달라지는 것이 없어요.");
    expect(() => createProposal(project(), { title: "t", reason: "아무 일 없음", by: "hw", changes: { productForm: form } }, "id1", "2026-11-25T00:00:00.000Z")).toThrowError(/달라지는 것이 없어요/);
    expect(() => createProposal(project(), { title: "t", reason: "r", by: "hw", changes: {} }, "id1", "2026-11-25T00:00:00.000Z")).toThrowError(RevisionError);
  });
});

describe("수정안 승인과 거절", () => {
  const NOW = "2026-11-26T00:00:00.000Z";
  let n = 0; const newId = () => `task-${++n}`;
  const proposed = () => { const p = project(); const { state, proposal } = createProposal(p, { title: "LED를 링으로", reason: "LED 하나로는 어두웠어요", by: "hw", changes: { build: swappedBuild } }, "prop-1", "2026-11-25T12:00:00.000Z"); p.revision = state; return { p, proposal }; };

  it("올리기만 해서는 설계가 바뀌지 않는다", () => {
    const { p, proposal } = proposed();
    expect(proposal.status).toBe("proposed");
    expect(p.build).toBe(baseBuild);
    expect(p.tasks).toEqual([]);
  });

  it("승인하면 적용되고, 다시 할 일이 한 번만 생기고, 예전 값이 남고, 다른 승인은 그대로다", () => {
    const { p } = proposed();
    const approved = applyProposal(p, "prop-1", NOW, newId);
    expect(approved).toMatchObject({ status: "approved", decidedAt: NOW });
    expect(p.build!.blueprint.components.find((c) => c.ref === "D1")!.valueOrModel).toBe("WS2812B LED 링");
    expect(p.tasks.map((t) => [t.kind, t.title, t.status])).toContainEqual(["run_firmware", "수정된 코드 다시 올리기", "ready"]);
    expect(p.tasks).toHaveLength(7);
    // 예전 회로가 기록에 남되, 파일 전문은 줄여서
    expect(approved.previous!.build!.blueprint.components.find((c) => c.ref === "D1")!.valueOrModel).toBe("LED 5mm 빨강");
    expect(approved.previous!.build!.artifacts[0].content.length).toBeLessThan(1600);
    // 회로·3D 승인은 건드리지 않는다
    expect(p.workflow).toMatchObject({ phase: "workshop", circuitApprovedAt: "2026-11-20T00:00:00.000Z", mockupApprovedAt: "2026-11-21T00:00:00.000Z" });
    // 통과했던 테스트는 지우지 않고 '모름'으로, 이유와 함께
    expect(p.testPlan!.cases[0].result).toMatchObject({ status: "unknown", at: NOW });
    expect(p.testPlan!.cases[0].result!.evidence).toContain("이전 기록: 통과");
    expect(p.testPlan!.cases[1].result).toBeUndefined();
    // 구매 기록은 사람의 것이라 손대지 않는다
    expect(p.workflow!.purchases).toEqual({ D1: "received", R1: "ordered" });
    // 두 번 승인할 수 없고, 할 일도 겹치지 않는다
    expect(() => applyProposal(p, "prop-1", NOW, newId)).toThrowError(/이미 승인한/);
    expect(p.tasks).toHaveLength(7);
  });

  it("열려 있는 같은 제목의 일이 있으면 또 만들지 않는다", () => {
    const { p } = proposed();
    p.tasks.push({ id: "x", kind: "run_firmware", title: "수정된 코드 다시 올리기", plain: "이미 있음", status: "ready" });
    applyProposal(p, "prop-1", NOW, newId);
    expect(p.tasks.filter((t) => t.title === "수정된 코드 다시 올리기")).toHaveLength(1);
  });

  it("거절하면 아무것도 바뀌지 않고, 같은 항목의 새 수정안은 앞의 것을 갈음한다", () => {
    const { p } = proposed();
    const next = createProposal(p, { title: "LED를 링으로 (핀 변경)", reason: "D6이 비어 있어요", by: "hw", changes: { build: swappedBuild } }, "prop-2", NOW);
    p.revision = next.state;
    expect(revisionOf(p).proposals.map((x) => [x.id, x.status])).toEqual([["prop-1", "superseded"], ["prop-2", "proposed"]]);
    expect(() => applyProposal(p, "prop-1", NOW, newId)).toThrowError(/더는 승인할 수 없는/);
    expect(rejectProposal(p, "prop-2", NOW).status).toBe("rejected");
    expect(p.build).toBe(baseBuild);
    expect(p.tasks).toEqual([]);
    expect(() => rejectProposal(p, "nope", NOW)).toThrowError(/찾을 수 없어요/);
  });
});

// ── 도구와 승인 경로 ─────────────────────────────────────────────────────────

const ORIGIN = "https://forge.example";
const CALLBACK = "http://127.0.0.1:1466/callback";
let folder: string;
beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "forge-revision-test-"));
  vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
  vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
  vi.stubEnv("FORGE_TEST_OAUTH_FILE", path.join(folder, "oauth.json"));
  vi.stubEnv("FORGE_TEST_AUDIT_FILE", path.join(folder, "audit.jsonl"));
  vi.stubEnv("APP_MODE", "mock");
  vi.stubEnv("SESSION_SECRET", "test-secret-for-revision-routes-0123456789");
  vi.stubEnv("APP_BASE_URL", ORIGIN);
});
afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });
beforeEach(() => resetRateLimits());

const post = (url: string, body: unknown, headers: Record<string, string> = {}) => new NextRequest(`${ORIGIN}${url}`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...headers }, body: JSON.stringify(body) });
const cookie = (linkToken: string) => ({ cookie: `dalgeurak_session=${userSessionValue(linkToken)}` });
async function person(name: string) {
  const { user, token: linkToken } = await createUser(name, false);
  const client = await (await register(post("/api/oauth/register", { client_name: "t", redirect_uris: [CALLBACK], token_endpoint_auth_method: "none" }))).json();
  const verifier = randomBytes(32).toString("base64url");
  const allowed = await (await authorize(post("/api/oauth/authorize", { client_id: client.client_id, redirect_uri: CALLBACK, code_challenge: createHash("sha256").update(verifier).digest("base64url"), state: "s", decision: "allow" }, cookie(linkToken)))).json();
  const tokens = await (await token(new NextRequest(`${ORIGIN}/api/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: client.client_id, code: new URL(allowed.redirect).searchParams.get("code")!, redirect_uri: CALLBACK, code_verifier: verifier }).toString() }))).json();
  const created = await (await mcp(post("/api/mcp", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_project", arguments: { idea: "버튼 램프", plan: { projectName: "수정 램프", oneLiner: "o", reply: "좋아요", slotUpdates: [], tasks: [] } } } }, { authorization: `Bearer ${tokens.access_token}` }))).json();
  const projectId = created.result.structuredContent.id as string;
  const vault = vaultFor(linkToken, user.id);
  return { user, linkToken, projectId, vault };
}
const mock = (bottom: number) => ({ title: "램프 목업", summary: "몸통 안에 보드를 놓았어요.", parts: [
  { id: "body", name: "몸통", group: "housing", basis: "design", solids: [{ shape: "hollowBox", size: [60, 40, 20], at: [0, 0, 0], wall: 2, floor: 2, openings: [{ wall: "front", offset: 0, bottom, width: 12, height: 7 }] }] },
  { id: "uno", name: "보드", group: "measured", basis: "measured", solids: [{ shape: "box", size: [30, 20, 5], at: [0, 0, 2] }] }
] });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("수정안 도구와 승인 경로", () => {
  it("달그락은 수정안을 올릴 수만 있고, 사람이 승인해야 적용된다. 남은 볼 수도 승인할 수도 없다", async () => {
    const a = await person("가"); const b = await person("나");
    const context = { user: a.user, dashboardUrl: `${ORIGIN}/` };
    const propose = tools.find((t) => t.name === "propose_design_change")!;
    const args = (bottom: number) => ({ projectId: a.projectId, by: "me", title: "USB 구멍 1mm 올리기", reason: "출력해 보니 USB 구멍이 플러그보다 1mm 낮았어요", changes: { preciseMockup: mock(bottom) } });

    // 고칠 설계가 아직 없으면 받지 않는다
    await expect(withVault(a.vault, () => propose.run(args(7), context))).rejects.toThrowError(/아직 고칠 설계가 없어요/);
    await withVault(a.vault, () => mutateProject(a.projectId, (p) => { p.productForm = form; p.preciseMockup = mock(6) as MockupSpec; }));
    // 검사를 통과하지 못하는 목업은 수정안이 되지 못한다
    const broken = { ...args(7), changes: { preciseMockup: { ...mock(7), parts: [mock(7).parts[0], { ...mock(7).parts[1], solids: [{ shape: "box", size: [30, 20, 5], at: [0, 12, 2] }] }] } } };
    await expect(withVault(a.vault, () => propose.run(broken, context))).rejects.toThrowError(/검사를 통과하지 못했어요/);
    // 정해지지 않은 항목(하우징)은 이 도구로 받지 않는다
    await expect(withVault(a.vault, () => propose.run({ ...args(7), changes: { housing: {} } }, context))).rejects.toThrow();

    const result = await withVault(a.vault, () => propose.run(args(7), context));
    expect(result.text).toContain("아직 적용되지 않았어요");
    expect(result.text).toContain("하우징 부위 「몸통」의 치수나 자리가 바뀌어요");
    expect(result.text).toContain("승인은 사람만 할 수 있어요");
    const stored = (await withVault(a.vault, () => getProject(a.projectId)))!;
    expect((stored.preciseMockup!.parts[0].solids[0] as { openings: Array<{ bottom: number }> }).openings[0].bottom).toBe(6);
    const proposalId = revisionOf(stored).proposals[0].id;

    const listed = await withVault(a.vault, () => tools.find((t) => t.name === "list_design_changes")!.run({ projectId: a.projectId }, context));
    expect(listed.text).toContain("USB 구멍 1mm 올리기 — 승인 대기");

    // 남은 볼 수도, 승인할 수도 없다
    expect((await revisionGet(new NextRequest(`${ORIGIN}/api/projects/${a.projectId}/revision`, { headers: cookie(b.linkToken) }), params(a.projectId))).status).toBe(404);
    expect((await revisionPost(post(`/api/projects/${a.projectId}/revision`, { action: "approve", proposalId }, cookie(b.linkToken)), params(a.projectId))).status).toBe(404);
    expect((await revisionPost(post(`/api/projects/${a.projectId}/revision`, { action: "approve", proposalId }), params(a.projectId))).status).toBe(401);

    const seen = await (await revisionGet(new NextRequest(`${ORIGIN}/api/projects/${a.projectId}/revision`, { headers: cookie(a.linkToken) }), params(a.projectId))).json();
    expect(seen.proposals[0]).toMatchObject({ status: "proposed", fields: ["정밀 목업"] });
    expect(JSON.stringify(seen)).not.toContain("hollowBox"); // 통째 값은 내보내지 않는다

    const approved = await (await revisionPost(post(`/api/projects/${a.projectId}/revision`, { action: "approve", proposalId }, cookie(a.linkToken)), params(a.projectId))).json();
    expect(approved.proposals[0].status).toBe("approved");
    expect((approved.project.preciseMockup.parts[0].solids[0].openings[0].bottom)).toBe(7);
    expect(approved.project.tasks.map((t: { title: string }) => t.title)).toEqual(expect.arrayContaining(["하우징 다시 만들기", "고친 자리 실물로 확인"]));
    expect(approved.project.messages.at(-1).text).toContain("수정안 「USB 구멍 1mm 올리기」을(를) 승인했어요");
    // 이미 결정한 것은 다시 결정할 수 없다
    expect((await revisionPost(post(`/api/projects/${a.projectId}/revision`, { action: "reject", proposalId }, cookie(a.linkToken)), params(a.projectId))).status).toBe(409);
  });
});
