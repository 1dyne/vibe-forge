import type { LocalProject } from "./project-types";
import type { PublicUser } from "./users";

// 달그락 도구를 여러 파일로 나눠 쓰기 위한 공용 판. mcp-tools.ts가 너무 커져서,
// 새 도구 묶음은 lib/tools/ 아래 파일에 두고 여기 것만 가져다 쓴다(mcp-tools를 직접
// import하면 서로 물려서 순서 문제가 난다). mcp-tools.ts가 시작할 때 kit을 채운다.
export type ToolContext = { user: PublicUser; dashboardUrl: string };
export type ToolResult = { text: string; data?: unknown };
export type ToolDefinition = { name: string; title: string; description: string; inputSchema: Record<string, unknown>; annotations?: Record<string, boolean>; run: (input: unknown, context: ToolContext) => Promise<ToolResult> };

/** 사용자(모델)에게 그대로 보여줄 거절. 이유와 고칠 방법을 한국어 존댓말로 적는다 */
export class ToolError extends Error {}

/** 모든 도구 inputSchema의 projectId 속성 */
export const projectIdSchema = { type: "string", description: "프로젝트 ID (list_projects 또는 create_project 결과)" };

export const kit: {
  /** 내 프로젝트인지 확인하고 읽는다. 아니면 ToolError */
  ownedProject: (id: string, context: ToolContext) => Promise<LocalProject>;
  /** 저장 뒤의 표준 응답: 메시지 + 다음 할 일 + 작업대 요약 + 프로젝트 요약 데이터 */
  stored: (project: LocalProject, context: ToolContext, message: string) => ToolResult;
} = {
  ownedProject: () => { throw new Error("tool kit is not ready"); },
  stored: () => { throw new Error("tool kit is not ready"); }
};
