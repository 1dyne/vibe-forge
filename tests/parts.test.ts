import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { evaluateRules } from "../apps/web/lib/parts/rules";
import { judgeReading } from "../apps/web/lib/parts/trouble-cards";
import { buildFromSubmission } from "../apps/web/lib/build-pipeline";
import { PART_CARDS } from "../apps/web/lib/parts/catalog";
import { POST as mcpPost } from "../apps/web/app/api/mcp/[token]/route";
import { POST as workflowPost } from "../apps/web/app/api/projects/[id]/workflow/route";
import { createUser } from "../apps/web/lib/users";
import { userSessionValue } from "../apps/web/lib/session";
import type { CircuitComponent, CircuitNet } from "../apps/web/lib/project-types";

const SECRET = "test-secret-for-parts-routes-0123456789";
let folder: string;
const ids = (findings: Array<{ ruleId: string; severity: string }>, severity: string) => findings.filter((f) => f.severity === severity).map((f) => f.ruleId);
const c = (ref: string, catalogId: string, valueOrModel = catalogId, connection: CircuitComponent["connection"] = "breadboard"): CircuitComponent => ({ ref, type: "part", valueOrModel, reason: "test", connection, catalogId });

describe("rule engine on part cards", () => {
  it("FSR + resistor + UNO: passes on an analog pin, blocks on a digital-only pin", () => {
    const parts = [c("U1", "arduino-uno-r3", "Arduino UNO R3"), c("FSR1", "fsr-402"), c("R1", "resistor", "10kΩ")];
    const good: CircuitNet[] = [{ name: "5V", kind: "power", members: ["U1.5V", "FSR1.1"] }, { name: "GND", kind: "ground", members: ["U1.GND", "R1.2"] }, { name: "FSR_SIG", kind: "signal", members: ["U1.A0", "FSR1.2", "R1.1"] }];
    expect(ids(evaluateRules(parts, good, 5), "blocked")).toEqual([]);
    const bad = good.map((n) => n.name === "FSR_SIG" ? { ...n, members: ["U1.7", "FSR1.2", "R1.1"] } : n);
    const findings = evaluateRules(parts, bad, 5);
    expect(ids(findings, "blocked")).toContain("PIN_ROLE");
    expect(findings.find((f) => f.ruleId === "PIN_ROLE")!.message).toContain("아날로그");
  });

  it("servo + UNO: warns on board-powered motor, blocks over-voltage and missing GND", () => {
    const parts = [c("U1", "arduino-uno-r3"), c("M1", "sg90-servo")];
    const fromBoard: CircuitNet[] = [{ name: "5V", kind: "power", members: ["U1.5V", "M1.V+"] }, { name: "GND", kind: "ground", members: ["U1.GND", "M1.GND"] }, { name: "PWM", kind: "signal", members: ["U1.9", "M1.PWM"] }];
    const f1 = evaluateRules(parts, fromBoard, 5);
    expect(ids(f1, "warning")).toContain("MOTOR_ON_BOARD_POWER");
    expect(ids(f1, "blocked")).toEqual([]);
    const nine: CircuitNet[] = [{ name: "VBAT_9V", kind: "power", members: ["BAT.+", "M1.V+"] }, { name: "GND", kind: "ground", members: ["U1.GND"] }, { name: "PWM", kind: "signal", members: ["U1.9", "M1.PWM"] }];
    const f2 = evaluateRules([...parts, { ref: "BAT", type: "power", valueOrModel: "9V 건전지", reason: "", connection: "breadboard" }], nine, 9);
    expect(ids(f2, "blocked")).toEqual(expect.arrayContaining(["SUPPLY_OVER", "GND_MISSING"]));
    expect(ids(f2, "warning")).toContain("CARD_MISSING");
  });

  it("I2C OLED: address overlap, duplicate pins and an LED without its resistor", () => {
    const parts = [c("U1", "esp32-devkit-v1"), c("D1", "ssd1306-oled-128x64"), c("D2", "ssd1306-oled-128x64"), c("LED1", "led-5mm")];
    const nets: CircuitNet[] = [
      { name: "3V3", kind: "power", members: ["U1.3V3", "D1.VIN", "D2.VIN"] },
      { name: "GND", kind: "ground", members: ["U1.GND.1", "D1.GND", "D2.GND", "LED1.C"] },
      { name: "SDA", kind: "signal", members: ["U1.D21", "D1.DATA", "D2.DATA"] },
      { name: "SCL", kind: "signal", members: ["U1.D22", "D1.CLK", "D2.CLK"] },
      { name: "LED", kind: "signal", members: ["U1.D21", "LED1.A"] }
    ];
    const findings = evaluateRules(parts, nets, 3.3);
    expect(ids(findings, "warning")).toContain("I2C_ADDRESS");
    expect(ids(findings, "blocked")).toEqual(expect.arrayContaining(["PIN_DUPLICATE", "LED_RESISTOR"]));
    expect(ids(findings, "info")).toContain("CARD_UNKNOWN_SPEC");
  });

  it("judges readings only against sourced ranges", () => {
    expect(judgeReading({ kind: "number", min: 4.75, max: 5.25, unit: "V" }, 4.1, null)).toBe("abnormal");
    expect(judgeReading({ kind: "number", min: 4.75, max: 5.25, unit: "V" }, 5.02, null)).toBe("normal");
    expect(judgeReading(null, 3.3, null)).toBe("unknown");
    expect(judgeReading({ kind: "boolean", expect: "삐" }, null, false)).toBe("abnormal");
  });

  it("every card value is sourced or left unknown, and Wokwi parts carry pin positions", () => {
    for (const card of PART_CARDS) {
      if (card.verifiedAt) expect(card.sourceUrls.length, card.id).toBeGreaterThan(0);
      if (card.renderer.type === "wokwi") expect(card.pins.every((p) => p.xMm != null), card.id).toBe(true);
    }
    expect(PART_CARDS.find((c) => c.id === "nucode-nu40-dk")!.logicVoltage).toBeNull();
  });

  it("writes Python for Raspberry Pi and MicroPython for Pico instead of .ino", () => {
    const seed = { title: "t", board: "Raspberry Pi 4 Model B", supplyVoltage: 5, sensor: "버튼", actuator: "없음", camera: "없음", enclosure: { widthMm: 90, depthMm: 60, heightMm: 30, wallMm: 2 }, behavior: "버튼", pinAssignments: [{ symbol: "BUTTON", pin: 17, role: "digital_input" }], loopSteps: ["읽기"], assumptions: [], humanChecks: [] };
    const review = { summary: "s", hwVerdict: "unknown", hwFinding: "", measurement: "", swVerdict: "unknown", swFinding: "", firmwareRun: "" };
    const pi = buildFromSubmission(seed, review);
    expect(pi.blueprint.firmware.platform).toBe("linux");
    expect(pi.artifacts.find((a) => a.kind === "firmware")!.filename).toBe("main.py");
    expect(pi.artifacts.find((a) => a.kind === "firmware")!.content).toContain("from gpiozero import");
    const pico = buildFromSubmission({ ...seed, board: "Raspberry Pi Pico" }, review);
    expect(pico.blueprint.firmware.platform).toBe("micropython");
    expect(pico.artifacts.find((a) => a.kind === "firmware")!.content).toContain("Pin.PULL_UP");
    expect(buildFromSubmission({ ...seed, board: "Raspberry Pi Pico", platform: "arduino" }, review).artifacts.find((a) => a.kind === "firmware")!.filename).toBe("dalgeurak_firmware.ino");
  });
});

describe("assembly guide on real parts", () => {
  beforeAll(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "forge-parts-test-"));
    vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
    vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("APP_BASE_URL", "https://forge.example");
  });
  afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });

  it("attaches sourced trouble cards, guards finer steps, goes stale on circuit change, and resets", async () => {
    const { user, token } = await createUser("부품 테스트", false);
    let n = 0;
    const tool = async (name: string, args: Record<string, unknown>) => (await (await mcpPost(new NextRequest(`http://localhost/api/mcp/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }) }), { params: Promise.resolve({ token }) })).json()).result as { content: Array<{ text: string }>; structuredContent?: Record<string, any>; isError?: boolean };
    const plan = { projectName: "압력 램프", oneLiner: "누르면 밝아지는 램프", reply: "좋아요", slotUpdates: [], tasks: [] };
    const id = (await tool("create_project", { idea: "누르는 힘으로 LED 밝기가 바뀌는 램프", plan })).structuredContent!.id as string;
    await tool("set_maker_profile", { projectId: id, coreBehavior: "세게 누르면 LED가 밝아진다", tools: [], toolsConfirmed: true, firmwareExperience: "none", solderingSkill: "none" });
    await tool("set_product_form", { projectId: id, form: { summary: "원통형", answers: [{ question: "크기", answer: "손바닥" }], shape: [{ name: "몸통", primitive: "cylinder", size: [80, 80, 60], position: [0, 0, 0] }], features: [{ name: "USB 포트", kind: "port", facing: "back", position: [0, -40, 10], size: [12, 6], linkedRef: "U1" }], internals: [{ ref: "U1", label: "UNO", size: [68.6, 53.4, 15], position: [0, 0, 2] }], material: "PLA" } }).then((r) => expect(r.content[0].text).toContain("U1의 back 면과 맞지 않아요"));
    const cards = await tool("find_part_cards", { query: "FSR" });
    expect(cards.structuredContent!.cards[0].id).toBe("fsr-402");
    await tool("set_build_plan", { projectId: id, plan: { track: "hardware", summary: "UNO+FSR", board: { choice: "arduino", model: "Arduino UNO R3", why: "입문", alternatives: "피코", catalogId: "arduino-uno-r3" }, connection: { method: "breadboard", why: "연습" }, io: { inputs: ["압력"], outputs: ["LED"], wireless: "none" }, preBuyChecks: [{ item: "동작 전압", status: "confirmed", source: "https://store.arduino.cc/products/arduino-uno-rev3" }, { item: "FSR 커넥터", status: "unknown", source: "" }], modules: [{ function: "감지", part: "FSR 402", why: "압력", connection: "브레드보드", whereToBuy: "디바이스마트", searchKeyword: "FSR 402", estPriceKRW: 9000, difficulty: "보통" }], structure: [{ name: "입력", role: "FSR", connectsTo: "A0" }], stages: [{ title: "1", goal: "g", learn: "l", practice: "p", doneWhen: "d", parts: [] }], prerequisites: [], cost: { options: [], marginNote: "" }, fabrication: { needs3DPrint: false, plan: "상자" }, risks: [] } });
    const blueprint = { title: "압력 램프", board: "Arduino UNO R3", supplyVoltage: 5, sensor: "FSR 402", actuator: "LED", camera: "없음", enclosure: { widthMm: 70, depthMm: 60, heightMm: 30, wallMm: 2 }, behavior: "압력에 비례해 LED 밝기", pinAssignments: [{ symbol: "FSR", pin: 0, role: "analog_input" }, { symbol: "LED", pin: 9, role: "pwm_output" }], loopSteps: ["읽기"], assumptions: [], humanChecks: [],
      components: [c("U1", "arduino-uno-r3", "Arduino UNO R3"), c("FSR1", "fsr-402", "FSR 402"), c("R1", "resistor", "10kΩ"), c("LED1", "led-5mm", "LED 5mm 빨강"), c("R2", "resistor", "220Ω")],
      nets: [{ name: "5V", kind: "power", members: ["U1.5V", "FSR1.1"] }, { name: "GND", kind: "ground", members: ["U1.GND.1", "R1.2", "LED1.C"] }, { name: "FSR_SIG", kind: "signal", members: ["U1.A0", "FSR1.2", "R1.1"] }, { name: "LED_PWM", kind: "signal", members: ["U1.9", "R2.1"] }, { name: "LED_A", kind: "signal", members: ["R2.2", "LED1.A"] }] };
    const review = { summary: "s", hwVerdict: "unknown", hwFinding: "", measurement: "", swVerdict: "unknown", swFinding: "", firmwareRun: "" };
    const circuit = await tool("submit_circuit", { projectId: id, blueprint, review });
    expect(circuit.structuredContent!.blockedChecks).toEqual([]);

    const guide = { stage: "1단계", base: { name: "하프 브레드보드", kind: "breadboard", width: 82, height: 55 },
      parts: [{ ref: "U1", label: "UNO", x: 2, y: 2, width: 72, height: 53, catalogId: "arduino-uno-r3" }, { ref: "FSR1", label: "FSR", x: 60, y: 30, width: 18, height: 30, pins: [{ name: "1", x: 4, y: 28 }, { name: "2", x: 12, y: 28 }] }, { ref: "R1", label: "10k", x: 40, y: 40, width: 15.6, height: 3, catalogId: "resistor" }],
      steps: [
        { title: "보드", action: "UNO를 놓아요", place: ["U1"], wires: [], check: "전원 LED", cards: [] },
        { title: "FSR 분압", action: "FSR과 10kΩ을 A0에 이어요", place: ["FSR1", "R1"], wires: [{ from: "U1.A0", to: "FSR1.2", color: "#2e7bd6" }, { from: "U1.5V", to: "FSR1.1", color: "#2e7bd6" }], check: "시리얼 값 변화", cards: [] }
      ] };
    const badWire = await tool("set_assembly_guide", { projectId: id, guide: { ...guide, steps: [guide.steps[0], { ...guide.steps[1], wires: [{ from: "U1.A1", to: "FSR1.2", color: "#2e7bd6" }] }] } });
    expect(badWire.isError).toBe(true);
    expect(badWire.content[0].text).toContain("회로에 없는 연결");
    const saved = await tool("set_assembly_guide", { projectId: id, guide });
    expect(saved.isError).toBeFalsy();
    const state = saved.structuredContent!;
    const step1 = state.assemblyLibraryCards.find((s: { step: number }) => s.step === 1).cards.map((c: { id: string }) => c.id);
    expect(step1).toEqual(expect.arrayContaining(["lib:usb-5v-rail", "lib:upload-fails"]));
    const step2 = state.assemblyLibraryCards.find((s: { step: number }) => s.step === 2).cards;
    expect(step2.find((c: { id: string }) => c.id === "lib:resistor-value").expected).toMatchObject({ kind: "number", min: 9500, max: 10500, unit: "Ω" });
    expect(step2.map((c: { id: string }) => c.id)).toContain("lib:fsr-standoff");
    expect(saved.content[0].text).toContain("대체 표시되는 부품: FSR1");
    const lengths = state.assembly.steps[1].wireLengths;
    expect(lengths.length).toBe(2);

    const sub = (over: Record<string, unknown>) => ({ action: "FSR 다리를 브레드보드에 꽂아요", materials: [], tools: [], repeatCount: 1, targetRefs: ["FSR1"], targetPins: ["FSR1.2"], caution: "", doneWhen: "흔들리지 않아요", checkMethod: "", ...over });
    expect((await tool("expand_assembly_step", { projectId: id, step: 2, level: "beginner", substeps: [sub({ targetPins: ["U1.A3"] })] })).content[0].text).toContain("U1.A3");
    expect((await tool("expand_assembly_step", { projectId: id, step: 2, level: "beginner", substeps: [sub({ materials: ["4.7kΩ 저항"] })] })).content[0].text).toContain("회로에 없는 값");
    expect((await tool("expand_assembly_step", { projectId: id, step: 2, level: "beginner", substeps: [sub({ action: "선을 37cm로 잘라요" })] })).content[0].text).toContain("지어내지 말고");
    const good = await tool("expand_assembly_step", { projectId: id, step: 2, level: "micro", substeps: [sub({ action: `선을 ${lengths[0].suggestedMm}mm로 잘라요`, materials: ["10kΩ 저항"], repeatCount: 2 }), sub({ action: "FSR 단자에 납땜해요", targetPins: [] })] });
    expect(good.isError).toBeFalsy();
    expect(good.structuredContent!.assemblyDetails[0]).toMatchObject({ step: 2, level: "micro", stale: false, substeps: 2 });

    const cookie = "dalgeurak_session=" + userSessionValue(token);
    const act = async (body: unknown) => (await workflowPost(new NextRequest(`http://localhost:3000/api/projects/${id}/workflow`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })).json();
    const reported = await act({ action: "assembly_report", step: 1, cardId: "lib:usb-5v-rail", text: "4.1V", value: 4.1 });
    expect(reported.project.assemblyReports.at(-1)).toMatchObject({ cardId: "lib:usb-5v-rail", judgement: "abnormal" });
    expect(reported.project.messages.at(-1).text).toContain("4.75~5.25V");
    const requested = await act({ action: "detail_request", step: 1, level: "beginner" });
    expect(requested.project.assemblyRequests.at(-1)).toMatchObject({ step: 1, doneAt: null });

    // Same data seen by Claude, then a circuit change makes the finer steps stale.
    const viaClaude = await tool("get_project", { projectId: id });
    expect(viaClaude.structuredContent!.pendingRequests).toHaveLength(1);
    await tool("submit_circuit", { projectId: id, blueprint: { ...blueprint, components: blueprint.components.map((x) => x.ref === "R1" ? { ...x, valueOrModel: "4.7kΩ" } : x) }, review });
    expect((await tool("get_project", { projectId: id })).structuredContent!.assemblyDetails[0].stale).toBe(true);

    await tool("report_progress", { projectId: id, title: "조립 가이드 고치는 중", plan: [{ label: "저항값 반영", status: "doing" }, { label: "문제 카드 확인", status: "todo" }], thinking: "4.7kΩ으로 바뀌어 분압 범위가 달라져요." });
    const live = (await tool("get_project", { projectId: id })).structuredContent!;
    expect(live.liveStatus).toMatchObject({ title: "조립 가이드 고치는 중" });

    const reset = await tool("reset_project_stage", { projectId: id, stage: "product_form" });
    expect(reset.structuredContent!).toMatchObject({ phase: "brainstorm", productForm: null, assembly: null, circuit: null });
    expect(reset.structuredContent!.buildPlan).not.toBeNull();
  });

  it("adds one-time setup cost to the budget and judges the timeline against skill", async () => {
    const { token } = await createUser("기간 테스트", false);
    let n = 100;
    const tool = async (name: string, args: Record<string, unknown>) => (await (await mcpPost(new NextRequest(`http://localhost/api/mcp/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }) }), { params: Promise.resolve({ token }) })).json()).result as { content: Array<{ text: string }>; structuredContent?: Record<string, any>; isError?: boolean };
    const id = (await tool("create_project", { idea: "말하면 반응하는 로봇", plan: { projectName: "로봇", oneLiner: "o", reply: "r", slotUpdates: [], tasks: [] } })).structuredContent!.id as string;
    const profile = await tool("set_maker_profile", { projectId: id, coreBehavior: "말하면 눈을 깜빡인다", tools: [], toolsConfirmed: true, firmwareExperience: "none", budgetKRW: 50000, timelineWeeks: 1, travelRange: "transit30" });
    expect(profile.structuredContent!.profile).toMatchObject({ timelineWeeks: 1, travelRange: "transit30" });
    const planned = await tool("set_build_plan", { projectId: id, plan: { track: "hardware", summary: "s", board: { choice: "esp32", model: "ESP32 DevKit V1", why: "w", alternatives: "a" }, connection: { method: "breadboard", why: "w" }, modules: [{ function: "f", part: "p", why: "w", connection: "c", whereToBuy: "w", searchKeyword: "k", estPriceKRW: 30000, difficulty: "보통" }], setupItems: [{ item: "멀티미터", why: "측정", estPriceKRW: 15000 }, { item: "브레드보드·점퍼선", why: "연습", estPriceKRW: 8000 }], timeline: { stages: [{ title: "업로드 익히기", weeks: 1 }, { title: "마이크·화면", weeks: 2 }, { title: "외형", weeks: 1 }], reason: "펌웨어가 처음이라 업로드와 부품 하나씩 시험이 먼저예요." }, structure: [{ name: "n", role: "r", connectsTo: "c" }], stages: [{ title: "t", goal: "g", learn: "l", practice: "p", doneWhen: "d", parts: [] }], prerequisites: [], cost: { options: [], marginNote: "" }, fabrication: { needs3DPrint: false, plan: "p" }, risks: [] } });
    const plan = planned.structuredContent!.buildPlan;
    expect(plan.cost).toMatchObject({ partsKRW: 30000, setupKRW: 23000, totalKRW: 53000, verdict: "over" });
    expect(plan.timeline).toMatchObject({ totalWeeks: 4, targetWeeks: 1, feasibility: "unlikely" });
    expect(planned.content[0].text).toContain("개발 환경 세팅 23,000원");
    expect(planned.content[0].text).toContain("달성 가능성이 낮아요");
    const guide = await tool("dalgeurak_guide", {});
    expect(guide.content[0].text).toContain("현재 서버 도구");
    expect(guide.content[0].text).toContain("이동 가능 범위");
  });
});
