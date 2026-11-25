import assert from "node:assert/strict";
import { test } from "node:test";
import { runTurn, sse, toNamespace, TurnError } from "../src/agent.mjs";

const stream = (events) => new Response(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
const job = { text: "버튼 누르면 불 켜지는 걸 만들고 싶어", history: [{ role: "assistant", text: "안녕하세요" }], projectId: "p1", projectName: "테스트", channel: "main" };
const tools = [{ name: "get_project", title: "프로젝트 읽기", description: "읽는다", inputSchema: { type: "object", properties: { projectId: { type: "string" } }, required: ["projectId"] } }];

test("도구를 부르고, 그 결과를 넣어 다시 물은 뒤 답을 끝낸다", async () => {
  const bodies = [];
  const replies = [
    stream([
      { type: "response.output_text.delta", delta: "확인해볼게요." },
      { type: "response.completed", response: { output: [
        { type: "reasoning", id: "rs_1", encrypted_content: "x" },
        { type: "message", content: [{ type: "output_text", text: "확인해볼게요." }] },
        { type: "function_call", name: "get_project", namespace: "dalgrak", call_id: "c1", arguments: "{\"projectId\":\"p1\"}" }
      ] } }
    ]),
    stream([
      { type: "response.output_text.delta", delta: "지금은 " },
      { type: "response.output_text.delta", delta: "아이디어 단계예요." },
      { type: "response.completed", response: { output: [{ type: "message", content: [{ type: "output_text", text: "지금은 아이디어 단계예요." }] }] } }
    ])
  ];
  const deltas = []; const statuses = []; const called = [];
  const text = await runTurn({
    job, model: "m", instructions: "i", tools,
    getToken: async () => "tok",
    callTool: async (name, args) => { called.push([name, args]); return { ok: true, text: "phase: brainstorm" }; },
    onDelta: (d) => deltas.push(d), onStatus: (s) => statuses.push(s),
    fetchImpl: async (url, init) => { bodies.push(JSON.parse(init.body)); assert.equal(init.headers.authorization, "Bearer tok"); return replies.shift(); }
  });
  assert.equal(text, "확인해볼게요.\n\n지금은 아이디어 단계예요.");
  assert.equal(deltas.join(""), text);
  assert.deepEqual(called, [["get_project", { projectId: "p1" }]]);
  assert.deepEqual(statuses, ["프로젝트 읽기"]);
  // 요금제 사용 경로의 필수 조건
  for (const body of bodies) {
    assert.equal(body.store, false); assert.equal(body.stream, true);
    for (const banned of ["max_output_tokens", "temperature", "previous_response_id", "metadata", "user", "truncation"]) assert.ok(!(banned in body), banned);
    assert.equal(body.tools[0].type, "namespace");
    assert.ok(body.input.every((item) => item.role !== "system"));
  }
  const second = bodies[1].input;
  assert.deepEqual(second.at(-1), { type: "function_call_output", call_id: "c1", output: "phase: brainstorm" });
  assert.ok(second.some((item) => item.type === "function_call" && item.call_id === "c1"));
  assert.deepEqual(second.slice(0, 2), [{ role: "assistant", content: "안녕하세요" }, { role: "user", content: job.text }]);
});

test("사용 한도에 닿으면 그 코드로 멈춘다", async () => {
  await assert.rejects(runTurn({
    job, model: "m", instructions: "i", tools, getToken: async () => "tok", callTool: async () => ({ ok: true, text: "" }), onDelta() {}, onStatus() {},
    fetchImpl: async () => stream([{ type: "response.failed", response: { error: { code: "subscription_sharing_usage_limit_exceeded", message: "limit" } } }])
  }), (error) => error instanceof TurnError && error.code === "subscription_sharing_usage_limit_exceeded");
});

test("401이면 토큰을 한 번 새로 받아 다시 한다", async () => {
  const tokens = []; let n = 0;
  const text = await runTurn({
    job, model: "m", instructions: "i", tools, callTool: async () => ({ ok: true, text: "" }), onDelta() {}, onStatus() {},
    getToken: async (o) => { tokens.push(!!o?.force); return o?.force ? "new" : n ? "new" : "old"; },
    fetchImpl: async () => n++ === 0 ? new Response(JSON.stringify({ error: { code: "invalid_token" } }), { status: 401 }) : stream([{ type: "response.completed", response: { output: [{ type: "message", content: [{ type: "output_text", text: "네" }] }] } }])
  });
  assert.equal(text, "네");
  assert.ok(tokens.includes(true));
});

test("include를 받아주지 않으면 빼고 다시 한다", async () => {
  const bodies = [];
  const text = await runTurn({
    job, model: "m", instructions: "i", tools, getToken: async () => "t", callTool: async () => ({ ok: true, text: "" }), onDelta() {}, onStatus() {},
    fetchImpl: async (_u, init) => { const body = JSON.parse(init.body); bodies.push(body); return body.include ? new Response(JSON.stringify({ error: { code: "subscription_sharing_unsupported_capability", param: "include" } }), { status: 400 }) : stream([{ type: "response.completed", response: { output: [{ type: "message", content: [{ type: "output_text", text: "됐어요" }] }] } }]); }
  });
  assert.equal(text, "됐어요");
  assert.equal(bodies.length, 2);
});

test("SSE가 조각나 와도 사건을 온전히 읽는다", async () => {
  const raw = `data: {"type":"a","v":"한글"}\n\ndata: {"type":"b"}\r\n\r\ndata: [DONE]\n\n`;
  const bytes = new TextEncoder().encode(raw);
  async function* chunks() { for (let i = 0; i < bytes.length; i += 5) yield bytes.slice(i, i + 5); }
  const seen = []; for await (const event of sse(chunks())) seen.push(event);
  assert.deepEqual(seen, [{ type: "a", v: "한글" }, { type: "b" }]);
});

test("도구는 네임스페이스 하나로 묶인다", () => {
  const ns = toNamespace(tools);
  assert.equal(ns.name, "dalgrak");
  assert.deepEqual(ns.tools[0], { type: "function", name: "get_project", description: "읽는다", parameters: tools[0].inputSchema, strict: false });
});
