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
  // completed = 결과를 적어서 냈다. checked = 확인만 하고 넘겼다(결과 없음).
  // skipped = 안 하고 넘겼다. 권장했지만 하지 않은 일이라 지우지 않고 남긴다.
  // 나중에 문제가 생겼을 때 "여기는 확인 안 하고 지나갔다"를 되짚을 수 있어야 한다.
  status: "ready" | "completed" | "checked" | "skipped";
  closedAt?: string;
  skipNote?: string;
};

// 권장했지만 사람이 하지 않고 넘어간 일. 문제가 생기면 여기부터 의심한다.
export const skippedTasks = (tasks: ProjectTask[]) => tasks.filter((t) => t.status === "skipped");
export const openTasks = (tasks: ProjectTask[]) => tasks.filter((t) => t.status === "ready");

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
  /** 사람이 쓴 말이 아니라 대장이 자동 진행으로 넘긴 지시 */
  auto?: boolean;
  /** 대장이 넘긴 일이 어느 작업 카드의 것인지. 대화를 카드별로 묶어 보여줄 때 쓴다 */
  cardTitle?: string;
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
  // 현황판: 작업 카드(누구 차례인지)와 화면 밖 현실의 상태. board.ts
  board?: import("./board").Board;
  // 정밀 목업: 하우징 부위와 실측 부품을 실제 치수로 놓고 서버가 겹침·틈을 잰다. mockup.ts
  preciseMockup?: import("./mockup").MockupSpec;
  /** ID 초안과 사람이 마무리할 길 */
  designFinish?: import("./tools/finish-labels").DesignFinish;
  // 제작 후 수정: 승인된 설계에 대한 수정안과 그 영향. revision.ts
  revision?: import("./revision").RevisionState;
  // 회로 검증 사다리의 진행과 사람이 준 값. verify-ladder.ts
  verify?: import("./verify-ladder").VerifyState;
  // 파일마다의 표시(초안·최종·대체됨, 만든 달그락). file-tree.ts
  fileMarks?: import("./file-tree").FileMarks;
  // Invited user who owns the project; absent for the operator's own projects.
  ownerId?: string;
  // Where the conversation happens: the in-app agents or the owner's own Claude.
  origin?: "web" | "connector";
  /** 온보딩에서 가져온 아이디어로 만든 프로젝트의 표시(같은 쪽지로 두 번 만들지 않게) */
  seedStamp?: string;
  // 사람이 끌어놓아 정한 목록 순서. 한 번도 정하지 않았으면 없고, 그때는 최근 작업 순서를
  // 따른다. 한 번 정하면 그 사람의 모든 프로젝트에 0..n-1이 매겨진다.
  order?: number;
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
  /** MEETUP: 밋업 시연용 프로젝트에만 생기는 현장 아이디어 기록 (lib/meetup.ts) */
  meetup?: { ideas: Array<{ text: string; at: string }>; finishedAt?: string };
  designRevision: number;
  slots: DesignSlot[];
  tasks: ProjectTask[];
  messages: ChatMessage[];
  build: BuildResult | null;
  lastAgentMode: "mock" | "live";
  createdAt: string;
  updatedAt: string;
};

// hwlead = 하드웨어 달그락(전자회로 hw와 기구설계 me를 조율). hw는 예전부터 전자회로를 뜻한다.
export type AgentId = "chief" | "hwlead" | "hw" | "sw" | "me" | "id";
export type ChatChannel = "main" | AgentId;
export type ImageAttachment = { name: string; dataUrl: string };
// 자주 가는 메이커스페이스. 예약 자체는 공간마다 제각각이라 여기서 걸지 않고,
// 어디에 무엇이 있는지와 예약 페이지 링크를 들고 있는다. 출력 크기를 적어두면
// ME 달그락이 그 장비로 낼 수 있는 크기 안에서 설계한다.
export type MakerSpace = { id: string; name: string; where: string; printers: string; maxPrintMm: [number, number, number] | null; url: string; note: string };

// 이미 가지고 있는 부품. 서랍에 있는 것을 또 사게 하지 않으려고 적어둔다.
// catalogId가 붙으면 부품 카드의 전압·로직레벨·전류를 호환성 검사에 함께 넣는다.
// 붙지 않아도(카드에 없는 부품) 목록에는 남아서 "이건 있으니 빼세요"로 쓰인다.
export type OwnedPart = { id: string; name: string; qty: number; catalogId: string | null; note: string };

export type MakerProfile = {
  // 학습 모드: 켜면 단계마다 "왜 이렇게 하는지"를 더 자세히 풀어 준다
  learningMode?: boolean;
  // 체크리스트의 추가 질문 답(측정 도구, 작업 여건, 사용 환경 등). 키는 checklist.ts의 EXTRA_QUESTIONS
  extras?: Record<string, string | string[]>;
  // 추가 질문 가운데 이 프로젝트에만 해당하는 답(사용 환경, 완성도 기대)
  projectExtras?: Record<string, string | string[]>;
  tools: string[]; toolsConfirmed: boolean; firmwareExperience: "unanswered" | "none" | "guided" | "independent"; coreBehavior: string;
  makerspaces?: MakerSpace[];
  // 가진 부품. 장비(tools)는 고정된 선택지지만 부품은 사람마다 제각각이라 직접 적는다.
  ownedParts?: OwnedPart[];
  // 코딩 경험과 즐겨 쓰는 도구도 사람에게 붙는다. 프로젝트마다 다시 물을 이유가 없다.
  // 영역별로 따로 둔다: 웹은 짜지만 펌웨어는 처음인 사람이 흔하다(firmwareExperience와 별개).
  devProfile?: DevProfile;
  // Extended checklist; optional so older projects keep loading.
  solderingSkill?: "unanswered" | "none" | "tried" | "comfortable";
  printerAccess?: "unanswered" | "own" | "makerspace" | "service" | "none";
  region?: string;
  budgetKRW?: number | null;
  /** 이 프로젝트는 예산을 정하지 않는다(묻지도, 예산으로 부품을 낮추지도 않는다) */
  budgetOff?: boolean;
  /** 자주 쓰는 구매처. 부품을 찾을 때 먼저 본다 (계정에 붙는다) */
  preferredShops?: string[];
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
export type ProductInternal = {
  ref: string; label: string; size: [number, number, number]; position: [number, number, number];
  /** 부품 카드 ID. 있으면 서버가 카드 치수와 견준다 */
  catalogId?: string;
  /** 위에서 볼 때 시계 반대 방향 회전. 90·270이면 size의 가로·세로가 바뀌어 놓인다 */
  rotation?: 0 | 90 | 180 | 270;
  /** 이 크기를 어디서 얻었나. assumed이거나 비어 있으면(카드도 없으면) 실측이 필요하다 */
  sizeBasis?: "card" | "datasheet" | "measured" | "assumed";
  /** 헤더·소켓으로 서로 꽂히는 부품의 ref. 이 쌍의 겹침은 허용한다 */
  stackedWith?: string[];
};
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
export type AssemblyPart = { ref: string; label: string; x: number; y: number; width: number; height: number; color?: string; pins?: Array<{ name: string; x: number; y: number }>; catalogId?: string; rotation?: 0 | 90 | 180 | 270;
  /** 바닥(기판 윗면)에서 띄운 높이 mm. 받침 위에 놓이거나 다른 부품의 헤더 위에 꽂히는 부품 */
  lift?: number };
export type AssemblyWire = { from: string; to: string; color: string; label?: string };
export type TroubleCard = { id: string; symptom: string; check: string; expected: string; ifNot: string };
// 3D 조립 책상에서 연출할 추가 동작 (명세서 2차 v0.1 §3). 없으면 place·wires만으로 연출한다.
// 핀 표기는 REF.PIN. 납땜 위치는 회로 net에 들어 있는 핀이어야 한다.
export type AssemblyOp =
  | { op: "solder"; joints: string[]; side: "top" | "bottom" }
  | { op: "trim"; refs: string[] }
  | { op: "check"; how: "look" | "continuity" | "power_on"; targets: string[]; expected: string };
export type AssemblyStep = { title: string; action: string; place: string[]; wires: AssemblyWire[]; check: string; cards: TroubleCard[]; ops?: AssemblyOp[];
  /** 미리 해 둔 단계 (예: 납땜을 끝내서 가져온 부품). 작업대에서 화면을 따라 하지 않고 바로 완료로 넘길 수 있다 */
  prepared?: boolean };
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
