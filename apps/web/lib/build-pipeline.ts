import { randomUUID } from "node:crypto";
import { AnthropicModelAdapter } from "@dalgeurak/agents";
import { calculateModelCost } from "@dalgeurak/domain";
import { z } from "zod";
import { withLocalCostReservation } from "./local-cost-ledger";
import type { BuildBlueprint, BuildResult, EvaluatorReport, LocalProject, PinAssignment, ProjectArtifact, RuleCheck } from "./project-types";

const Verdict = z.enum(["pass", "fail", "unknown"]);
const BlueprintSeedSchema = z.object({
  title: z.string().min(1).max(100),
  board: z.string().min(1).max(80),
  supplyVoltage: z.number().min(1).max(24),
  sensor: z.string().min(1).max(80),
  actuator: z.string().min(1).max(80),
  camera: z.string().min(1).max(80),
  enclosure: z.object({ widthMm: z.number().min(20).max(300), depthMm: z.number().min(20).max(300), heightMm: z.number().min(15).max(300), wallMm: z.number().min(1.2).max(6) }).strict(),
  behavior: z.string().min(1).max(300),
  pinAssignments: z.array(z.object({ symbol: z.string(), pin: z.number().int().min(0).max(39), role: z.enum(["digital_input", "analog_input", "digital_output", "pwm_output", "servo"]) }).strict()).max(6),
  loopSteps: z.array(z.string().min(1).max(120)).min(1).max(4),
  assumptions: z.array(z.string().min(1).max(160)).max(4),
  humanChecks: z.array(z.string().min(1).max(200)).max(4)
}).strict();
// Keep the compile-time contract explicit. The web app and the workspace use
// different Zod compiler settings, which can otherwise make parsed properties
// appear optional during a Next production build.
type BlueprintSeed = {
  title: string;
  board: string;
  supplyVoltage: number;
  sensor: string;
  actuator: string;
  camera: string;
  enclosure: { widthMm: number; depthMm: number; heightMm: number; wallMm: number };
  behavior: string;
  pinAssignments: PinAssignment[];
  loopSteps: string[];
  assumptions: string[];
  humanChecks: string[];
};

const EvaluatorCompactSchema = z.object({
  summary: z.string().min(1).max(160),
  hwVerdict: Verdict,
  hwFinding: z.string().max(160),
  measurement: z.string().max(200),
  swVerdict: Verdict,
  swFinding: z.string().max(160),
  firmwareRun: z.string().max(200)
}).strict();

const blueprintJsonSchema = {
  type: "object", additionalProperties: false,
  required: ["title", "board", "supplyVoltage", "sensor", "actuator", "camera", "enclosure", "behavior", "pinAssignments", "loopSteps", "assumptions", "humanChecks"],
  properties: {
    title: { type: "string" }, board: { type: "string" }, supplyVoltage: { type: "number" },
    sensor: { type: "string" }, actuator: { type: "string" }, camera: { type: "string" },
    enclosure: { type: "object", additionalProperties: false, required: ["widthMm", "depthMm", "heightMm", "wallMm"], properties: { widthMm: { type: "number" }, depthMm: { type: "number" }, heightMm: { type: "number" }, wallMm: { type: "number" } } },
    behavior: { type: "string" },
    pinAssignments: { type: "array", items: { type: "object", additionalProperties: false, required: ["symbol", "pin", "role"], properties: { symbol: { type: "string" }, pin: { type: "integer" }, role: { type: "string", enum: ["digital_input", "analog_input", "digital_output", "pwm_output", "servo"] } } } },
    loopSteps: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } }, humanChecks: { type: "array", items: { type: "string" } }
  }
} as const;

function expandBlueprint(seed: BlueprintSeed): BuildBlueprint {
  const components = [
    { ref: "U1", type: "controller", valueOrModel: seed.board, reason: "제어와 Arduino 펌웨어 실행" },
    { ref: "S1", type: "sensor", valueOrModel: seed.sensor, reason: "사용자 또는 환경 입력" },
    { ref: "A1", type: "actuator", valueOrModel: seed.actuator, reason: "반응과 움직임 출력" },
    { ref: "CAM1", type: "camera", valueOrModel: seed.camera, reason: "촬영 기능 목업" },
    { ref: "LED1", type: "indicator", valueOrModel: "status LED with 220ohm resistor", reason: "상태 표시" },
    { ref: "PS1", type: "power", valueOrModel: `${seed.supplyVoltage}V regulated supply`, reason: "저전압 전원 공급" }
  ].filter((component) => !["S1", "A1", "CAM1"].includes(component.ref) || !/^(없음|none|not required|n\/a)$/i.test(component.valueOrModel.trim()));
  const powered = components.map((item) => item.ref);
  const targetRef = (symbol: string) => /CAM/i.test(symbol) ? "CAM1" : /SERVO|MOTOR|ACT/i.test(symbol) ? "A1" : /LED/i.test(symbol) ? "LED1" : "S1";
  const signalNets = seed.pinAssignments.map((pin, index) => ({ name: `SIG_${index + 1}_${pin.symbol}`, kind: "signal" as const, members: [`U1.${pin.role === "analog_input" ? `A${pin.pin}` : `GPIO${pin.pin}`}`, `${targetRef(pin.symbol)}.SIG`] }));
  return {
    title: seed.title,
    board: seed.board,
    supplyVoltage: seed.supplyVoltage,
    components,
    nets: [
      { name: `VCC_${seed.supplyVoltage}V`, kind: "power", members: ["PS1.OUT", ...powered.filter((ref) => ref !== "PS1").map((ref) => `${ref}.VCC`)] },
      { name: "GND", kind: "ground", members: powered.map((ref) => `${ref}.GND`) },
      ...signalNets
    ],
    enclosure: seed.enclosure,
    firmware: { platform: "arduino", behavior: seed.behavior, pinAssignments: seed.pinAssignments, loopSteps: seed.loopSteps },
    assumptions: seed.assumptions,
    humanChecks: seed.humanChecks
  };
}

export function normalizeBlueprintWiring(blueprint: BuildBlueprint): BuildBlueprint {
  const pins = blueprint.firmware.pinAssignments;
  const needsStatusLed = pins.some((pin) => /LED/i.test(pin.symbol));
  const usesFsr = blueprint.components.some((item) => /FSR|force.sens/i.test(item.valueOrModel));
  const usesServo = blueprint.components.some((item) => /servo|SG90/i.test(item.valueOrModel));
  const needsCameraBoundary = blueprint.components.some((item) => item.ref === "CAM1" && /OV2640|ESP32-CAM/i.test(item.valueOrModel)) && blueprint.supplyVoltage > 3.3;
  const components = [...blueprint.components];
  const ensureComponent = (component: BuildBlueprint["components"][number]) => {
    if (!components.some((item) => item.ref === component.ref)) components.push(component);
  };
  if (needsStatusLed) ensureComponent({ ref: "LED1", type: "indicator", valueOrModel: "status LED with 220ohm resistor", reason: "상태 표시" });
  if (usesFsr) ensureComponent({ ref: "R1", type: "resistor", valueOrModel: "10kohm, FSR divider", reason: "FSR 저항 변화를 A0 전압으로 변환" });
  if (usesServo) ensureComponent({ ref: "C1", type: "capacitor", valueOrModel: "1000uF 10V electrolytic", reason: "서보 돌입전류로 인한 전압 강하 완화" });
  if (needsCameraBoundary) {
    ensureComponent({ ref: "REG1", type: "regulator", valueOrModel: "5V to 3.3V regulator, >=600mA", reason: "카메라 전원 도메인 분리" });
    ensureComponent({ ref: "LS1", type: "level_shifter", valueOrModel: "5V to 3.3V logic level shifter", reason: "Nano 트리거 신호를 카메라 입력 전압으로 변환" });
  }
  const targetRef = (symbol: string) => /CAM/i.test(symbol) ? "CAM1" : /SERVO|MOTOR|ACT/i.test(symbol) ? "A1" : /LED/i.test(symbol) ? "LED1" : "S1";
  const signalNets = pins.flatMap((pin, index) => needsCameraBoundary && /CAM/i.test(pin.symbol) ? [
    { name: `SIG_${index + 1}_${pin.symbol}_5V`, kind: "signal" as const, members: [`U1.GPIO${pin.pin}`, "LS1.HV_IN"] },
    { name: `SIG_${index + 1}_${pin.symbol}_3V3`, kind: "signal" as const, members: ["LS1.LV_OUT", "CAM1.TRIG"] }
  ] : [{
    name: `SIG_${index + 1}_${pin.symbol}`,
    kind: "signal" as const,
    members: [
      `U1.${pin.role === "analog_input" ? `A${pin.pin}` : `GPIO${pin.pin}`}`,
      ...(usesFsr && /FSR/i.test(pin.symbol) ? ["S1.OUT", "R1.1"] : []),
      `${targetRef(pin.symbol)}.${/SERVO_L/i.test(pin.symbol) ? "SIG_L" : /SERVO_R/i.test(pin.symbol) ? "SIG_R" : /CAM/i.test(pin.symbol) ? "TRIG" : /LED/i.test(pin.symbol) ? "A" : usesFsr && /FSR/i.test(pin.symbol) ? "OUT" : "SIG"}`
    ].filter((member, memberIndex, members) => members.indexOf(member) === memberIndex)
  }]);
  const fiveVoltMembers = ["PS1.OUT", "U1.VCC", "S1.VCC", "A1.VCC", ...(usesServo ? ["C1.POS"] : []), ...(needsCameraBoundary ? ["REG1.IN", "LS1.HV_REF"] : ["CAM1.VCC"])];
  const groundMembers = ["PS1.GND", "U1.GND", ...(!usesFsr ? ["S1.GND"] : []), "A1.GND", "CAM1.GND", ...(needsStatusLed ? ["LED1.GND"] : []), ...(usesFsr ? ["R1.2"] : []), ...(usesServo ? ["C1.NEG"] : []), ...(needsCameraBoundary ? ["REG1.GND", "LS1.GND"] : [])];
  return {
    ...blueprint,
    components,
    nets: [
      { name: `VCC_${blueprint.supplyVoltage}V`, kind: "power", members: fiveVoltMembers.filter((member) => components.some((c) => c.ref === member.split(".")[0])) },
      ...(needsCameraBoundary ? [{ name: "VCC_3V3_CAMERA", kind: "power" as const, members: ["REG1.OUT", "CAM1.VCC", "LS1.LV_REF"] }] : []),
      { name: "GND", kind: "ground", members: groundMembers.filter((member) => components.some((c) => c.ref === member.split(".")[0])) },
      ...signalNets
    ]
  };
}

const evaluatorJsonSchema = {
  type: "object", additionalProperties: false, required: ["summary", "hwVerdict", "hwFinding", "measurement", "swVerdict", "swFinding", "firmwareRun"],
  properties: {
    summary: { type: "string", maxLength: 160 },
    hwVerdict: { type: "string", enum: ["pass", "fail", "unknown"] }, hwFinding: { type: "string", maxLength: 160 }, measurement: { type: "string", maxLength: 200 },
    swVerdict: { type: "string", enum: ["pass", "fail", "unknown"] }, swFinding: { type: "string", maxLength: 160 }, firmwareRun: { type: "string", maxLength: 200 }
  }
} as const;

function deterministicChecks(blueprint: BuildBlueprint): RuleCheck[] {
  const checks: RuleCheck[] = [];
  checks.push({ id: "SUPPLY_RANGE", verdict: blueprint.supplyVoltage >= 3.3 && blueprint.supplyVoltage <= 12 ? "pass" : "fail", message: `제안 전원 ${blueprint.supplyVoltage}V가 MVP 허용 범위 3.3~12V에 ${blueprint.supplyVoltage >= 3.3 && blueprint.supplyVoltage <= 12 ? "있습니다" : "없습니다"}.` });
  checks.push({ id: "POWER_NET", verdict: blueprint.nets.some((net) => net.kind === "power") ? "pass" : "fail", message: "전원 net 존재 여부를 확인했습니다." });
  checks.push({ id: "GROUND_NET", verdict: blueprint.nets.some((net) => net.kind === "ground") ? "pass" : "fail", message: "공통 GND net 존재 여부를 확인했습니다." });
  const pins = blueprint.firmware.pinAssignments.map((item) => item.pin);
  checks.push({ id: "PIN_COLLISION", verdict: new Set(pins).size === pins.length ? "pass" : "fail", message: "펌웨어 핀 중복을 확인했습니다." });
  checks.push({ id: "ENCLOSURE_WALL", verdict: blueprint.enclosure.wallMm >= 1.2 ? "pass" : "fail", message: `하우징 벽 두께 ${blueprint.enclosure.wallMm}mm를 확인했습니다.` });
  const refs = blueprint.components.map((item) => item.ref);
  checks.push({ id: "COMPONENT_REF_UNIQUE", verdict: new Set(refs).size === refs.length ? "pass" : "fail", message: "회로 부품 참조 번호 중복을 확인했습니다." });
  const knownRefs = new Set(refs);
  const unknownSignalRefs = blueprint.nets
    .filter((net) => net.kind === "signal")
    .flatMap((net) => net.members)
    .map((member) => member.split(".")[0])
    .filter((ref) => !knownRefs.has(ref));
  checks.push({ id: "SIGNAL_TARGET", verdict: unknownSignalRefs.length === 0 ? "pass" : "fail", message: unknownSignalRefs.length === 0 ? "모든 신호선의 대상 부품 참조가 존재합니다." : `존재하지 않는 신호 대상이 있습니다: ${[...new Set(unknownSignalRefs)].join(", ")}` });
  const cameraNeedsVerification = /OV2640|ESP32-CAM/i.test(blueprint.components.find((item) => item.ref === "CAM1")?.valueOrModel ?? "") && blueprint.supplyVoltage > 3.3;
  checks.push({ id: "CAMERA_VOLTAGE_DOMAIN", verdict: cameraNeedsVerification ? "unknown" : "pass", message: cameraNeedsVerification ? "카메라 모듈의 3.3V/5V 입력 경계와 레귤레이터 유무를 데이터시트에서 확인해야 합니다." : "카메라 전압 도메인에 알려진 추가 확인 항목이 없습니다." });
  return checks;
}

function firmwareChecks(firmware: string, blueprint: BuildBlueprint): RuleCheck[] {
  let depth = 0;
  let invalid = false;
  for (const character of firmware) {
    if (character === "{") depth++;
    if (character === "}") depth--;
    if (depth < 0) invalid = true;
  }
  const structurePass = !invalid && depth === 0 && firmware.includes("void setup()") && firmware.includes("void loop()");
  const checks: RuleCheck[] = [{ id: "FIRMWARE_STRUCTURE", verdict: structurePass ? "pass" : "fail", message: structurePass ? "setup/loop과 중괄호 구조가 완결됐습니다. 실제 Arduino 컴파일은 아직 필요합니다." : "펌웨어 기본 구조가 완결되지 않았습니다." }];
  const hasAnalog = blueprint.firmware.pinAssignments.some((pin) => pin.role === "analog_input");
  checks.push({ id: "ANALOG_PIN_LABEL", verdict: !hasAnalog || /const int PIN_[A-Z0-9_]+ = A\d+;/.test(firmware) ? "pass" : "fail", message: "Arduino 아날로그 핀을 A0 형식으로 명시했는지 확인했습니다." });
  const hasCameraTrigger = blueprint.firmware.pinAssignments.some((pin) => /CAM/i.test(pin.symbol));
  checks.push({ id: "CAMERA_PULSE_STATE", verdict: !hasCameraTrigger || (firmware.includes("cameraPulseActive") && firmware.includes("cameraPulseStartedMs")) ? "pass" : "fail", message: "카메라 트리거가 명시적 상태와 시작 시각으로 펄스폭을 제어하는지 확인했습니다." });
  const servoCount = blueprint.firmware.pinAssignments.filter((pin) => pin.role === "servo").length;
  checks.push({ id: "SERVO_PAIR_DIRECTION", verdict: servoCount < 2 || firmware.includes("180 - currentServoAngle") ? "pass" : "fail", message: "마주 보는 좌우 서보의 기본 회전 방향을 반대로 지정했는지 확인했습니다. 실물 조립 후 각도 보정은 필요합니다." });
  return checks;
}

function scadChecks(scad: string, blueprint: BuildBlueprint): RuleCheck[] {
  let depth = 0;
  let invalid = false;
  for (const character of scad) {
    if (character === "{") depth++;
    if (character === "}") depth--;
    if (depth < 0) invalid = true;
  }
  const structurePass = !invalid && depth === 0 && scad.includes("difference()") && scad.includes("cube(");
  const { widthMm, depthMm, heightMm, wallMm } = blueprint.enclosure;
  const dimensionsPass = [widthMm, depthMm, heightMm, wallMm].every(Number.isFinite)
    && widthMm > wallMm * 2 && depthMm > wallMm * 2 && heightMm > wallMm;
  return [
    { id: "SCAD_STRUCTURE", verdict: structurePass ? "pass" : "fail", message: structurePass ? "OpenSCAD 블록과 기본 형상 구조가 완결됐습니다." : "OpenSCAD 블록 또는 기본 형상 구조가 완결되지 않았습니다." },
    { id: "SCAD_DIMENSIONS", verdict: dimensionsPass ? "pass" : "fail", message: dimensionsPass ? `외형 ${widthMm}×${depthMm}×${heightMm}mm와 벽 ${wallMm}mm로 양의 내부 공간이 있습니다.` : "하우징 치수로 유효한 내부 공간을 만들 수 없습니다." }
  ];
}

function buildStatus(checks: RuleCheck[], evaluator: EvaluatorReport): BuildResult["status"] {
  return checks.every((check) => check.verdict === "pass") && evaluator.hw.verdict === "pass" && evaluator.sw.verdict === "pass" ? "ready" : "needs_input";
}

function identifier(value: string) {
  const normalized = value.replace(/[^A-Za-z0-9_]/g, "_").replace(/^([0-9])/, "_$1");
  return normalized || "SIGNAL";
}

function generateFirmware(blueprint: BuildBlueprint): string {
  const pins = blueprint.firmware.pinAssignments;
  const servos = pins.filter((item) => item.role === "servo");
  const inputs = pins.filter((item) => item.role === "digital_input" || item.role === "analog_input");
  const outputs = pins.filter((item) => ["digital_output", "pwm_output"].includes(item.role));
  const lines = [
    "// Generated by 달그락 대장간. Verify wiring before applying power.",
    `// Target: ${blueprint.board}`,
    `// Behavior: ${blueprint.firmware.behavior}`,
    ...(servos.length ? ["#include <Servo.h>"] : []),
    ""
  ];
  for (const pin of pins) lines.push(`const int PIN_${identifier(pin.symbol).toUpperCase()} = ${pin.role === "analog_input" ? `A${pin.pin}` : pin.pin};`);
  for (const servo of servos) lines.push(`Servo servo_${identifier(servo.symbol)};`);
  lines.push("", "void setup() {", "  Serial.begin(115200);");
  for (const pin of pins) {
    const name = `PIN_${identifier(pin.symbol).toUpperCase()}`;
    if (pin.role === "digital_input") lines.push(`  pinMode(${name}, INPUT_PULLUP);`);
    if (pin.role === "digital_output" || pin.role === "pwm_output") lines.push(`  pinMode(${name}, OUTPUT);`);
    if (pin.role === "servo") lines.push(`  servo_${identifier(pin.symbol)}.attach(${name});`);
  }
  lines.push("}", "", "bool gripping = false;", "int currentServoAngle = 20;", "unsigned long lastCaptureMs = 0;", "unsigned long cameraPulseStartedMs = 0;", "bool cameraPulseActive = false;", "const int GRIP_ON_THRESHOLD = 600;", "const int GRIP_OFF_THRESHOLD = 450;", "", "void loop() {");
  if (inputs.length) {
    const input = inputs[0];
    const read = input.role === "analog_input" ? "analogRead" : "digitalRead";
    const readExpression = `${read}(PIN_${identifier(input.symbol).toUpperCase()})`;
    lines.push(`  const int inputValue = ${input.role === "digital_input" ? `(${readExpression} == LOW ? 1023 : 0)` : readExpression};`, "  Serial.println(inputValue);");
  } else lines.push("  const int inputValue = 0;");
  lines.push("  if (inputValue >= GRIP_ON_THRESHOLD) gripping = true;", "  else if (inputValue <= GRIP_OFF_THRESHOLD) gripping = false;", "  const int targetAngle = gripping ? 150 : 20;", "  if (currentServoAngle < targetAngle) currentServoAngle++;", "  else if (currentServoAngle > targetAngle) currentServoAngle--;");
  for (const output of outputs) {
    const name = `PIN_${identifier(output.symbol).toUpperCase()}`;
    if (/CAM/i.test(output.symbol)) lines.push("  if (!cameraPulseActive && millis() - lastCaptureMs >= 5000) {", `    digitalWrite(${name}, HIGH);`, "    cameraPulseActive = true;", "    cameraPulseStartedMs = millis();", "  }", "  if (cameraPulseActive && millis() - cameraPulseStartedMs >= 100) {", `    digitalWrite(${name}, LOW);`, "    cameraPulseActive = false;", "    lastCaptureMs = millis();", "  }");
    else lines.push(output.role === "pwm_output" ? `  analogWrite(${name}, gripping ? 180 : 20);` : `  digitalWrite(${name}, gripping ? HIGH : LOW);`);
  }
  servos.forEach((servo, index) => lines.push(`  servo_${identifier(servo.symbol)}.write(${index % 2 === 0 ? "currentServoAngle" : "180 - currentServoAngle"});`));
  for (const step of blueprint.firmware.loopSteps) lines.push(`  // ${step.replace(/[\r\n]+/g, " ")}`);
  lines.push("  delay(50);", "}", "");
  return lines.join("\n");
}

function generateScad(blueprint: BuildBlueprint): string {
  const { widthMm: w, depthMm: d, heightMm: h, wallMm: wall } = blueprint.enclosure;
  return `// Generated by 달그락 대장간\n// Open-top enclosure mockup; verify all physical dimensions before printing.\n$fn = 48;\nw = ${w}; d = ${d}; h = ${h}; wall = ${wall};\ndifference() {\n  cube([w, d, h], center=false);\n  translate([wall, wall, wall]) cube([w-2*wall, d-2*wall, h], center=false);\n}\n// board placeholder\ncolor("seagreen") translate([w*0.2, d*0.2, wall]) cube([w*0.6, d*0.6, 2]);\n`;
}

function generateCircuitMarkdown(blueprint: BuildBlueprint, checks: RuleCheck[]): string {
  const components = blueprint.components.map((item) => `| ${item.ref} | ${item.type} | ${item.valueOrModel} | ${item.reason} |`).join("\n");
  const nets = blueprint.nets.map((net) => `| ${net.name} | ${net.kind} | ${net.members.join(", ")} |`).join("\n");
  const verdicts = checks.map((check) => `- **${check.id}**: ${check.verdict} — ${check.message}`).join("\n");
  return `# ${blueprint.title}\n\n전원: ${blueprint.supplyVoltage} V · 보드: ${blueprint.board}\n\n## 부품\n\n| Ref | 종류 | 값/모델 | 이유 |\n|---|---|---|---|\n${components}\n\n## Net\n\n| 이름 | 종류 | 연결 |\n|---|---|---|\n${nets}\n\n## 결정론적 검사\n\n${verdicts}\n`;
}

async function callBlueprint(project: LocalProject): Promise<BuildBlueprint> {
  const adapter = new AnthropicModelAdapter(process.env.ANTHROPIC_MODEL_SMALL ?? "");
  const maximumUsd = 0.02;
  const turnLimit = Number(process.env.LLM_COST_LIMIT_PER_TURN_USD ?? 0);
  const dailyLimit = Number(process.env.LLM_COST_LIMIT_PER_DAY_USD ?? 0);
  if (turnLimit < 0.05 || dailyLimit < maximumUsd) throw new Error("LIVE_BUDGET_BLOCKED");
  return withLocalCostReservation(maximumUsd, dailyLimit, async () => {
    const result = await adapter.call({
      role: "domain_hw",
      schemaName: "build_blueprint",
      schema: blueprintJsonSchema as unknown as Record<string, unknown>,
      maxOutputTokens: 1200,
      effort: "low",
      instructions: [
        "달그락 대장간의 회로·기구·펌웨어 설계자다.",
        "사용자의 전체 비전 중 오늘 검증할 첫 목업 하나만 설계한다. 미래 보행 기능은 포함하지 않는다.",
        "Arduino 프레임워크 보드 하나와 3.3~12V 저전압 회로만 제안한다.",
        "AC 전원, 리튬 셀 직접 충전, 고전압, 고전류 설계는 제안하지 않는다.",
        "부품 재고나 정확한 기구 치수를 확인했다고 주장하지 말고 assumptions와 humanChecks에 넣는다.",
        "sensor, actuator, camera는 각 한 항목으로 짧게 쓴다. pinAssignments는 실제 목업에 필요한 최대 6개만 쓰고 중복하지 않는다.",
        "프로젝트에 필요 없는 sensor, actuator, camera는 정확히 '없음'으로 쓰며 해당 핀을 만들지 않는다. 프로필 coreBehavior가 구체적인 핵심 동작이며 도구 보유 여부를 목표 축소 근거로 쓰지 않는다.",
        "assumptions, humanChecks, loopSteps는 각각 최대 4개이며 각 문장을 짧게 쓴다."
      ].join("\n"),
      input: { idea: project.idea, oneLiner: project.oneLiner, slots: project.slots, makerProfile: project.workflow?.profile, recentMessages: project.messages.slice(-6).map(({ role, text }) => ({ role, text })) }
    }, BlueprintSeedSchema);
    const actualUsd = calculateModelCost({ input: 2, output: 10 }, result.usage);
    return { value: expandBlueprint(result.parsed as BlueprintSeed), actualUsd };
  });
}

async function callEvaluator(project: LocalProject, blueprint: BuildBlueprint, checks: RuleCheck[], firmware: string): Promise<EvaluatorReport> {
  const adapter = new AnthropicModelAdapter(process.env.ANTHROPIC_MODEL_LARGE ?? "");
  const maximumUsd = 0.03;
  const dailyLimit = Number(process.env.LLM_COST_LIMIT_PER_DAY_USD ?? 0);
  return withLocalCostReservation(maximumUsd, dailyLimit, async () => {
    const result = await adapter.call({
      role: "evaluator_hw_sw",
      schemaName: "evaluator_report",
      schema: evaluatorJsonSchema as unknown as Record<string, unknown>,
      maxOutputTokens: 1000,
      effort: "low",
      instructions: [
        "당신은 설계자와 독립된 달그락 대장간 HW/SW Evaluator다.",
        "결정론적 fail을 pass로 바꾸지 않는다. 실물 계측과 컴파일을 하지 않았으므로 근거가 없으면 unknown이다.",
        "components와 nets에 포함된 레귤레이터, 레벨시프터, 분압 저항, 완충 커패시터를 실제 연결대로 반영한다.",
        "필요한 멀티미터 측정은 측정 위치·모드·예상 범위를 한 문장에 포함한다.",
        "makerProfile에 보유 도구가 있으면 이를 반영한다. 없는 장비는 먼저 확보 가능 여부와 장점을 안내하고, 거절된 경우 대체 확인법과 확인할 수 없는 한계를 설명한다.",
        "펌웨어 확인은 Arduino IDE에서 선택할 보드와 확인할 결과를 한 문장에 포함한다.",
        "모든 문자열은 160자 이하로 쓴다. 가장 중요한 위험과 다음 검증만 반환한다."
      ].join("\n"),
      input: {
        idea: project.idea.slice(0, 220),
        makerProfile: project.workflow?.profile,
        blueprint: {
          board: blueprint.board,
          supplyVoltage: blueprint.supplyVoltage,
          components: blueprint.components.map(({ ref, valueOrModel }) => `${ref}:${valueOrModel}`),
          nets: blueprint.nets.map(({ name, members }) => `${name}:${members.join("->")}`),
          pins: blueprint.firmware.pinAssignments.map(({ symbol, pin, role }) => [symbol, pin, role]),
          assumptions: blueprint.assumptions.slice(0, 3)
        },
        deterministicChecks: checks.map(({ id, verdict }) => ({ id, verdict })),
        firmware: firmware.slice(0, 2400)
      }
    }, EvaluatorCompactSchema);
    const actualUsd = calculateModelCost({ input: 5, output: 25 }, result.usage);
    const compact = result.parsed as z.infer<typeof EvaluatorCompactSchema>;
    const value: EvaluatorReport = {
      summary: compact.summary,
      hw: { verdict: compact.hwVerdict, findings: compact.hwFinding ? [compact.hwFinding] : [], requiredMeasurements: compact.measurement ? [compact.measurement] : [] },
      sw: { verdict: compact.swVerdict, findings: compact.swFinding ? [compact.swFinding] : [], requiredRuns: compact.firmwareRun ? [compact.firmwareRun] : [] }
    };
    if (checks.some((check) => check.id === "CAMERA_VOLTAGE_DOMAIN" && check.verdict === "unknown")) {
      value.hw.requiredMeasurements.push("카메라 모듈의 정확한 모델/전원 핀 허용치를 확인하고, 전원 인가 후 LS1.LV_OUT-GND를 DC전압 모드로 측정해 HIGH가 3.2~3.4V인지 알려주세요.");
    }
    if (blueprint.components.some((item) => /servo|SG90/i.test(item.valueOrModel))) {
      value.hw.requiredMeasurements.push("서보 2개가 동시에 움직일 때 PS1.OUT-GND를 DC전압 모드로 측정해 4.75~5.25V가 유지되는지 알려주세요. 4.5V 미만이면 서보 전원을 분리해야 합니다.");
    }
    return { value, actualUsd };
  });
}

export async function runBuildPipeline(project: LocalProject, circuitOnly = false): Promise<BuildResult> {
  if (process.env.APP_MODE !== "live") throw new Error("LIVE_MODE_REQUIRED");
  const blueprint = normalizeBlueprintWiring(await callBlueprint(project));
  const firmware = generateFirmware(blueprint);
  const scad = generateScad(blueprint);
  const checks = [...deterministicChecks(blueprint), ...firmwareChecks(firmware, blueprint), ...scadChecks(scad, blueprint)];
  const evaluator = await callEvaluator(project, blueprint, checks, firmware);
  const now = new Date().toISOString();
  const artifact = (kind: ProjectArtifact["kind"], filename: string, mimeType: string, content: string): ProjectArtifact => ({ id: randomUUID(), kind, filename, mimeType, content, createdAt: now });
  const artifacts = [
    artifact("circuit", "circuit-plan.md", "text/markdown; charset=utf-8", generateCircuitMarkdown(blueprint, checks)),
    ...(circuitOnly ? [] : [artifact("cad", "enclosure-mockup.scad", "text/plain; charset=utf-8", scad)]),
    artifact("firmware", "dalgeurak_firmware.ino", "text/plain; charset=utf-8", firmware)
  ];
  return { status: buildStatus(checks, evaluator), blueprint, checks, evaluator, artifacts, createdAt: now };
}

export function approvedCad(build: BuildResult): BuildResult {
  const now = new Date().toISOString();
  const cad: ProjectArtifact = { id: randomUUID(), kind: "cad", filename: "enclosure-mockup.scad", mimeType: "text/plain; charset=utf-8", content: generateScad(build.blueprint), createdAt: now };
  return { ...build, artifacts: [...build.artifacts.filter((artifact) => artifact.kind !== "cad"), cad] };
}

export async function reevaluateBuild(project: LocalProject): Promise<BuildResult> {
  if (process.env.APP_MODE !== "live") throw new Error("LIVE_MODE_REQUIRED");
  if (!project.build) throw new Error("BUILD_REQUIRED");
  const blueprint = normalizeBlueprintWiring(project.build.blueprint);
  const firmware = project.build.artifacts.find((artifact) => artifact.kind === "firmware")?.content;
  if (!firmware) throw new Error("FIRMWARE_REQUIRED");
  const scad = generateScad(blueprint);
  const checks = [...deterministicChecks(blueprint), ...firmwareChecks(firmware, blueprint), ...scadChecks(scad, blueprint)];
  const evaluator = await callEvaluator(project, blueprint, checks, firmware);
  const now = new Date().toISOString();
  const artifacts = project.build.artifacts.map((artifact) => artifact.kind === "circuit" ? { ...artifact, content: generateCircuitMarkdown(blueprint, checks), createdAt: now } : artifact.kind === "cad" ? { ...artifact, content: scad, createdAt: now } : artifact);
  return { ...project.build, status: buildStatus(checks, evaluator), blueprint, checks, evaluator, artifacts, createdAt: now };
}

export async function repairAndReevaluateBuild(project: LocalProject): Promise<BuildResult> {
  if (process.env.APP_MODE !== "live") throw new Error("LIVE_MODE_REQUIRED");
  if (!project.build) throw new Error("BUILD_REQUIRED");
  const blueprint = normalizeBlueprintWiring(project.build.blueprint);
  const firmware = generateFirmware(blueprint);
  const scad = generateScad(blueprint);
  const checks = [...deterministicChecks(blueprint), ...firmwareChecks(firmware, blueprint), ...scadChecks(scad, blueprint)];
  const evaluator = await callEvaluator(project, blueprint, checks, firmware);
  const now = new Date().toISOString();
  const artifacts = project.build.artifacts.map((artifact) => artifact.kind === "firmware" ? { ...artifact, content: firmware, createdAt: now } : artifact.kind === "circuit" ? { ...artifact, content: generateCircuitMarkdown(blueprint, checks), createdAt: now } : artifact.kind === "cad" ? { ...artifact, content: scad, createdAt: now } : artifact);
  return { ...project.build, status: buildStatus(checks, evaluator), blueprint, checks, evaluator, artifacts, createdAt: now };
}
