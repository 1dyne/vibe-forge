import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST as mcpPost } from "../apps/web/app/api/mcp/[token]/route";
import { GET as signIn } from "../apps/web/app/u/[token]/route";
import { GET as listRoute } from "../apps/web/app/api/projects/route";
import { POST as messagePost } from "../apps/web/app/api/projects/[id]/messages/route";
import { POST as workflowPost } from "../apps/web/app/api/projects/[id]/workflow/route";
import { createUser, updateUser } from "../apps/web/lib/users";
import { GET as meRoute } from "../apps/web/app/api/me/route";
import { DELETE as deleteUserRoute } from "../apps/web/app/api/admin/users/[id]/route";
import { GET as projectFile } from "../apps/web/app/api/projects/[id]/files/[fileId]/route";
import { listUsers } from "../apps/web/lib/users";
import { getProject, listProjects } from "../apps/web/lib/local-project-store";
import { signSession } from "../apps/web/lib/session";
import { workflowFor } from "../apps/web/lib/workflow";

const SECRET = "test-secret-for-connector-routes-0123456789";
let folder: string;
let rpcId = 0;

async function rpc(token: string, method: string, params?: Record<string, unknown>) {
  const response = await mcpPost(new NextRequest(`http://localhost:3000/api/mcp/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) }), { params: Promise.resolve({ token }) });
  return { status: response.status, body: await response.json() };
}
async function tool(token: string, name: string, args: Record<string, unknown>) {
  const { body } = await rpc(token, "tools/call", { name, arguments: args });
  return body.result as { content: Array<{ text: string }>; structuredContent?: Record<string, any>; isError?: boolean };
}
const plan = { projectName: "버튼 램프", oneLiner: "버튼으로 켜는 탁상 램프", reply: "어떤 밝기를 원하세요?", slotUpdates: [{ key: "power", status: "assumed", valueText: null, assumption: "USB 5V", acknowledged: false }], tasks: [{ kind: "confirm_spec", title: "밝기 정하기", plain: "원하는 밝기를 알려주세요." }] };
const blueprint = { title: "버튼 램프", board: "Arduino Nano", supplyVoltage: 5, sensor: "택트 스위치", actuator: "없음", camera: "없음", enclosure: { widthMm: 80, depthMm: 60, heightMm: 40, wallMm: 2 }, behavior: "버튼을 누르면 LED를 토글한다", pinAssignments: [{ symbol: "BUTTON", pin: 2, role: "digital_input" }, { symbol: "LED", pin: 9, role: "pwm_output" }], loopSteps: ["버튼 읽기", "LED 토글"], assumptions: ["LED 전류 20mA 이하"], humanChecks: ["스위치 핀 배치 확인"] };
const review = { summary: "실측 전에는 판단 보류", hwVerdict: "unknown", hwFinding: "LED 저항값 실측 필요", measurement: "전원 인가 후 PS1.OUT-GND를 DC전압 모드로 재서 4.75~5.25V인지 알려주세요.", swVerdict: "unknown", swFinding: "컴파일 전", firmwareRun: "Arduino IDE에서 Arduino Nano를 고르고 업로드 후 버튼으로 LED가 토글되는지 확인해주세요." };

const buildPlan = { track: "hardware", summary: "버튼과 LED로 켜고 끄는 탁상 램프", board: { choice: "arduino", model: "Arduino Nano", why: "B-1 움직임만 필요", alternatives: "ESP32는 무선이 필요할 때" }, connection: { method: "breadboard", why: "납땜 없이 시작" }, modules: [{ function: "입력", part: "택트 스위치", why: "누르면 토글", connection: "브레드보드", whereToBuy: "디바이스마트", searchKeyword: "택트 스위치 6x6", estPriceKRW: 500, difficulty: "쉬움" }, { function: "보드", part: "Arduino Nano 호환", why: "제어", connection: "USB", whereToBuy: "엘레파츠", searchKeyword: "아두이노 나노", estPriceKRW: 9500, difficulty: "쉬움" }], structure: [{ name: "입력부", role: "버튼", connectsTo: "D2" }], stages: [{ title: "Blink", goal: "LED 깜빡이기", learn: "업로드", practice: "Blink 예제", doneWhen: "1초마다 깜빡임", parts: ["Nano"] }], prerequisites: [{ skill: "업로드", why: "처음", practice: "Blink", timeEstimate: "30분" }], cost: { options: ["2단계로 나누면 1단계 1만 원"], marginNote: "" }, fabrication: { needs3DPrint: false, plan: "종이 상자" }, risks: [] };

const productForm = { summary: "손바닥 크기 원통형 램프", answers: [{ question: "크기", answer: "손바닥" }], shape: [{ name: "몸통", primitive: "cylinder", size: [70, 70, 90], position: [0, 0, 0] }], features: [{ name: "버튼", kind: "button", facing: "top", position: [0, 0, 90], size: [12, 12] }], internals: [{ ref: "U1", label: "Arduino Nano", size: [45, 18, 8], position: [0, 0, 5] }], material: "PLA 흰색" };

beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "forge-connector-test-"));
  vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
  vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
  vi.stubEnv("APP_MODE", "mock");
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("APP_BASE_URL", "https://forge.example");
});
afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });

describe("Claude connector", () => {
  it("speaks MCP and walks a project from idea to an approval-gated circuit", async () => {
    const { token } = await createUser("주최측", false);
    const init = await rpc(token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(init.body.result.protocolVersion).toBe("2025-06-18");
    expect(init.body.result.instructions).toContain(`https://forge.example/u/${token}`);
    const listed = await rpc(token, "tools/list");
    const names = listed.body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("submit_circuit");
    expect(names.some((n: string) => n.startsWith("approve"))).toBe(false);

    const created = await tool(token, "create_project", { idea: "버튼을 누르면 켜지는 탁상 램프", plan });
    expect(created.isError).toBeFalsy();
    const id = created.structuredContent!.id as string;
    expect(created.structuredContent!.phase).toBe("brainstorm");

    const early = await tool(token, "submit_circuit", { projectId: id, blueprint, review });
    expect(early.isError).toBe(true);
    expect(early.content[0].text).toContain("먼저");

    await tool(token, "record_brainstorm", { projectId: id, userMessage: "아주 밝지 않아도 돼요", plan: { ...plan, slotUpdates: [], tasks: [] } });
    const profiled = await tool(token, "set_maker_profile", { projectId: id, coreBehavior: "버튼을 누르면 LED가 켜지고 다시 누르면 꺼진다", tools: ["멀티미터", "브레드보드"], toolsConfirmed: true, firmwareExperience: "guided" });
    expect(profiled.structuredContent!.profileMissing).toEqual([]);

    const noPlan = await tool(token, "submit_circuit", { projectId: id, blueprint, review });
    expect(noPlan.isError).toBe(true);
    expect(noPlan.content[0].text).toContain("set_product_form");
    await tool(token, "set_maker_profile", { projectId: id, coreBehavior: "버튼을 누르면 LED가 켜지고 다시 누르면 꺼진다", tools: ["멀티미터", "브레드보드"], toolsConfirmed: true, firmwareExperience: "guided", budgetKRW: 8000 });
    await tool(token, "set_product_form", { projectId: id, form: productForm });
    const planned = await tool(token, "set_build_plan", { projectId: id, plan: buildPlan });
    expect(planned.isError).toBeFalsy();
    expect(planned.structuredContent!.buildPlan.cost).toMatchObject({ totalKRW: 10000, budgetKRW: 8000, verdict: "over" });
    expect(planned.content[0].text).toContain("2,000원(25%)");
    expect(planned.structuredContent!.files.map((f: { filename: string }) => f.filename)).toContain("버튼 램프-설계도.html");
    const circuit = await tool(token, "submit_circuit", { projectId: id, blueprint, review });
    expect(circuit.isError).toBeFalsy();
    const state = circuit.structuredContent!;
    expect(state.phase).toBe("circuit");
    expect(state.circuit.components.map((c: { ref: string }) => c.ref)).toContain("U1");
    expect(state.files.map((f: { filename: string }) => f.filename)).toContain("dalgeurak_firmware.ino");
    expect(state.files.some((f: { kind: string }) => f.kind === "cad")).toBe(false);
    expect(state.openTasks.some((t: { kind: string }) => t.kind === "measure")).toBe(true);

    const preWorkshop = await tool(token, "log_team_turn", { projectId: id, channel: "main", mode: "work", userMessage: "저항값은?", replies: [{ agent: "chief", text: "220옴부터 시작해요." }], sharedSummary: "미검증: LED 저항 220옴 제안" });
    expect(preWorkshop.isError).toBeFalsy();
    const evalFiles = await tool(token, "log_team_turn", { projectId: id, channel: "chief", mode: "evaluate", userMessage: "검토해줘", replies: [{ agent: "chief", text: "측정이 필요해요." }], sharedSummary: "검토 요청", files: [{ agent: "hw", filename: "x.ino", content: "x" }] });
    expect(evalFiles.isError).toBe(true);

    // The person approves on the dashboard; afterwards the circuit is locked against chat changes.
    const owner = (await import("../apps/web/lib/users")).listUsers().then((users) => users.find((u) => u.name === "주최측")!.id);
    const cookie = "dalgeurak_session=" + await signSession(Date.now() + 3_600_000, SECRET, await owner);
    const approve = await workflowPost(new NextRequest(`http://localhost:3000/api/projects/${id}/workflow`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie }, body: JSON.stringify({ action: "approve_circuit" }) }), { params: Promise.resolve({ id }) });
    expect(approve.status).toBe(200);
    const after = await tool(token, "get_project", { projectId: id });
    expect(after.structuredContent!.phase).toBe("mockup");
    expect(after.structuredContent!.files.some((f: { kind: string }) => f.kind === "cad")).toBe(true);
    const locked = await tool(token, "submit_circuit", { projectId: id, blueprint, review });
    expect(locked.isError).toBe(true);
    expect(locked.content[0].text).toContain("설계 다시 논의");
  });

  it("keeps each person's projects private and gates in-app AI per account", async () => {
    const a = await createUser("참여자 A", false);
    const b = await createUser("참여자 B", true);
    const made = await tool(a.token, "create_project", { idea: "A의 화분 센서", plan });
    const id = made.structuredContent!.id as string;
    expect((await tool(b.token, "get_project", { projectId: id })).isError).toBe(true);
    expect((await tool(b.token, "list_projects", {})).structuredContent!.projects).toEqual([]);

    const cookieFor = async (userId?: string) => "dalgeurak_session=" + await signSession(Date.now() + 3_600_000, SECRET, userId);
    const listAs = async (cookie: string) => (await (await listRoute(new NextRequest("http://localhost:3000/api/projects", { headers: { cookie } }))).json()).projects as Array<{ id: string }>;
    expect((await listAs(await cookieFor(a.user.id))).map((p) => p.id)).toContain(id);
    expect((await listAs(await cookieFor(b.user.id))).map((p) => p.id)).not.toContain(id);
    expect((await listAs(await cookieFor())).map((p) => p.id)).not.toContain(id);

    const post = (cookie: string, suffix: string, body: unknown) => new NextRequest(`http://localhost:3000/api/projects/${id}/${suffix}`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie }, body: JSON.stringify(body) });
    expect((await messagePost(post(await cookieFor(a.user.id), "messages", { text: "안녕" }), { params: Promise.resolve({ id }) })).status).toBe(403);
    expect((await messagePost(post(await cookieFor(b.user.id), "messages", { text: "안녕" }), { params: Promise.resolve({ id }) })).status).toBe(404);
    const profile = await workflowPost(post(await cookieFor(a.user.id), "workflow", { action: "profile", profile: { coreBehavior: "흙이 마르면 LED", tools: [], toolsConfirmed: true, firmwareExperience: "none" } }), { params: Promise.resolve({ id }) });
    expect(profile.status).toBe(200);
  });

  it("signs in with the personal link and stops working once revoked", async () => {
    const { user, token } = await createUser("참여자 C", false);
    const response = await signIn(new NextRequest(`http://localhost:3000/u/${token}`), { params: Promise.resolve({ token }) });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://forge.example/");
    expect(response.headers.get("set-cookie")).toContain(`~${user.id}.`);
    await updateUser(user.id, { revoke: true });
    expect((await rpc(token, "tools/list")).status).toBe(404);
    const after = await signIn(new NextRequest(`http://localhost:3000/u/${token}`), { params: Promise.resolve({ token }) });
    expect(after.headers.get("location")).toContain("/login?error=link");
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    expect((await listRoute(new NextRequest("http://localhost:3000/api/projects", { headers: { cookie } }))).status).toBe(401);
  });

  it("pins a Claude Project to one project, records sources and hands software off to coding tools", async () => {
    const { user, token } = await createUser("참여자 D", false);
    await rpc(token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-code", version: "2.1.0" } });
    const created = await tool(token, "create_project", { idea: "버튼을 누르면 켜지는 탁상 램프", plan });
    const id = created.structuredContent!.id as string;
    expect(created.content[0].text).toContain(`달그락 프로젝트 ID: ${id}`);
    expect(created.structuredContent!.claudeProjectInstructions).toContain("새 달그락 프로젝트를 만들지 마");
    const guide = await tool(token, "dalgeurak_guide", {});
    expect(guide.content[0].text).toContain("추측하지 말고");
    expect(guide.content[0].text).toContain("record_part_source");

    await tool(token, "set_maker_profile", { projectId: id, coreBehavior: "버튼으로 LED 토글", tools: [], toolsConfirmed: true, firmwareExperience: "none" });
    await tool(token, "set_product_form", { projectId: id, form: productForm });
    await tool(token, "set_build_plan", { projectId: id, plan: buildPlan });
    await tool(token, "submit_circuit", { projectId: id, blueprint, review });
    const source = await tool(token, "record_part_source", { projectId: id, ref: "S1", url: "https://example.com/tact-switch", title: "택트 스위치 6x6", price: "100원" });
    expect(source.structuredContent!.partSources.S1[0]).toMatchObject({ url: "https://example.com/tact-switch", price: "100원" });
    expect((await tool(token, "record_part_source", { projectId: id, ref: "S1", url: "javascript:alert(1)", title: "x" })).isError).toBe(true);

    const dev = await tool(token, "set_dev_profile", { projectId: id, codingExperience: "none", tool: "undecided", os: "mac", installed: [], confirmed: true });
    expect(dev.structuredContent!.devProfileMissing).toEqual([]);
    const spec = await tool(token, "write_dev_spec", { projectId: id, title: "램프 제어 웹", goal: "휴대폰으로 램프 상태를 본다", whyCode: "버튼만으로는 원격 확인이 안 돼요", pieces: [{ name: "웹 대시보드", kind: "web", purpose: "상태 표시" }], features: [{ name: "상태 보기", detail: "켜짐/꺼짐 표시" }], acceptance: ["버튼을 누르면 2초 안에 화면이 바뀐다"], outOfScope: ["로그인"], dataInterface: { transport: "serial", format: "state=1\\n" }, stack: [{ name: "HTML+JS", reason: "설치 없이 브라우저에서 돌아가요" }], learningSteps: [{ step: "폴더 만들기", explain: "코드를 모을 곳" }], recommendedTool: "claude_code" });
    expect(spec.isError).toBeFalsy();
    const files = spec.structuredContent!.files.map((f: { filename: string }) => f.filename);
    expect(files).toEqual(expect.arrayContaining(["SPEC.md", "CLAUDE.md", "AGENTS.md"]));
    expect(spec.structuredContent!.team).toContain("sw");
    expect(spec.structuredContent!.devProfile.tool).toBe("claude_code");
    const again = await tool(token, "write_dev_spec", { projectId: id, title: "램프 제어 웹 v2", goal: "g", whyCode: "w", pieces: [{ name: "웹", kind: "web", purpose: "p" }], features: [{ name: "f", detail: "d" }], acceptance: ["a"], outOfScope: [], dataInterface: { transport: "none", format: "-" }, stack: [{ name: "s", reason: "r" }], learningSteps: [{ step: "s", explain: "e" }], recommendedTool: "codex" });
    expect(again.structuredContent!.files.filter((f: { filename: string }) => f.filename === "SPEC.md")).toHaveLength(1);

    const progress = await tool(token, "log_dev_progress", { projectId: id, summary: "시리얼 읽기 완성", done: ["포트 열기"], next: ["화면 표시"], hardwareRequests: ["보드를 USB로 연결하고 시리얼 모니터에 state=1이 찍히는지 알려주세요."] });
    expect(progress.structuredContent!.openTasks.some((t: { title: string }) => t.title === "개발 중 하드웨어 확인")).toBe(true);

    const me = await (await meRoute(new NextRequest("http://localhost:3000/api/me", { headers: { cookie: "dalgeurak_session=" + await signSession(Date.now() + 3_600_000, SECRET, user.id) } }))).json();
    expect(me.connectorUrl).toBe(`https://forge.example/api/mcp/${token}`);
    expect(me.clients[0].name).toBe("claude-code");
  });

  it("asks the checklist as choices and builds the circuit and form Claude describes", async () => {
    const { token } = await createUser("참여자 E", false);
    const created = await tool(token, "create_project", { idea: "말하면 눈을 깜빡이는 털복숭이 반려 로봇", plan });
    const id = created.structuredContent!.id as string;
    const checklist = await tool(token, "get_checklist", { projectId: id });
    expect(checklist.content[0].text).toContain("① 해본 적 없어요");
    expect(checklist.structuredContent!.checklistUrl).toBe(`https://forge.example/u/${token}?p=${id}&open=profile`);
    expect(checklist.structuredContent!.missing.recommended).toContain("납땜 경험");

    await tool(token, "set_maker_profile", { projectId: id, coreBehavior: "말하면 눈을 깜빡인다", tools: [], toolsConfirmed: true, firmwareExperience: "none", solderingSkill: "none", printerAccess: "makerspace", region: "서울 마포구", budgetKRW: 150000, purpose: "personal" });
    const kept = await tool(token, "set_maker_profile", { projectId: id, coreBehavior: "말하면 눈을 깜빡이고 소리를 낸다", tools: [], toolsConfirmed: true, firmwareExperience: "none" });
    expect(kept.structuredContent!.profile).toMatchObject({ solderingSkill: "none", budgetKRW: 150000, region: "서울 마포구" });
    await tool(token, "set_product_form", { projectId: id, form: productForm });
    await tool(token, "set_build_plan", { projectId: id, plan: buildPlan });

    const robot = { ...blueprint, board: "XIAO ESP32S3 Sense", sensor: "내장 마이크", actuator: "원형 디스플레이", camera: "내장 OV2640",
      components: [
        { ref: "U1", type: "controller", valueOrModel: "XIAO ESP32S3 Sense (핀 납땜 완료)", reason: "Wi-Fi·카메라·마이크", connection: "socket" },
        { ref: "DISP1", type: "display", valueOrModel: "Round Display for XIAO", reason: "눈 표현", connection: "socket" },
        { ref: "SPK1", type: "speaker", valueOrModel: "MAX98357A + 8Ω 스피커", reason: "로봇음", connection: "solder" }
      ],
      nets: [
        { name: "VBUS_5V", kind: "power", members: ["U1.5V", "SPK1.VIN"] },
        { name: "GND", kind: "ground", members: ["U1.GND", "DISP1.GND", "SPK1.GND"] },
        { name: "I2S_DATA", kind: "signal", members: ["U1.D2", "SPK1.DIN"] }
      ],
      shape: [
        { name: "몸통", primitive: "sphere", size: [100, 90, 110], position: [0, 0, 0], color: "#3fb8a8" },
        { name: "왼쪽 귀", primitive: "cone", size: [20, 20, 30], position: [-30, 0, 100] },
        { name: "눈(카메라)", primitive: "sphere", size: [14, 8, 14], position: [0, 44, 70] }
      ] };
    const circuit = await tool(token, "submit_circuit", { projectId: id, blueprint: robot, review });
    expect(circuit.isError).toBeFalsy();
    const refs = circuit.structuredContent!.circuit.components.map((c: { ref: string }) => c.ref);
    expect(refs).toEqual(["U1", "DISP1", "SPK1"]);
    const solder = circuit.structuredContent!.circuit.checks.find((c: { id: string }) => c.id === "SOLDER_SKILL");
    expect(solder).toMatchObject({ verdict: "unknown" });
    expect(solder.message).toContain("SPK1");

    const { getProject } = await import("../apps/web/lib/local-project-store");
    const { approvedCad } = await import("../apps/web/lib/build-pipeline");
    const stored = await getProject(id);
    expect(stored!.build!.blueprint.shape).toHaveLength(3);
    const cad = approvedCad(stored!.build!).artifacts.find((a) => a.kind === "cad")!.content;
    expect(cad).toContain("sphere(d=1)");
    expect(cad).toContain("cylinder(h=30, d1=1, d2=0)");
    expect(cad).toContain("difference()");
  });

  it("shows the finished product first, then guides assembly step by step into the workshop", async () => {
    const { user, token } = await createUser("참여자 F", false);
    const id = (await tool(token, "create_project", { idea: "버튼 램프", plan })).structuredContent!.id as string;
    await tool(token, "set_maker_profile", { projectId: id, coreBehavior: "버튼으로 LED 토글", tools: [], toolsConfirmed: true, firmwareExperience: "none" });
    await tool(token, "set_build_plan", { projectId: id, plan: buildPlan });
    const noForm = await tool(token, "submit_circuit", { projectId: id, blueprint, review });
    expect(noForm.isError).toBe(true);
    expect(noForm.content[0].text).toContain("set_product_form");
    const outside = await tool(token, "set_product_form", { projectId: id, form: { ...productForm, internals: [{ ref: "BAT1", label: "보조배터리", size: [150, 70, 20], position: [0, 0, 5] }] } });
    expect(outside.content[0].text).toContain("BAT1");
    const formed = await tool(token, "set_product_form", { projectId: id, form: productForm });
    expect(formed.structuredContent!.files.map((f: { kind: string }) => f.kind)).toContain("product");
    await tool(token, "submit_circuit", { projectId: id, blueprint: { ...blueprint, components: [{ ref: "U1", type: "controller", valueOrModel: "Arduino Nano", reason: "제어", connection: "breadboard" }, { ref: "SW1", type: "switch", valueOrModel: "택트 스위치", reason: "입력", connection: "breadboard" }], nets: [{ name: "5V", kind: "power", members: ["U1.5V", "SW1.A"] }, { name: "GND", kind: "ground", members: ["U1.GND", "SW1.B"] }, { name: "BTN", kind: "signal", members: ["U1.D2", "SW1.A"] }] }, review });

    const cookie = "dalgeurak_session=" + await signSession(Date.now() + 3_600_000, SECRET, user.id);
    const act = async (body: unknown) => (await workflowPost(new NextRequest(`http://localhost:3000/api/projects/${id}/workflow`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })).json();
    const approved = await act({ action: "approve_circuit" });
    const cad = approved.project.build.artifacts.find((a: { kind: string }) => a.kind === "cad").content as string;
    expect(cad).toContain("// 몸통");
    expect(cad).toContain("cylinder(h=90, d=1)");

    const guide = { stage: "1단계 버튼 입력", base: { name: "하프 브레드보드", kind: "breadboard", width: 82, height: 55 },
      parts: [{ ref: "U1", label: "Arduino Nano", x: 10, y: 20, width: 43, height: 18, pins: [{ name: "5V", x: 2, y: 17 }, { name: "D2", x: 20, y: 1 }, { name: "GND", x: 6, y: 17 }] }, { ref: "SW1", label: "택트 스위치", x: 60, y: 22, width: 6, height: 6, pins: [{ name: "A", x: 0, y: 0 }, { name: "B", x: 6, y: 6 }] }],
      steps: [
        { title: "보드 꽂기", action: "Nano를 브레드보드 가운데 홈을 가로질러 USB가 왼쪽으로 가게 꽂아요.", place: ["U1"], wires: [], check: "핀이 양쪽 줄에 나뉘어 꽂혔는지", cards: [{ symptom: "USB를 꽂아도 불이 안 켜져요", check: "멀티미터 DC 20V로 5V 핀과 GND 사이를 재요", expected: "4.75~5.25V", ifNot: "케이블이 데이터용인지, 다른 USB 포트인지 확인" }] },
        { title: "버튼 연결", action: "버튼을 꽂고 D2와 GND에 이어요.", place: ["SW1"], wires: [{ from: "U1.D2", to: "SW1.A", color: "#2e7bd6" }, { from: "U1.GND", to: "SW1.B", color: "#333333" }], check: "시리얼 모니터에 눌림이 찍히는지", cards: [] }
      ] };
    const badPin = await tool(token, "set_assembly_guide", { projectId: id, guide: { ...guide, steps: [{ ...guide.steps[1], wires: [{ from: "U1.D9", to: "SW1.A", color: "#2e7bd6" }] }] } });
    expect(badPin.isError).toBe(true);
    expect(badPin.content[0].text).toContain("U1.D9");
    const saved = await tool(token, "set_assembly_guide", { projectId: id, guide });
    expect(saved.isError).toBeFalsy();
    expect(saved.structuredContent!.assembly.steps[0].cards[0].id).toBe("s1-c1");

    await act({ action: "approve_mockup" });
    await tool(token, "set_team", { projectId: id, agents: ["hw"] });
    const entered = await act({ action: "enter_workshop" });
    expect(workflowFor(entered.project).phase).toBe("workshop");
    const reported = await act({ action: "assembly_report", step: 1, cardId: "s1-c1", text: "3.1V 나와요" });
    expect(reported.project.assemblyReports).toHaveLength(1);
    const state = await tool(token, "get_project", { projectId: id });
    expect(state.structuredContent!.phase).toBe("workshop");
    expect(state.structuredContent!.assemblyReports[0]).toMatchObject({ step: 1, cardId: "s1-c1", text: "3.1V 나와요" });
    expect(state.structuredContent!.recentMessages.at(-1).text).toContain("기대값: 4.75~5.25V");
    const reply = await tool(token, "log_team_turn", { projectId: id, channel: "hw", mode: "evaluate", userMessage: "3.1V 나와요", replies: [{ agent: "hw", text: "5V가 낮아요. 케이블과 포트를 바꿔 다시 재주세요." }], sharedSummary: "사용자 관측: 5V 핀 3.1V. 미검증: 원인" });
    expect(reply.isError).toBeFalsy();
    await tool(token, "record_assembly_result", { projectId: id, step: 1, cardId: "s1-c1", text: "케이블 바꾸니 5.0V" });
    expect((await tool(token, "get_project", { projectId: id })).structuredContent!.assemblyReports).toHaveLength(2);
  });
});

describe("operator privacy", () => {
  const operatorCookie = async () => `dalgeurak_session=${await signSession(Date.now() + 60_000, SECRET)}`;
  const operatorRequest = async (url: string, method = "GET") => new NextRequest(url, { method, headers: { cookie: await operatorCookie(), origin: "https://forge.example" } });

  it("hides participant projects from the operator", async () => {
    const { user, token } = await createUser("참여자 비공개", false);
    const created = await tool(token, "create_project", { idea: "운영자에게 보이면 안 되는 아이디어", plan });
    const id = created.structuredContent?.id as string;
    expect(await getProject(id)).not.toBeNull();
    const listed = await (await listRoute(await operatorRequest("http://localhost:3000/api/projects"))).json();
    expect(listed.projects.some((project: { id: string }) => project.id === id)).toBe(false);
    const file = await projectFile(await operatorRequest(`http://localhost:3000/api/projects/${id}/files/none`), { params: Promise.resolve({ id, fileId: "none" }) });
    expect(file.status).toBe(404);
    expect((await listProjects(user.id)).some((project) => project.id === id)).toBe(true);
  });

  it("erases a participant and everything they left", async () => {
    const { user, token } = await createUser("삭제 대상", false);
    const created = await tool(token, "create_project", { idea: "삭제될 아이디어", plan });
    const id = created.structuredContent?.id as string;
    const response = await deleteUserRoute(await operatorRequest(`http://localhost:3000/api/admin/users/${user.id}`, "DELETE"), { params: Promise.resolve({ id: user.id }) });
    expect(await response.json()).toEqual({ removedProjects: 1 });
    expect(await getProject(id)).toBeNull();
    expect((await listUsers()).some((item) => item.id === user.id)).toBe(false);
    expect((await rpc(token, "ping")).status).toBe(404);
  });

  it("refuses erasing without the operator session", async () => {
    const { user } = await createUser("보호 대상", false);
    const response = await deleteUserRoute(new NextRequest(`http://localhost:3000/api/admin/users/${user.id}`, { method: "DELETE", headers: { origin: "https://forge.example" } }), { params: Promise.resolve({ id: user.id }) });
    expect(response.status).toBe(403);
    expect((await listUsers()).some((item) => item.id === user.id)).toBe(true);
  });
});

describe("conversation privacy", () => {
  it("keeps connector conversations out of the record", async () => {
    const { user, token } = await createUser("대화 비공개", false);
    const made = await tool(token, "create_project", { idea: "버튼 램프", plan });
    const id = made.structuredContent!.id as string;
    await tool(token, "record_brainstorm", { projectId: id, userMessage: "저는 홍길동이고 010-1234-5678입니다", plan: { ...plan, reply: "홍길동님 안녕하세요", slotUpdates: [], tasks: [] } });
    await tool(token, "record_brainstorm", { projectId: id, plan: { ...plan, reply: "기록", slotUpdates: [], tasks: [] } });
    const raw = JSON.stringify(await listProjects(user.id));
    expect(raw).not.toContain("홍길동");
    expect(raw).not.toContain("010-1234-5678");
    const tools = (await rpc(token, "tools/list")).body.result.tools as Array<{ name: string; inputSchema: { required: string[]; properties: Record<string, unknown> } }>;
    for (const name of ["record_brainstorm", "log_team_turn"]) {
      const schema = tools.find((item) => item.name === name)!.inputSchema;
      expect(schema.required).not.toContain("userMessage");
      expect(schema.properties).not.toHaveProperty("userMessage");
    }
  });
});
