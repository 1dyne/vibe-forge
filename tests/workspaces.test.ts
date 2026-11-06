import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import webpush from "web-push";
import { NextRequest } from "next/server";
import { checkLink, cliLink, fireRoutine, publicProject } from "../apps/web/lib/workspaces";
import { addPushSubscription, flushBatchesForTest, sentLog } from "../apps/web/lib/notify";
import { createUser } from "../apps/web/lib/users";
import { userSessionValue } from "../apps/web/lib/session";
import { POST as mcpPost } from "../apps/web/app/api/mcp/[token]/route";
import { POST as workflowPost } from "../apps/web/app/api/projects/[id]/workflow/route";
import { GET as listRoute } from "../apps/web/app/api/projects/route";

let folder: string;
beforeAll(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "forge-workspaces-test-"));
  vi.stubEnv("FORGE_TEST_NOTIFY_FILE", path.join(folder, "notify.json"));
  vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
  vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
  vi.stubEnv("SESSION_SECRET", "test-secret-for-workspaces-0123456789ab");
  vi.stubEnv("APP_BASE_URL", "https://forge.example");
  vi.stubEnv("APP_MODE", "mock");
  const keys = webpush.generateVAPIDKeys();
  vi.stubEnv("VAPID_PUBLIC_KEY", keys.publicKey); vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
});
afterAll(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await rm(folder, { recursive: true, force: true }); });
beforeEach(() => { sentLog.length = 0; flushBatchesForTest(); });

const FIRE = "https://api.anthropic.com/v1/claude_code/routines/trig_01ABCDEFGHJKLMNOPQRSTUVW/fire";
const TOKEN = "sk-ant-oat01-secretsecretsecret";

describe("workspace links", () => {
  it("only accepts links that open Claude, Claude Code or Codex", () => {
    expect(checkLink("claude_project", "https://claude.ai/project/0199aa-bb-cc-dd")).toBe("https://claude.ai/project/0199aa-bb-cc-dd");
    expect(() => checkLink("claude_project", "https://evil.example/project/x")).toThrow("주소 형식");
    expect(() => checkLink("code_cli", "javascript:alert(1)")).toThrow();
    expect(checkLink("codex", "codex://threads/abc123")).toBe("codex://threads/abc123");
    const cli = cliLink("1dyne/scale-web", "달그락 할 일 확인해");
    expect(cli.startsWith("claude-cli://open?repo=1dyne%2Fscale-web&q=")).toBe(true);
    expect(checkLink("code_cli", cli)).toBe(cli);
  });

  it("calls a routine with the documented headers and keeps only a Claude Code session address", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ type: "routine_fire", claude_code_session_url: "https://claude.ai/code/session_01AbCdEfGh" }), { status: 200 }); }) as unknown as typeof fetch;
    const result = await fireRoutine({ mode: "event", reason: "", setBy: "chief", at: "", deadlineMinutes: 30, fireUrl: FIRE, token: TOKEN }, "새 할 일", fake);
    expect(result).toEqual({ ok: true, status: 200, sessionUrl: "https://claude.ai/code/session_01AbCdEfGh" });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers).toMatchObject({ authorization: `Bearer ${TOKEN}`, "anthropic-beta": "experimental-cc-routine-2026-04-01", "anthropic-version": "2023-06-01" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ text: "새 할 일" });
    const odd = (async () => new Response(JSON.stringify({ claude_code_session_url: "https://evil.example/x" }), { status: 200 })) as unknown as typeof fetch;
    expect((await fireRoutine({ mode: "event", reason: "", setBy: "chief", at: "", deadlineMinutes: 30, fireUrl: FIRE, token: TOKEN }, "x", odd)).sessionUrl).toBeUndefined();
  });
});

describe("handing work to a coding agent", () => {
  it("lets the chief choose event mode, fires the routine for new agent tasks and never shows the token", async () => {
    const { token, user } = await createUser("이벤트 사용자", false);
    await addPushSubscription(user.id, { endpoint: "https://push.example/a", keys: { p256dh: "x", auth: "y" } });
    const cookie = "dalgeurak_session=" + userSessionValue(token);
    let id = 0;
    const tool = async (name: string, args: Record<string, unknown>) => (await (await mcpPost(new NextRequest(`http://localhost:3000/api/mcp/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) }), { params: Promise.resolve({ token }) })).json()).result;
    const created = await tool("create_project", { idea: "무게로 수량을 세는 저울", plan: { projectName: "저울", oneLiner: "저울", reply: "r", slotUpdates: [{ key: "power", status: "assumed", valueText: null, assumption: "USB", acknowledged: false }], tasks: [] } });
    const projectId = created.structuredContent.id as string;
    const act = async (body: unknown) => { const r = await workflowPost(new NextRequest(`http://localhost:3000/api/projects/${projectId}/workflow`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: projectId }) }); return { status: r.status, ...(await r.json()) }; };

    const chosen = await tool("set_wake_mode", { projectId, mode: "event", reason: "사람이 화면 시안을 기다리고 있어요" });
    expect(chosen.structuredContent.wake).toMatchObject({ mode: "event", eventReady: false });
    expect(chosen.structuredContent.routinePrompt).toContain(projectId);

    // Not connected yet: the person hears that Code could not be woken.
    const first = await tool("upsert_task", { projectId, by: "chief", assignee: "sw", kind: "code", title: "웹 뼈대", plain: "측정 화면" });
    expect(first.content[0].text).toContain("깨우지 못했어요");
    expect(sentLog.at(-1)!.title).toContain("Code를 깨우지 못했어요");

    expect((await act({ action: "wake_connect", fireUrl: "https://example.com/fire", token: TOKEN })).status).toBe(409);
    const connected = await act({ action: "wake_connect", fireUrl: FIRE, token: TOKEN });
    expect(connected.status).toBe(200);
    expect(JSON.stringify(connected.project)).not.toContain(TOKEN);
    const listed = await (await listRoute(new NextRequest("http://localhost:3000/api/projects", { headers: { cookie } }))).json();
    expect(JSON.stringify(listed)).not.toContain(TOKEN);
    expect(JSON.stringify(await tool("get_project", { projectId }))).not.toContain(TOKEN);
    // On disk it is sealed with the person's key, so not readable as text either.
    expect(await readFile(path.join(folder, "projects.json"), "utf8")).not.toContain(TOKEN);

    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(url).toBe(FIRE);
      expect(JSON.parse(String(init.body)).text).toContain("웹앱 저장");
      return new Response(JSON.stringify({ claude_code_session_url: "https://claude.ai/code/session_01XyZaBcDeF" }), { status: 200 });
    });
    const second = await tool("upsert_task", { projectId, by: "chief", assignee: "sw", kind: "code", title: "웹앱 저장", plain: "CSV 내보내기" });
    vi.unstubAllGlobals();
    expect(second.content[0].text).toContain("바로 깨웠어요");
    const read = await tool("get_project", { projectId });
    expect(read.structuredContent.workspaces.links).toEqual([expect.objectContaining({ role: "sw", kind: "code_cloud", url: "https://claude.ai/code/session_01XyZaBcDeF" })]);
    const deadlines = JSON.parse(await readFile(path.join(folder, "notify.json"), "utf8")).deadlines;
    expect(deadlines.some((d: { taskId: string }) => d.taskId === second.structuredContent.taskId)).toBe(true);
    // The session taking the task clears the no-response deadline.
    await tool("update_task", { projectId, by: "sw", taskId: second.structuredContent.taskId, status: "in_progress", session: "https://claude.ai/code/session_01XyZaBcDeF" });
    expect(JSON.parse(await readFile(path.join(folder, "notify.json"), "utf8")).deadlines.some((d: { taskId: string }) => d.taskId === second.structuredContent.taskId)).toBe(false);

    const linked = await act({ action: "link_add", role: "chief", kind: "claude_project", url: "https://claude.ai/project/0199aa-bb-cc-dd" });
    expect(linked.project.workflow.links.some((l: { role: string }) => l.role === "chief")).toBe(true);
    expect((await act({ action: "link_add", role: "chief", kind: "claude_project", url: "https://claude.ai.evil.example/project/x" })).status).toBe(409);
    const cli = await tool("register_session", { projectId, by: "hw", kind: "code_cli", repo: "1dyne/scale-fw" });
    expect(cli.structuredContent.link.url).toMatch(/^claude-cli:\/\/open\?repo=1dyne%2Fscale-fw/);
    expect(publicProject(null)).toBeNull();
  });
});
