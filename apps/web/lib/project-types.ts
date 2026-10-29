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

export type CircuitComponent = { ref: string; type: string; valueOrModel: string; reason: string };
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
  name: string;
  idea: string;
  oneLiner: string;
  stage: "idea" | "spec" | "workshop";
  workflow?: Workflow;
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
export type MakerProfile = { tools: string[]; toolsConfirmed: boolean; firmwareExperience: "unanswered" | "none" | "guided" | "independent"; coreBehavior: string };
export type Workflow = {
  phase: "brainstorm" | "circuit" | "mockup" | "handoff" | "workshop";
  profile: MakerProfile;
  activeAgents: AgentId[];
  circuitApprovedAt: string | null;
  mockupApprovedAt: string | null;
  sharedUpdates: Array<{ id: string; agent: AgentId; text: string; createdAt: string }>;
  purchases: Record<string, "needed" | "ordered" | "received" | "problem">;
  evidence: Array<{ taskId: string; text: string; createdAt: string }>;
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
