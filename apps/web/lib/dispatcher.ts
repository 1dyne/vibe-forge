import { randomUUID } from "node:crypto";
import { boardOf, markDispatched, nextDispatch } from "./board";
import { enqueueJob, hasActiveJob, helperStatus } from "./helper-relay";
import { listProjects, mutateProject } from "./local-project-store";
import type { ChatChannel } from "./project-types";
import { workflowFor } from "./workflow";

// 대장의 자동 진행. 사람이 "달그락들에게 맡기기"를 켜 둔 프로젝트에서, 연결 앱이 한가하면
// 다음 일을 담당 달그락의 대장간에 넘긴다. 한 번에 하나씩만 넘긴다(한 사람의 요금제를
// 여러 달그락이 동시에 쓰지 않게, 그리고 앞 일의 결과를 보고 다음 일을 고르게).
//
// 부르는 곳: 연결 앱이 한 턴을 끝냈을 때, 사람이 카드에 답했을 때, 자동 진행을 켰을 때,
// 수정안이 승인됐을 때, 연결 앱이 할 일을 물으러 왔을 때. 호출하는 쪽이 그 사람의
// 기록을 열 수 있는 상태(withVault)여야 한다.
export async function dispatchForUser(userId: string): Promise<{ projectId: string; room: string } | null> {
  if (!helperStatus(userId).online || hasActiveJob(userId)) return null;
  const now = new Date().toISOString();
  const projects = await listProjects(userId);
  for (const project of projects) {
    const team = workflowFor(project).activeAgents;
    const next = nextDispatch(boardOf(project), team, now);
    if (!next) continue;
    const channel: ChatChannel = next.room === "chief" ? "main" : next.room;
    await mutateProject(project.id, (p) => {
      // 그 사이 다른 요청이 먼저 넘겼을 수 있으니 저장 직전에 다시 고른다.
      const again = nextDispatch(boardOf(p), workflowFor(p).activeAgents, now);
      if (!again || again.room !== next.room || again.cardId !== next.cardId) throw new SkipDispatch();
      p.board = markDispatched(boardOf(p), again, now);
      p.messages.push({ id: randomUUID(), role: "user", channel, text: again.text, createdAt: now, auto: true });
    }).catch((error) => { if (!(error instanceof SkipDispatch)) throw error; });
    if (hasActiveJob(userId)) return null;
    try { enqueueJob({ userId, projectId: project.id, channel, text: next.text }); } catch { return null; }
    return { projectId: project.id, room: next.room };
  }
  return null;
}
class SkipDispatch extends Error {}
