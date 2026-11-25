import { buildInstructions, friendly, listModels, runTurn, TurnError } from "./agent.mjs";
import * as dalgrak from "./dalgrak.mjs";
import * as openai from "./openai-auth.mjs";
import { read, write } from "./store.mjs";

// 달그락 서버에 "할 일 있나요?"를 계속 묻고, 일이 오면 이 컴퓨터에서 답을 만들어
// 조금씩 올려보낸다. 나가는 연결만 쓰므로 공유기 설정이나 포트 개방이 필요 없다.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function pickModel() {
  const preferred = process.env.DALGRAK_MODEL || read("settings.json")?.model;
  const models = await listModels(await openai.accessToken());
  if (!models.length) throw new TurnError("no_models", "이 ChatGPT 계정에서 쓸 수 있는 모델이 없어요.");
  return (models.find((m) => m.slug === preferred) ?? models[0]).slug;
}

export const setModel = (slug) => write("settings.json", { ...(read("settings.json") ?? {}), model: slug });

async function report(jobId, events) {
  if (!events.length) return;
  try { await dalgrak.call(`/api/helper/jobs/${jobId}`, { events }); } catch { /* 화면 전달 실패는 대화를 멈추지 않는다 */ }
}

async function handle(job, context, log) {
  let pending = [];
  let flushing = Promise.resolve();
  const flush = () => { const batch = pending; pending = []; flushing = flushing.then(() => report(job.id, batch)); return flushing; };
  const timer = setInterval(() => { if (pending.length) void flush(); }, 350);
  const push = (event) => {
    const last = pending.at(-1);
    if (event.type === "delta" && last?.type === "delta" && last.text.length < 4000) last.text += event.text;
    else pending.push(event);
    if (pending.length >= 40) void flush();
  };
  try {
    const text = await runTurn({
      job, model: context.model, tools: context.tools,
      instructions: buildInstructions({ serverInstructions: context.serverInstructions, guide: context.guide, job }),
      getToken: openai.accessToken, callTool: dalgrak.mcp.callTool,
      onDelta: (delta) => push({ type: "delta", text: delta }),
      onStatus: (status) => push({ type: "status", text: status.slice(0, 200) })
    });
    push({ type: "done", text: (text || "답변이 비어 있어요. 다시 말씀해주세요.").slice(0, 20000) });
    log(`답변 완료 (${text.length}자)`);
  } catch (error) {
    const code = error?.code ?? "helper_error";
    log(`답변 실패: ${code}`);
    push({ type: "error", code: String(code).slice(0, 80), message: friendly(code, error instanceof TurnError ? error.message : undefined).slice(0, 500) });
  } finally {
    clearInterval(timer);
    await flush();
  }
}

export async function prepare(version) {
  const init = await dalgrak.mcp.initialize(version);
  const tools = await dalgrak.mcp.listTools();
  // 긴 사용 규칙은 한 번 읽어 매 턴의 지침에 넣는다. 모델이 "읽으러 가는 것"에 기대지 않는다.
  const guide = tools.some((tool) => tool.name === "dalgeurak_guide") ? (await dalgrak.mcp.callTool("dalgeurak_guide", {})).text : "";
  return { serverInstructions: init.instructions ?? "", tools: tools.filter((tool) => tool.name !== "dalgeurak_guide"), guide, model: await pickModel() };
}

export async function serve({ version, log = console.log, signal }) {
  let context = await prepare(version);
  let preparedAt = Date.now();
  log(`준비됐어요. 모델: ${context.model} · 달그락 도구 ${context.tools.length}개`);
  log("이 창을 켜 둔 동안 달그락 대장간(어느 기기에서든)에서 대화할 수 있어요.");
  let failures = 0;
  while (!signal?.aborted) {
    try {
      const hello = { model: context.model, version, account: openai.account()?.email ?? null };
      const response = await dalgrak.call("/api/helper/poll", hello, { timeoutMs: 40_000 });
      if (!response.ok) throw new Error(`poll ${response.status}`);
      failures = 0;
      const { job } = await response.json();
      if (!job) continue;
      // 서버의 도구나 규칙이 바뀌었을 수 있으니 가끔 다시 읽는다.
      if (Date.now() - preparedAt > 30 * 60_000) { try { context = await prepare(version); preparedAt = Date.now(); } catch { /* 이전 것을 쓴다 */ } }
      log(`새 메시지 (${job.projectName ?? "새 프로젝트"})`);
      await handle(job, context, log);
    } catch (error) {
      if (signal?.aborted) break;
      if (error?.code === "signed_out") { log(error.message); throw error; }
      failures++;
      await sleep(Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)));
    }
  }
}
