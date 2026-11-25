import { RESOURCE } from "./openai-auth.mjs";

// 한 번의 대화 턴. 사용자의 ChatGPT 요금제로 Responses API를 부르고, 모델이 달그락
// 도구를 부르면 달그락 서버에 그대로 전해 결과를 돌려준다. 설계 규칙과 검사는 전부
// 달그락 서버의 도구 안에 있고, 여기서는 말을 주고받는 일만 한다.
//
// 요금제 사용 경로의 제약(미리보기): store:false, stream:true 필수. 대화 상태를 서버에
// 두지 않으므로 필요한 맥락을 매번 input으로 보낸다. max_output_tokens·temperature 등은
// 보내지 않는다. 함수 도구는 네임스페이스로 묶는다.

const MAX_ROUNDS = 24;
export const USAGE_URL = "https://chatgpt.com/settings/usage";

export class TurnError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const FRIENDLY = {
  subscription_sharing_usage_limit_exceeded: `ChatGPT 요금제 사용 한도에 닿았어요. ChatGPT 설정의 사용량(${USAGE_URL})에서 한도를 확인해주세요.`,
  subscription_sharing_usage_unavailable: "지금은 ChatGPT 사용량을 확인할 수 없어요. 잠시 후 다시 보내주세요.",
  subscription_sharing_user_unavailable: "ChatGPT 계정 정보를 잠시 불러올 수 없어요. 잠시 후 다시 보내주세요.",
  subscription_sharing_user_not_eligible: "이 ChatGPT 계정이나 워크스페이스에서는 요금제 사용이 허용되지 않아요.",
  subscription_sharing_invalid_user: "ChatGPT 연결을 확인하지 못했어요. 도우미에서 다시 로그인해주세요.",
  signed_out: "ChatGPT 연결이 끊겼어요. 컴퓨터의 달그락 도우미에서 다시 로그인해주세요."
};
export const friendly = (code, fallback) => FRIENDLY[code] ?? fallback ?? "답변을 만들지 못했어요. 잠시 후 다시 보내주세요.";

/** 달그락 MCP 도구 목록을 Responses의 네임스페이스 하나로 묶는다. */
export function toNamespace(tools) {
  return {
    type: "namespace",
    name: "dalgrak",
    description: "달그락 대장간: 하드웨어 제작 프로젝트의 설계·회로·형태·조립 가이드·할 일을 기록하고 서버 검사를 받는 도구",
    tools: tools.map((tool) => ({ type: "function", name: tool.name, description: String(tool.description ?? "").slice(0, 4000), parameters: tool.inputSchema ?? { type: "object", properties: {} }, strict: false }))
  };
}

export function buildInstructions({ serverInstructions, guide, job }) {
  return [
    "너는 달그락 대장간 화면 안에서 사용자와 직접 대화하는 달그락 팀이다. 사용자는 하드웨어를 처음 만드는 비개발자일 수 있다. 사용자는 네가 제시하는 흐름을 따라가며 확인·승인·구매·조립·측정만 하면 되어야 한다.",
    "사용자는 지금 달그락 대장간 화면을 보고 있다. 설계도·회로·3D·파일은 같은 화면의 작업대에 나타난다. 다른 앱으로 가라고 하지 않는다.",
    "설계에 관한 사실은 말로만 하지 말고 반드시 dalgrak 도구로 기록한다. 도구가 거절하면 이유를 읽고 고쳐 다시 부른다. 거절된 것을 된 것처럼 말하지 않는다.",
    "도구 결과가 'Claude 프로젝트 지침에 붙여넣으라'거나 '커넥터를 켜라'고 안내해도, 이 화면에서는 이미 연결돼 있으므로 사용자에게 전하지 않는다.",
    "한 번에 질문은 두 개 이하로 하고, 고를 수 있는 것은 번호가 붙은 선택지로 묻는다. 답은 짧은 문단으로 나누어 쓴다.",
    job.projectId
      ? `지금 열려 있는 달그락 프로젝트 ID: ${job.projectId}${job.projectName ? ` (${job.projectName})` : ""}. 모든 도구 호출에 이 ID를 쓴다. 이 대화의 첫 도구 호출 전에 get_project로 현재 단계와 다음 할 일을 확인한다.`
      : "지금은 열린 프로젝트가 없다. 사용자가 만들고 싶은 것을 말하면 create_project로 새 프로젝트를 만들고 이어간다. 인사나 질문뿐이면 프로젝트를 만들지 않는다.",
    job.channel && !["main", "chief"].includes(job.channel) ? `이 대화는 ${job.channel.toUpperCase()} 달그락의 작업실이다. 그 역할로만 답한다.` : "이 대화는 메인 방이다. 대장 달그락으로서 전체 흐름을 이끈다.",
    serverInstructions ? `# 달그락 대장간 서버 안내\n${serverInstructions}` : "",
    guide ? `# 달그락 대장간 사용 규칙\n${guide}` : ""
  ].filter(Boolean).join("\n\n");
}

/** SSE 본문을 사건 단위로 읽는다. */
export async function* sse(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let index;
    while ((index = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + (buffer[index] === "\r" ? 4 : 2));
      const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
      if (!data || data === "[DONE]") continue;
      try { yield JSON.parse(data); } catch { /* 깨진 줄은 건너뛴다 */ }
    }
  }
}

async function respond({ token, body, onDelta, fetchImpl, signal }) {
  const response = await fetchImpl(`${RESOURCE}/responses`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body), signal });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))).error ?? {};
    throw Object.assign(new TurnError(error.code ?? (response.status === 401 ? "unauthorized" : `http_${response.status}`), error.message ?? `요청이 거절됐어요 (${response.status}).`), { status: response.status, param: error.param ?? null });
  }
  let completed = null;
  for await (const event of sse(response.body)) {
    if (event.type === "response.output_text.delta") onDelta(event.delta);
    else if (event.type === "response.completed") completed = event.response;
    else if (event.type === "response.failed") throw Object.assign(new TurnError(event.response?.error?.code ?? "response_failed", event.response?.error?.message ?? "답변이 중간에 실패했어요."), { param: event.response?.error?.param ?? null });
    else if (event.type === "response.incomplete") throw new TurnError("incomplete", "답변이 끝까지 만들어지지 않았어요. 요청을 나누어 다시 보내주세요.");
    else if (event.type === "error") throw Object.assign(new TurnError(event.code ?? event.error?.code ?? "stream_error", event.message ?? event.error?.message ?? "답변 중 오류가 났어요."), { param: event.param ?? null });
  }
  if (!completed) throw new TurnError("stream_ended", "답변이 끝나기 전에 연결이 끊겼어요. 다시 보내주세요.");
  return completed;
}

const textOf = (output) => output.filter((item) => item.type === "message").flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text).join("");

/**
 * @param {{ job: {text:string, history:Array<{role:string,text:string}>, projectId:string|null, projectName:string|null, channel:string},
 *   model: string, instructions: string, tools: Array<object>, getToken: (o?:{force?:boolean})=>Promise<string>,
 *   callTool: (name:string, args:object)=>Promise<{ok:boolean,text:string}>, onDelta:(t:string)=>void, onStatus:(t:string)=>void,
 *   fetchImpl?: typeof fetch, signal?: AbortSignal }} options
 * @returns {Promise<string>} 화면에 남길 최종 답
 */
export async function runTurn({ job, model, instructions, tools, getToken, callTool, onDelta, onStatus, fetchImpl = fetch, signal }) {
  const input = [
    ...job.history.filter((m) => m.text?.trim()).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text })),
    { role: "user", content: job.text }
  ];
  const titles = new Map(tools.map((tool) => [tool.name, tool.title ?? tool.name]));
  const namespace = toNamespace(tools);
  let withReasoning = true;
  let refreshed = false;
  let full = "";
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const body = { model, instructions, input, tools: [namespace], store: false, stream: true, ...(withReasoning ? { include: ["reasoning.encrypted_content"] } : {}) };
    let streamed = "";
    let response;
    try {
      response = await respond({ token: await getToken(), body, fetchImpl, signal, onDelta: (delta) => { if (!streamed && full) onDelta("\n\n"); streamed += delta; onDelta(delta); } });
    } catch (error) {
      // 아직 아무것도 흘려보내지 않았을 때만 조용히 다시 한다.
      if (error instanceof TurnError && !streamed) {
        if ((error.status === 401 || error.code === "unauthorized") && !refreshed) { refreshed = true; await getToken({ force: true }); round--; continue; }
        if (error.code === "subscription_sharing_unsupported_capability" && withReasoning && String(error.param ?? "").startsWith("include")) {
          withReasoning = false;
          for (let i = input.length - 1; i >= 0; i--) if (input[i].type === "reasoning") input.splice(i, 1);
          round--; continue;
        }
      }
      throw error;
    }
    const output = response.output ?? [];
    const text = textOf(output) || streamed;
    if (text) full += (full ? "\n\n" : "") + text;
    const calls = output.filter((item) => item.type === "function_call");
    if (!calls.length) return full;
    input.push(...output.filter((item) => withReasoning || item.type !== "reasoning"));
    for (const call of calls) {
      onStatus(titles.get(call.name) ?? call.name);
      let args = {};
      let result;
      try { args = call.arguments ? JSON.parse(call.arguments) : {}; } catch { result = { ok: false, text: "[도구 오류] 인자가 JSON 형식이 아니에요. 형식을 고쳐 다시 불러주세요." }; }
      result ??= await callTool(call.name, args);
      input.push({ type: "function_call_output", call_id: call.call_id, output: result.text });
    }
  }
  throw new TurnError("too_many_steps", "한 번에 처리할 단계가 너무 많아 멈췄어요. 이어서 하자고 말해주세요.");
}

/** 이 계정이 쓸 수 있는 모델 가운데 화면에 보일 것들. 서버가 준 순서를 그대로 둔다. */
export async function listModels(token, fetchImpl = fetch) {
  const response = await fetchImpl(`${RESOURCE}/models`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new TurnError(response.status === 401 ? "unauthorized" : `http_${response.status}`, "모델 목록을 불러오지 못했어요.");
  const body = await response.json();
  return (body.models ?? body.data ?? []).filter((m) => (m.visibility ?? "list") === "list").map((m) => ({ slug: m.slug ?? m.id, name: m.display_name ?? m.slug ?? m.id })).filter((m) => m.slug);
}
