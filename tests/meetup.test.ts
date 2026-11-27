import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST as mcpPost } from "../apps/web/app/api/mcp/[token]/route";
import { POST as workflowPost } from "../apps/web/app/api/projects/[id]/workflow/route";
import { POST as chatPost } from "../apps/web/app/api/helper/chat/route";
import { POST as finishPost } from "../apps/web/app/api/meetup/finish/route";
import { POST as inboxPost } from "../apps/web/app/api/meetup/inbox/route";
import { GET as startGet } from "../apps/web/app/api/meetup/start/route";
import { POST as ideaPost } from "../apps/web/app/api/find/meetup-idea/route";
import { createUser } from "../apps/web/lib/users";
import { userSessionValue } from "../apps/web/lib/session";
import { MEETUP_FINISH, isMeetup, meetupLetterIds, meetupPrompt, parseMeetupLetter } from "../apps/web/lib/meetup";
import type { LocalProject } from "../apps/web/lib/project-types";

// MEETUP: 2026-11-28 밋업 시연 모드. 밋업이 끝나 lib/meetup.ts를 지울 때 이 파일도 같이 지운다.
const SECRET = "test-secret-for-meetup-mode-0123456789abcdef";
let folder: string;

describe("밋업 시연 모드", () => {
  beforeAll(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "forge-meetup-"));
    vi.stubEnv("FORGE_TEST_DATA_FILE", path.join(folder, "projects.json"));
    vi.stubEnv("FORGE_TEST_USERS_FILE", path.join(folder, "users.json"));
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("APP_BASE_URL", "https://forge.example");
  });
  afterAll(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });

  it("아이디어는 AI 없이 적히고, 설계는 잠기고, 완성을 누르면 편지가 온다", async () => {
    const { token } = await createUser("밋업 테스트", false);
    let n = 0;
    const tool = async (name: string, args: Record<string, unknown>) => (await (await mcpPost(new NextRequest(`http://localhost/api/mcp/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }) }), { params: Promise.resolve({ token }) })).json()).result as { content: Array<{ text: string }>; structuredContent?: Record<string, any>; isError?: boolean };
    const seed = JSON.parse(await readFile(path.join(__dirname, "..", "apps", "web", "lib", "bench", "sam-seed.json"), "utf8")) as { calls: Array<{ tool: string; args: Record<string, unknown> }> };
    let id = "";
    for (const call of seed.calls) {
      const result = await tool(call.tool, JSON.parse(JSON.stringify(call.args).replaceAll("$PROJECT", id)));
      expect(result.isError, `${call.tool}: ${result.content?.[0]?.text}`).toBeFalsy();
      if (call.tool === "create_project") id = result.structuredContent!.id as string;
    }

    // 다른 프로젝트는 시연 모드가 아니다
    const other = await tool("create_project", { idea: "창문이 열리면 알려주는 센서", plan: { projectName: "창문 알리미", oneLiner: "창문 센서", reply: "좋아요", slotUpdates: [], tasks: [] } });
    expect(isMeetup({ idea: "창문이 열리면 알려주는 센서" })).toBe(false);
    expect(other.isError).toBeFalsy();

    // 시드가 끝난 뒤에는 설계를 바꾸는 도구가 거절된다
    const circuit = seed.calls.find((c) => c.tool === "submit_circuit")!;
    const blocked = await tool("submit_circuit", JSON.parse(JSON.stringify(circuit.args).replaceAll("$PROJECT", id)));
    expect(blocked.isError).toBe(true);
    expect(blocked.content[0].text).toContain("밋업 시연용");
    expect((await tool("get_project", { projectId: id })).isError).toBeFalsy();

    const cookie = "dalgeurak_session=" + userSessionValue(token);
    const headers = { "content-type": "application/json", origin: "http://localhost:3000", cookie };
    const act = async (body: unknown) => (await workflowPost(new NextRequest(`http://localhost:3000/api/projects/${id}/workflow`, { method: "POST", headers, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })).json();
    for (const action of ["approve_circuit", "approve_mockup", "enter_workshop"]) expect((await act({ action })).error).toBeUndefined();

    // 연결 앱이 꺼져 있어도 아이디어는 바로 적힌다
    const say = async (text: string) => (await chatPost(new NextRequest("http://localhost:3000/api/helper/chat", { method: "POST", headers, body: JSON.stringify({ projectId: id, text, channel: "main" }) }))).json() as Promise<{ jobId: string | null; project: LocalProject; error?: string }>;
    const one = await say("배터리로 들고 다닐 수 있으면 좋겠어요");
    expect(one.error).toBeUndefined();
    expect(one.jobId).toBeNull();
    expect(one.project.messages.at(-1)!.text).toContain("1번째 현장 아이디어");
    const two = await say("앱에서 엑셀로 바로 내보내고 싶어요");
    expect(two.project.meetup!.ideas.map((i) => i.text)).toEqual(["배터리로 들고 다닐 수 있으면 좋겠어요", "앱에서 엑셀로 바로 내보내고 싶어요"]);
    expect(meetupPrompt(two.project)).toContain("2. 앱에서 엑셀로 바로 내보내고 싶어요");

    // 로그인 없는 사람의 아이디어: 주인의 화면이 열려 있을 때만 받고, 주인의 화면이 가져가서 적는다
    const drop = async (body: unknown) => ideaPost(new NextRequest("http://localhost:3000/api/find/meetup-idea", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify(body) }));
    const inbox = async () => (await inboxPost(new NextRequest("http://localhost:3000/api/meetup/inbox", { method: "POST", headers, body: JSON.stringify({ projectId: id }) }))).json() as Promise<{ code: string; project: LocalProject | null; added?: number }>;
    expect((await drop({ code: "0123abcd", text: "받는 화면이 없는 주소" })).status).toBe(409);
    const opened = await inbox();
    expect(opened.code).toMatch(/^[0-9a-f]{8}$/);
    expect(opened.project).toBeNull();
    expect((await drop({ code: opened.code, text: "방수가 되면\n**좋겠어요**", name: "하늘" })).status).toBe(200);
    expect((await drop({ code: opened.code, text: "x" })).status).toBe(400);
    const taken = await inbox();
    expect(taken.added).toBe(1);
    expect(taken.project!.meetup!.ideas.at(-1)!.text).toBe("하늘: 방수가 되면 좋겠어요");
    expect((await inbox()).project).toBeNull();

    // 완성: 연결 앱이 없으면 정해진 기준의 편지가 바로 온다. 축하 → 편지 → 아이디어마다 조언
    const finish = async () => (await finishPost(new NextRequest("http://localhost:3000/api/meetup/finish", { method: "POST", headers, body: JSON.stringify({ projectId: id, channel: "main" }) }))).json() as Promise<{ jobId: string | null; project: LocalProject }>;
    const done = await finish();
    expect(done.jobId).toBeNull();
    const letter = done.project.messages.at(-1)!;
    expect(done.project.messages.at(-2)!.text).toBe(MEETUP_FINISH);
    expect(letter.agent).toBe("chief");
    expect(letter.text.indexOf("축하")).toBeLessThan(letter.text.indexOf("편지를 하나 준비했어요"));
    expect(letter.text).toContain("**1번째 아이디어** — 배터리로 들고 다닐 수 있으면 좋겠어요");
    expect(letter.text).toContain("전자회로 달그락");
    expect(letter.text).toContain("**3번째 아이디어** — 하늘: 방수가 되면 좋겠어요");
    expect(letter.text).toContain("소프트웨어 달그락");
    // 편지는 채팅 안에서 카드로 그린다: 인사 / 아이디어별 (설계 더하기 · 해 볼 것) / 맺음말
    expect([...meetupLetterIds(done.project)]).toEqual([letter.id]);
    const parts = parseMeetupLetter(letter.text);
    expect(parts.intro.join(" ")).toContain("편지를 하나 준비했어요");
    expect(parts.ideas.map((i) => i.title)).toEqual(["배터리로 들고 다닐 수 있으면 좋겠어요", "앱에서 엑셀로 바로 내보내고 싶어요", "하늘: 방수가 되면 좋겠어요"]);
    expect(parts.ideas.every((i) => i.design && i.tryIt)).toBe(true);
    expect(parts.outro[0]).toContain("수고했어요");
    // AI가 쓴 편지도 같은 모양이면 읽힌다 (굵은 글씨·점 모양이 조금 달라도)
    const ai = parseMeetupLetter("축하해요!\n\n편지를 하나 준비했어요.\n\n**1번째 아이디어** — 방수가 되면 좋겠어요\n- **더 들어가야 할 설계:** 기구설계 달그락(ME). 틈을 막아야 해서요.\n- 해 볼 것: 테이프로 틈을 막고 물을 한 방울 떨어뜨려 봐요.\n\n2번째 아이디어: 소리로 알려 주기\n• 더 들어가야 할 설계: 전자회로 달그락(EE)\n• 해볼 것: 부저 하나를 따로 울려 봐요.\n\n다음에 또 만나요!");
    expect(ai.ideas).toHaveLength(2);
    expect(ai.ideas[0].design).toContain("기구설계");
    expect(ai.ideas[1].tryIt).toContain("부저");
    expect(ai.outro).toEqual(["다음에 또 만나요!"]);
    // 한 번 더 눌러도 '완성했어요'가 겹쳐 쌓이지 않는다
    const again = await finish();
    expect(again.project.messages.filter((m) => m.text === MEETUP_FINISH)).toHaveLength(1);
    // 받기 주소: 다른 참여자가 열면 자기 계정에 같은 시연 프로젝트가 생기고, 다시 열어도 하나뿐이다
    const guest = await createUser("밋업 참여자", false);
    const guestCookie = "dalgeurak_session=" + userSessionValue(guest.token);
    const start = async () => startGet(new NextRequest("http://localhost:3000/api/meetup/start", { headers: { cookie: guestCookie } }));
    const first = await start();
    expect(first.status).toBe(303);
    const where = new URL(first.headers.get("location")!).searchParams.get("p");
    expect(where).toMatch(/^[0-9a-f-]{36}$/);
    expect(where).not.toBe(id);
    expect(new URL((await start()).headers.get("location")!).searchParams.get("p")).toBe(where);
    // 참여자의 기록은 그 사람의 열쇠로 잠겨 있으므로, 그 사람의 연결로 읽어 본다
    const asGuest = async (name: string, args: Record<string, unknown>) => (await (await mcpPost(new NextRequest(`http://localhost/api/mcp/${guest.token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), { params: Promise.resolve({ token: guest.token }) })).json()).result as { structuredContent?: Record<string, any>; isError?: boolean };
    const list = (await asGuest("list_projects", {})).structuredContent!.projects as Array<{ id: string; name: string }>;
    expect(list.map((p) => p.name)).toEqual(["사만다 재고 저울"]);
    const theirs = (await asGuest("get_project", { projectId: where })).structuredContent!;
    expect(theirs.assembly.steps).toHaveLength(6);
    expect(theirs.testPlan.cases).toHaveLength(6);
    expect((await asGuest("set_test_plan", { projectId: where, cases: [] })).isError).toBe(true);

    // 설계는 그대로다
    expect(again.project.build!.blueprint.components!.map((c) => c.ref)).toEqual(["U1", "HX1", "LC1"]);
  });
});
