export type SlotKey = "power" | "wireless" | "sensing" | "actuation" | "data_sink" | "form" | "runtime" | "fab";
export type SlotStatus = "empty" | "assumed" | "filled";

export type DesignSlot = {
  key: SlotKey;
  label: string;
  status: SlotStatus;
  valueText: string | null;
  assumption: string | null;
  acknowledged: boolean;
};

export type ProjectTask = {
  id: string;
  kind: "confirm_spec" | "confirm_availability" | "measure" | "run_firmware" | "provide_info";
  title: string;
  plain: string;
  status: "ready" | "completed";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  agent?: AgentId;
  channel?: ChatChannel;
  mode?: "work" | "evaluate";
  attachments?: ImageAttachment[];
  shared?: boolean;
};

export type ConnectionKind = "builtin" | "socket" | "qwiic" | "grove" | "breadboard" | "solder";
// arduino → .ino, micropython → main.py for Pico, linux → Python for Raspberry Pi (Linux).
export type FirmwarePlatform = "arduino" | "micropython" | "linux";
export type CircuitComponent = { ref: string; type: string; valueOrModel: string; reason: string; connection?: ConnectionKind; catalogId?: string };
// Rough outer form for the 3D mockup, in mm, origin at the floor centre.
export type ShapePart = { name: string; primitive: "box" | "sphere" | "cylinder" | "cone"; size: [number, number, number]; position: [number, number, number]; color?: string };
export type CircuitNet = { name: string; kind: "power" | "ground" | "signal"; members: string[] };
export type PinAssignment = { symbol: string; pin: number; role: "digital_input" | "analog_input" | "digital_output" | "pwm_output" | "servo" };

export type BuildBlueprint = {
  title: string;
  board: string;
  supplyVoltage: number;
  components: CircuitComponent[];
  nets: CircuitNet[];
  enclosure: { widthMm: number; depthMm: number; heightMm: number; wallMm: number };
  firmware: { platform: FirmwarePlatform; behavior: string; pinAssignments: PinAssignment[]; loopSteps: string[] };
  assumptions: string[];
  humanChecks: string[];
  shape?: ShapePart[];
};

export type RuleCheck = { id: string; verdict: "pass" | "fail" | "unknown"; message: string; severity?: "info" | "warning" | "blocked"; affectedRefs?: string[]; evidence?: string };
export type EvaluatorReport = {
  summary: string;
  hw: { verdict: "pass" | "fail" | "unknown"; findings: string[]; requiredMeasurements: string[] };
  sw: { verdict: "pass" | "fail" | "unknown"; findings: string[]; requiredRuns: string[] };
};

export type ProjectArtifact = {
  id: string;
  kind: "firmware" | "cad" | "circuit";
  filename: string;
  mimeType: string;
  content: string;
  createdAt: string;
};

export type BuildResult = {
  status: "ready" | "needs_input";
  blueprint: BuildBlueprint;
  checks: RuleCheck[];
  evaluator: EvaluatorReport;
  artifacts: ProjectArtifact[];
  createdAt: string;
};

export type LocalProject = {
  id: string;
  // Invited user who owns the project; absent for the operator's own projects.
  ownerId?: string;
  // Where the conversation happens: the in-app agents or the owner's own Claude.
  origin?: "web" | "connector";
  name: string;
  idea: string;
  oneLiner: string;
  stage: "idea" | "spec" | "workshop";
  workflow?: Workflow;
  buildPlan?: BuildPlan;
  productForm?: ProductForm;
  assembly?: AssemblyGuide;
  housing?: HousingPlan;
  power?: PowerBudget;
  testPlan?: TestPlan;
  safety?: SafetyReview;
  history?: DesignSnapshot[];
  dataContract?: DataContract;
  /** SW 명세서(write_dev_spec)가 적은 통신 방식·형식 — 데이터 약속과 대조한다 */
  swInterface?: { transport: "serial" | "ble" | "wifi_http" | "wifi_mqtt" | "none"; format: string; at: string };
  assemblyReports?: AssemblyReport[];
  assemblyDetails?: AssemblyDetail[];
  assemblyRequests?: AssemblyRequest[];
  liveStatus?: LiveStatus;
  activity?: ActivityEntry[];
  workspaceFiles?: Array<{ id: string; agent: AgentId; filename: string; content: string; createdAt: string }>;
  designRevision: number;
  slots: DesignSlot[];
  tasks: ProjectTask[];
  messages: ChatMessage[];
  build: BuildResult | null;
  lastAgentMode: "mock" | "live";
  createdAt: string;
  updatedAt: string;
};

export type AgentId = "chief" | "hw" | "sw" | "me" | "id";
export type ChatChannel = "main" | AgentId;
export type ImageAttachment = { name: string; dataUrl: string };
export type MakerProfile = {
  tools: string[]; toolsConfirmed: boolean; firmwareExperience: "unanswered" | "none" | "guided" | "independent"; coreBehavior: string;
  // Extended checklist; optional so older projects keep loading.
  solderingSkill?: "unanswered" | "none" | "tried" | "comfortable";
  printerAccess?: "unanswered" | "own" | "makerspace" | "service" | "none";
  region?: string;
  budgetKRW?: number | null;
  purpose?: "unanswered" | "personal" | "gift" | "sell" | "lecture";
  targetPriceKRW?: number | null;
  travelRange?: "unanswered" | "walk" | "transit30" | "transit60" | "car";
  timelineWeeks?: number | null;
};

// What the finished product looks like, settled before any circuit: the
// outer form, where the screen/camera/buttons sit and the real parts inside.
// linkedRef ties a visible feature (e.g. the charging port) to the internal
// part that must line up with it; the server checks they actually meet.
export type ProductFeature = { name: string; kind: "screen" | "camera" | "button" | "speaker" | "mic" | "port" | "light" | "other"; facing: "front" | "back" | "top" | "bottom" | "left" | "right"; position: [number, number, number]; size: [number, number]; linkedRef?: string };
export type ProductInternal = { ref: string; label: string; size: [number, number, number]; position: [number, number, number] };
export type ProductForm = {
  summary: string;
  answers: Array<{ question: string; answer: string }>;
  shape: ShapePart[];
  features: ProductFeature[];
  internals: ProductInternal[];
  material: string;
  updatedAt: string;
};

// Step-by-step build on the real board footprint, with trouble cards the
// person checks and reports back from.
export type AssemblyPart = { ref: string; label: string; x: number; y: number; width: number; height: number; color?: string; pins?: Array<{ name: string; x: number; y: number }>; catalogId?: string; rotation?: 0 | 90 | 180 | 270 };
export type AssemblyWire = { from: string; to: string; color: string; label?: string };
export type TroubleCard = { id: string; symptom: string; check: string; expected: string; ifNot: string };
// 3D 조립 책상에서 연출할 추가 동작 (명세서 2차 v0.1 §3). 없으면 place·wires만으로 연출한다.
// 핀 표기는 REF.PIN. 납땜 위치는 회로 net에 들어 있는 핀이어야 한다.
export type AssemblyOp =
  | { op: "solder"; joints: string[]; side: "top" | "bottom" }
  | { op: "trim"; refs: string[] }
  | { op: "check"; how: "look" | "continuity" | "power_on"; targets: string[]; expected: string };
export type AssemblyStep = { title: string; action: string; place: string[]; wires: AssemblyWire[]; check: string; cards: TroubleCard[]; ops?: AssemblyOp[] };
export type AssemblyGuide = {
  stage: string;
  base: { name: string; kind: "breadboard" | "board" | "stack" | "perfboard"; width: number; height: number };
  parts: AssemblyPart[];
  steps: AssemblyStep[];
  updatedAt: string;
};
export type AssemblyReport = { step: number; cardId: string | null; text: string; createdAt: string; judgement?: "normal" | "abnormal" | "unknown" };

// Finer steps for one assembly step, generated on request and checked so
// they never add parts, pins, connections or invented measurements.
export type AssemblySubstep = { id: string; order: number; action: string; materials: string[]; tools: string[]; quantity: number | null; repeatCount: number; targetRefs: string[]; targetPins: string[]; caution: string; doneWhen: string; checkMethod: string };
export type AssemblyDetail = { step: number; level: "normal" | "beginner" | "micro"; basis: string; substeps: AssemblySubstep[]; createdAt: string };
export type AssemblyRequest = { step: number; level: "beginner" | "micro"; requestedAt: string; doneAt: string | null };

// What Claude is doing right now, shown live on the dashboard.
export type LiveStatus = { title: string; plan: Array<{ label: string; status: "done" | "doing" | "todo" }>; thinking: string; updatedAt: string };
export type ActivityEntry = { id: string; at: string; source: "tool" | "claude" | "person"; title: string; detail?: string };

// The chief's whole-project design: board, connection method, modules and the
// staged path (including practice) before any circuit is drawn.
export type BuildPlan = {
  track: "software" | "hardware" | "both";
  summary: string;
  board: { choice: "arduino" | "raspberry_pi" | "pico" | "esp32" | "nuboard" | "nu40" | "nu87" | "other"; model: string; why: string; alternatives: string; catalogId?: string };
  connection: { method: "solder" | "qwiic" | "grove" | "breadboard" | "perfboard" | "pcb" | "socket" | "mixed"; why: string };
  // Board selection STEP 1 and STEP 3 (see the guide): inputs/outputs and the pre-purchase checks.
  io?: { inputs: string[]; outputs: string[]; wireless: "none" | "bluetooth" | "wifi" | "both" };
  preBuyChecks?: Array<{ item: string; status: "confirmed" | "unknown"; source: string }>;
  modules: Array<{ function: string; part: string; why: string; connection: string; whereToBuy: string; searchKeyword: string; estPriceKRW: number | null; difficulty: "쉬움" | "보통" | "어려움" }>;
  structure: Array<{ name: string; role: string; connectsTo: string }>;
  stages: Array<{ title: string; goal: string; learn: string; practice: string; doneWhen: string; parts: string[] }>;
  prerequisites: Array<{ skill: string; why: string; practice: string; timeEstimate: string }>;
  // totalKRW counts parts plus the one-time setup items.
  cost: { totalKRW: number; partsKRW?: number; setupKRW?: number; budgetKRW: number | null; verdict: "within" | "tight" | "over" | "unknown"; options: string[]; marginNote: string };
  setupItems?: Array<{ item: string; why: string; estPriceKRW: number | null }>;
  timeline?: { stages: Array<{ title: string; weeks: number }>; reason: string; totalWeeks: number; targetWeeks: number | null; feasibility: "likely" | "stretch" | "unlikely" | "unknown" };
  fabrication: { needs3DPrint: boolean; plan: string };
  risks: string[];
  updatedAt: string;
};
export type PartSource = { url: string; title: string; price: string | null; checkedAt: string; note: string };
export type DevProfile = {
  codingExperience: "unanswered" | "none" | "guided" | "independent";
  tool: "undecided" | "claude_code" | "codex";
  os: "unanswered" | "mac" | "windows" | "linux";
  installed: string[];
  confirmed: boolean;
};
export type Workflow = {
  phase: "brainstorm" | "circuit" | "mockup" | "handoff" | "workshop";
  profile: MakerProfile;
  activeAgents: AgentId[];
  circuitApprovedAt: string | null;
  mockupApprovedAt: string | null;
  sharedUpdates: Array<{ id: string; agent: AgentId; text: string; createdAt: string }>;
  purchases: Record<string, "needed" | "ordered" | "received" | "problem">;
  evidence: Array<{ taskId: string; text: string; createdAt: string }>;
  // Where Claude found each part (web search or a link the person gave).
  partSources?: Record<string, PartSource[]>;
  // How the person will build the software part; shapes the SW guidance.
  devProfile?: DevProfile;
};

export type AgentPlan = {
  projectName: string;
  oneLiner: string;
  reply: string;
  slotUpdates: Array<{
    key: SlotKey;
    status: SlotStatus;
    valueText: string | null;
    assumption: string | null;
    acknowledged: boolean;
  }>;
  tasks: Array<{
    kind: ProjectTask["kind"];
    title: string;
    plain: string;
  }>;
};

// 하우징을 부위별로 무엇으로 어떻게 만드는지 (명세서 2차 v0.1 §6).
// shapeRefs는 ProductForm.shape의 인덱스. feasible·outputs 상태·합계는 서버가 다시 계산한다.
export type FabMethod = "print_fdm" | "print_resin" | "resin_cast" | "pp_sheet" | "laser_cut" | "foam_board" | "fabric_sew" | "off_the_shelf" | "none";
export type JoinMethod = "screw" | "heat_insert" | "snap" | "magnet" | "tape" | "glue" | "slot" | "sew" | "velcro";
export type HousingOutputKind = "stl" | "scad" | "dxf_unfold" | "svg_cut" | "pattern_pdf" | "mold_plan" | "buy_link";
export type HousingRegion = {
  id: string;
  name: string;
  role: string;
  shapeRefs: number[];
  method: FabMethod;
  why: string;
  material: { name: string; thicknessMm: number | null; color?: string; finish?: string };
  join: Array<{ to: string; method: JoinMethod; detail: string }>;
  toleranceMm: number | null;
  access?: { purpose: "battery" | "charging" | "button" | "debug" | "none"; how: string };
  outputs: Array<{ kind: HousingOutputKind; status: "ready" | "todo" | "unknown"; note: string; url?: string }>;
  process: string[];
  costKRW: number | null;
  timeHours: number | null;
  feasible: "yes" | "needs_service" | "no" | "unknown";
};
export type HousingPlan = {
  summary: string;
  regions: HousingRegion[];
  environment: { indoorOutdoor: "indoor" | "outdoor" | "both"; water: "none" | "splash" | "rain" | "submerge"; heatSources: string[]; skinContact: boolean; childUse: boolean };
  assemblyOrder: string[];
  totals: { costKRW: number | null; timeHours: number | null; partial: boolean };
  risks: string[];
  updatedAt: string;
};

// 전원·배터리 수명 (명세서 2차 v0.1 §7). result는 서버가 다시 계산한다.
export type PowerLoad = { ref: string; currentMa: number; basis: "card_typical" | "card_max" | "datasheet" | "measured" | "assumed" };
export type PowerBudget = {
  source: { kind: "usb" | "battery" | "adapter"; part?: string; capacityMah?: number | null; voltage: number };
  modes: Array<{ name: string; dutyPct: number; loads: PowerLoad[] }>;
  regulatorEfficiency: number;
  derating: number;
  result: { avgCurrentMa: number; peakCurrentMa: number; hours: number | null; estimated: boolean; railWarnings: string[] };
  updatedAt: string;
};

// 펌웨어 업로드·동작 테스트 계획 (§8). 결과를 보내도 자동으로 pass가 되지 않는다.
export type TestCase = {
  id: string; stage: number; title: string; setup: string; do: string;
  expect: { serial?: string[]; observe?: string; measure?: { what: string; min: number; max: number; unit: string } };
  result?: { status: "pass" | "fail" | "unknown"; evidence: string; at: string; by: "person" | "claude" };
};
export type TestPlan = { board: string; cases: TestCase[]; updatedAt: string };

// 안전 검토 (§11). 조건에 맞는 필수 항목은 서버가 넣는다. risk는 사람이 '확인했어요'를 눌러야 대장간에 들어간다.
export type SafetyItem = { id: string; topic: string; text: string; status: "ok" | "risk" | "unknown"; required: boolean; ackAt?: string };
export type SafetyReview = { items: SafetyItem[]; updatedAt: string };

// 설계 기록 (§10). set_* 도구가 덮어쓰기 전 값을 남긴다.
export type DesignSnapshot = { id: string; at: string; tool: string; summary: string; field: "productForm" | "buildPlan" | "build" | "assembly" | "housing" | "power" | "testPlan" | "safety" | "dataContract"; snapshot: string };

// 펌웨어와 SW가 주고받는 데이터 약속 (2차 v0.2 추가). 한 줄 = 메시지 하나.
// kv: "state=1;temp=23.5"  csv: "S,1,23.5" (prefix 다음 값 순서대로)  json: {"t":"state","on":1}
export type ContractField = { name: string; type: "int" | "float" | "bool" | "string" | "enum"; unit?: string; min?: number; max?: number; values?: string[] };
export type ContractMessage = { id: string; direction: "device_to_app" | "app_to_device"; prefix: string; description: string; every?: string; fields: ContractField[]; example: string };
export type ContractRun = { id: string; at: string; source: "device_log" | "app_sample" | "claude"; total: number; ok: number; problems: string[]; by: "person" | "claude" };
export type DataContract = {
  transport: "serial" | "ble" | "wifi_http" | "wifi_mqtt";
  format: "kv" | "csv" | "json";
  baud: number | null;
  messages: ContractMessage[];
  runs: ContractRun[];
  updatedAt: string;
};
