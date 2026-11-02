import type { DevProfile, LocalProject } from "./project-types";

// Shared by the server (MCP tools) and the dashboard, so no Node imports here.

export const emptyDevProfile = (): DevProfile => ({ codingExperience: "unanswered", tool: "undecided", os: "unanswered", installed: [], confirmed: false });
export const DEV_INSTALL_OPTIONS = ["Node.js", "Git", "VS Code", "GitHub 계정", "Arduino IDE"];
export const CODING_EXPERIENCE: Record<DevProfile["codingExperience"], string> = {
  unanswered: "아직 답변 안 함",
  none: "처음이에요 · 터미널도 낯설어요",
  guided: "따라 하며 코드를 실행해본 적 있어요",
  independent: "직접 코드를 고치고 실행할 수 있어요"
};
export const DEV_TOOLS: Record<DevProfile["tool"], string> = { undecided: "아직 모르겠어요", claude_code: "Claude Code", codex: "Codex" };

export function devProfileMissing(profile: DevProfile | undefined): string[] {
  const p = profile ?? emptyDevProfile();
  return [p.codingExperience === "unanswered" && "코딩 경험", p.os === "unanswered" && "컴퓨터 종류", !p.confirmed && "설치된 도구"].filter(Boolean) as string[];
}

// Text the person pastes into a Claude Project's instructions so every chat in
// that Claude Project keeps writing to this one 달그락 project.
export function claudeProjectInstructions(project: Pick<LocalProject, "id" | "name">): string {
  return [
    `이 Claude 프로젝트는 달그락 대장간 프로젝트 「${project.name}」와 연결되어 있어요.`,
    `- 달그락 프로젝트 ID: ${project.id}`,
    "- 대화를 시작하면 달그락 대장간 커넥터의 get_project를 이 ID로 호출해 현재 단계와 다음 할 일을 확인해줘.",
    "- 이 Claude 프로젝트의 모든 기록은 이 ID에만 남겨줘. 내가 직접 요청하지 않으면 새 달그락 프로젝트를 만들지 마.",
    "- 부품·가격·데이터시트를 웹에서 찾았다면 record_part_source로 출처 링크와 확인 날짜를 남겨줘."
  ].join("\n");
}

export type DevSpecInput = {
  title: string;
  goal: string;
  whyCode: string;
  pieces: Array<{ name: string; kind: "firmware" | "web" | "app" | "script" | "server"; purpose: string }>;
  features: Array<{ name: string; detail: string }>;
  acceptance: string[];
  outOfScope: string[];
  dataInterface: { transport: "serial" | "ble" | "wifi_http" | "wifi_mqtt" | "none"; format: string };
  stack: Array<{ name: string; reason: string }>;
  learningSteps: Array<{ step: string; explain: string }>;
  recommendedTool: "claude_code" | "codex";
};

const TRANSPORT: Record<DevSpecInput["dataInterface"]["transport"], string> = { serial: "USB 시리얼", ble: "블루투스 LE", wifi_http: "Wi-Fi · HTTP", wifi_mqtt: "Wi-Fi · MQTT", none: "하드웨어 통신 없음" };
const PIECE: Record<DevSpecInput["pieces"][number]["kind"], string> = { firmware: "펌웨어", web: "웹", app: "앱", script: "스크립트", server: "서버" };
const list = (items: string[]) => items.length ? items.map((item) => `- ${item}`).join("\n") : "- (없음)";

function hardwareSection(project: LocalProject): string {
  const build = project.build;
  if (!build) return "## 하드웨어 기준\n\n아직 회로가 정해지지 않았어요. 하드웨어와 맞물리는 부분은 임시값으로 두고 TODO로 표시해요.";
  const approved = project.workflow?.circuitApprovedAt ? "사람이 승인한 회로" : "승인 전 회로 초안 (바뀔 수 있음)";
  const pins = build.blueprint.firmware.pinAssignments.map((pin) => `| ${pin.symbol} | ${pin.role === "analog_input" ? `A${pin.pin}` : `D${pin.pin}`} | ${pin.role} |`).join("\n");
  return `## 하드웨어 기준 (${approved})

- 보드: ${build.blueprint.board} · 전원 ${build.blueprint.supplyVoltage}V
- 부품: ${build.blueprint.components.map((c) => `${c.ref} ${c.valueOrModel}`).join(", ")}
- 펌웨어 동작: ${build.blueprint.firmware.behavior}

| 신호 | 핀 | 역할 |
|---|---|---|
${pins || "| - | - | - |"}

핀 배치와 전압은 HW 달그락과 사람이 정한 값이에요. 바꿔야 하면 코드에서 먼저 고치지 말고 달그락 대장간에 변경 제안으로 남겨요.`;
}

export function buildDevHandoff(project: LocalProject, spec: DevSpecInput): Array<{ filename: string; content: string }> {
  const profile = project.workflow?.devProfile ?? emptyDevProfile();
  const level = CODING_EXPERIENCE[profile.codingExperience];
  const specDoc = `# ${spec.title}

> 달그락 대장간 프로젝트 「${project.name}」의 소프트웨어 명세서 · SW 달그락 작성
> 달그락 프로젝트 ID: ${project.id}

## 무엇을 만드나요
${spec.goal}

## 왜 코드가 필요한가요
${spec.whyCode}

## 만들 코드
${spec.pieces.map((p) => `- **${p.name}** (${PIECE[p.kind]}): ${p.purpose}`).join("\n")}

## 기능
${spec.features.map((f) => `### ${f.name}\n${f.detail}`).join("\n\n")}

## 하드웨어와 주고받는 데이터
- 방식: ${TRANSPORT[spec.dataInterface.transport]}
- 형식: ${spec.dataInterface.format}

${hardwareSection(project)}

## 기술 선택
${spec.stack.map((s) => `- **${s.name}**: ${s.reason}`).join("\n")}

## 완료 기준
${list(spec.acceptance)}

## 이번에 하지 않는 것
${list(spec.outOfScope)}

## 진행 순서 (처음 하는 사람 기준)
${spec.learningSteps.map((s, i) => `${i + 1}. **${s.step}**\n   ${s.explain}`).join("\n")}
`;
  const rules = (tool: string) => `# ${tool} 작업 규칙 · ${project.name}

이 폴더는 달그락 대장간 프로젝트의 소프트웨어 작업 공간이에요. 먼저 \`SPEC.md\`를 끝까지 읽고 시작해요.

## 사용자
- 코딩 경험: ${level}
- 컴퓨터: ${{ unanswered: "확인 필요", mac: "Mac", windows: "Windows", linux: "Linux" }[profile.os]}
- 설치된 것: ${profile.installed.join(", ") || "확인 필요"}
- 경험 수준에 맞춰 설명해요. 명령어를 실행하기 전에 무엇을 하는 명령인지 한 줄로 말하고, 한 번에 한 단계씩 진행해요. 목표를 임의로 줄이지 않아요.

## 진행 방식
- SPEC.md의 "진행 순서"를 따라 작은 단계로 나눠 만들고, 단계마다 실행해서 확인해요.
- 하드웨어에서 확인해야 하는 것(업로드, 측정, 배선)은 사용자에게 구체적으로 요청하고, 결과를 듣기 전에는 동작한다고 말하지 않아요.
- 핀 배치와 전압은 SPEC.md의 하드웨어 기준을 따라요. 바꿔야 하면 사용자에게 먼저 묻고 달그락 대장간에 변경 제안으로 남겨요.
- API 키나 비밀번호는 코드에 넣지 말고 \`.env\` 파일로 분리해요.

## 달그락 대장간 연결 (커넥터가 연결된 경우)
- 시작할 때 \`get_project\`를 프로젝트 ID \`${project.id}\`로 호출해 최신 회로와 결정 사항을 확인해요.
- 의미 있는 진행이 있을 때마다 \`log_dev_progress\`로 한 일·다음 할 일·막힌 점을 남겨요. HW 달그락과 대시보드가 이 기록을 봐요.
`;
  return [
    { filename: "SPEC.md", content: specDoc },
    { filename: "CLAUDE.md", content: rules("Claude Code") },
    { filename: "AGENTS.md", content: rules("Codex") }
  ];
}

export type SetupStep = { title: string; detail: string; command?: string };

export function devSetupSteps(profile: DevProfile, project: Pick<LocalProject, "id">, connectorUrl: string | null): SetupStep[] {
  const windows = profile.os === "windows";
  const tool = profile.tool === "codex" ? "codex" : "claude_code";
  const has = (name: string) => profile.installed.includes(name);
  const beginner = profile.codingExperience === "none" || profile.codingExperience === "unanswered";
  const steps: SetupStep[] = [];
  steps.push({ title: windows ? "PowerShell 열기" : "터미널 열기", detail: windows ? "시작 메뉴에서 'PowerShell'을 검색해 열어요. 아래 명령어들은 여기에 붙여넣고 Enter를 눌러요." : profile.os === "mac" ? "Spotlight(⌘+Space)에서 '터미널'을 검색해 열어요. 아래 명령어들은 여기에 붙여넣고 Enter를 눌러요." : "터미널을 열어요. 아래 명령어들은 여기에 붙여넣고 Enter를 눌러요." });
  if (tool === "codex" && !has("Node.js")) steps.push({ title: "Node.js 설치", detail: "Codex는 Node.js 위에서 돌아가요. nodejs.org에서 LTS 버전을 내려받아 설치한 뒤 터미널을 다시 열어요." });
  if (tool === "claude_code") steps.push({ title: "Claude Code 설치", detail: "Claude 구독 계정으로 쓰는 코딩 도우미예요. 설치가 끝나면 처음 실행할 때 브라우저로 로그인해요.", command: windows ? "irm https://claude.ai/install.ps1 | iex" : "curl -fsSL https://claude.ai/install.sh | bash" });
  else steps.push({ title: "Codex 설치", detail: "ChatGPT 계정으로 쓰는 코딩 도우미예요. 처음 실행할 때 로그인해요.", command: "npm install -g @openai/codex" });
  steps.push({ title: "작업 폴더 만들기", detail: beginner ? "코드를 모아둘 폴더를 만들고 그 안으로 들어가요. cd는 '폴더로 이동'이라는 뜻이에요." : "작업 폴더를 만들어요.", command: "mkdir dalgeurak-sw\ncd dalgeurak-sw" });
  steps.push({ title: "명세서 넣기", detail: "작업대에서 SPEC.md, CLAUDE.md, AGENTS.md를 내려받아 방금 만든 dalgeurak-sw 폴더에 넣어요. 아직 없다면 Claude에게 'SW 명세서 만들어줘'라고 말해요." });
  if (connectorUrl) {
    if (tool === "claude_code") steps.push({ title: "달그락 대장간 연결", detail: "Claude Code가 이 프로젝트의 회로와 결정 사항을 읽고, 진행 상황을 대시보드에 남길 수 있게 해요.", command: `claude mcp add --transport http dalgeurak ${connectorUrl}` });
    else steps.push({ title: "달그락 대장간 연결 (선택)", detail: "~/.codex/config.toml 파일 맨 아래에 붙여넣어요. Codex 버전에 따라 원격 연결을 지원하지 않을 수 있어요. 안 되더라도 AGENTS.md만으로 작업은 진행돼요.", command: `[mcp_servers.dalgeurak]\nurl = "${connectorUrl}"` });
  }
  const prompt = `SPEC.md를 읽고 내 경험 수준에 맞춰 첫 단계부터 같이 진행해줘. 달그락 대장간 프로젝트 ID는 ${project.id}야.${connectorUrl ? " 시작할 때 get_project로 최신 상태를 확인하고, 진행할 때마다 log_dev_progress로 남겨줘." : ""}`;
  steps.push({ title: `${tool === "codex" ? "Codex" : "Claude Code"} 시작`, detail: "아래 명령으로 실행한 뒤, 첫 메시지로 다음 문장을 붙여넣어요.\n" + prompt, command: tool === "codex" ? "codex" : "claude" });
  return steps;
}
