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
