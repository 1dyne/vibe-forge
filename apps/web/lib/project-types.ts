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
export type CircuitComponent = { ref: string; type: string; valueOrModel: string; reason: string; connection?: ConnectionKind };
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
  firmware: { platform: "arduino"; behavior: string; pinAssignments: PinAssignment[]; loopSteps: string[] };
  assumptions: string[];
  humanChecks: string[];
  shape?: ShapePart[];
};

export type RuleCheck = { id: string; verdict: "pass" | "fail" | "unknown"; message: string };
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
};

// What the finished product looks like, settled before any circuit: the
// outer form, where the screen/camera/buttons sit and the real parts inside.
export type ProductFeature = { name: string; kind: "screen" | "camera" | "button" | "speaker" | "mic" | "port" | "light" | "other"; facing: "front" | "back" | "top" | "bottom" | "left" | "right"; position: [number, number, number]; size: [number, number] };
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
export type AssemblyPart = { ref: string; label: string; x: number; y: number; width: number; height: number; color?: string; pins?: Array<{ name: string; x: number; y: number }> };
export type AssemblyWire = { from: string; to: string; color: string; label?: string };
export type TroubleCard = { id: string; symptom: string; check: string; expected: string; ifNot: string };
export type AssemblyStep = { title: string; action: string; place: string[]; wires: AssemblyWire[]; check: string; cards: TroubleCard[] };
export type AssemblyGuide = {
  stage: string;
  base: { name: string; kind: "breadboard" | "board" | "stack" | "perfboard"; width: number; height: number };
  parts: AssemblyPart[];
  steps: AssemblyStep[];
  updatedAt: string;
};
export type AssemblyReport = { step: number; cardId: string | null; text: string; createdAt: string };

// The chief's whole-project design: board, connection method, modules and the
// staged path (including practice) before any circuit is drawn.
export type BuildPlan = {
  track: "software" | "hardware" | "both";
  summary: string;
  board: { choice: "arduino" | "raspberry_pi" | "pico" | "esp32" | "nuboard" | "other"; model: string; why: string; alternatives: string };
  connection: { method: "solder" | "qwiic" | "grove" | "breadboard" | "socket" | "mixed"; why: string };
  modules: Array<{ function: string; part: string; why: string; connection: string; whereToBuy: string; searchKeyword: string; estPriceKRW: number | null; difficulty: "쉬움" | "보통" | "어려움" }>;
  structure: Array<{ name: string; role: string; connectsTo: string }>;
  stages: Array<{ title: string; goal: string; learn: string; practice: string; doneWhen: string; parts: string[] }>;
  prerequisites: Array<{ skill: string; why: string; practice: string; timeEstimate: string }>;
  cost: { totalKRW: number; budgetKRW: number | null; verdict: "within" | "tight" | "over" | "unknown"; options: string[]; marginNote: string };
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
