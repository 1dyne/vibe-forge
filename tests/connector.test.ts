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
import { signSession } from "../apps/web/lib/session";

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
    expect((await listAs(await cookieFor())).map((p) => p.id)).toContain(id);

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
});
