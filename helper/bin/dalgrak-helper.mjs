#!/usr/bin/env node
import { readFileSync } from "node:fs";
import * as dalgrak from "../src/dalgrak.mjs";
import * as openai from "../src/openai-auth.mjs";
import { USAGE_URL } from "../src/agent.mjs";
import { pickModel, serve, setModel } from "../src/relay.mjs";
import { listModels } from "../src/agent.mjs";
import { configDir } from "../src/store.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const say = (text = "") => console.log(text);

const HELP = `달그락 도우미 ${version}
내 컴퓨터에서 돌면서, 내 ChatGPT 요금제로 달그락 대장간 대화를 이어줘요.

  dalgrak-helper            연결이 없으면 로그인하고, 바로 시작해요
  dalgrak-helper status     지금 연결 상태를 보여줘요
  dalgrak-helper models     쓸 수 있는 모델을 보여줘요
  dalgrak-helper model <이름>  쓸 모델을 정해요
  dalgrak-helper logout     ChatGPT와 달그락 연결을 모두 끊어요

로그인 정보는 이 컴퓨터의 ${configDir()} 에만 저장돼요.`;

async function ensureLogins() {
  if (!dalgrak.link()?.access_token) {
    say("1/2 달그락 대장간에 연결해요.");
    await dalgrak.login({ print: say });
    say("달그락 대장간에 연결됐어요.\n");
  }
  if (!openai.planEnabled()) {
    say("2/2 ChatGPT에 연결해요. 브라우저에서 'ChatGPT 요금제 사용'을 허용해주세요.");
    const saved = await openai.login({ print: say });
    if (!openai.planEnabled(saved)) throw new Error("ChatGPT 요금제 사용이 허용되지 않았어요. 다시 실행해 허용해주세요.");
    say(`ChatGPT에 연결됐어요${saved.email ? ` (${saved.email})` : ""}.`);
    say(`이제 달그락 대장간의 AI 요청은 내 ChatGPT 요금제를 써요. 사용량은 ${USAGE_URL} 에서 관리할 수 있어요.\n`);
  }
}

async function main() {
  const [command = "start", argument] = process.argv.slice(2);
  if (["help", "--help", "-h"].includes(command)) return say(HELP);
  if (command === "status") {
    const d = dalgrak.link(); const o = openai.account();
    say(`달그락 대장간: ${d?.access_token ? `연결됨 (${d.server})` : "연결 안 됨"}`);
    say(`ChatGPT: ${openai.planEnabled(o) ? `연결됨${o.email ? ` (${o.email})` : ""} · 요금제 사용 허용` : "연결 안 됨"}`);
    return;
  }
  if (command === "logout") {
    const { revoked } = await openai.logout();
    dalgrak.logout();
    say(revoked ? "연결을 모두 끊었어요." : `이 컴퓨터의 로그인 정보는 지웠지만, ChatGPT 쪽 해제는 확인하지 못했어요. ChatGPT 설정에서 '${openai.AGENT_NAME}' 연결을 끊어주세요.`);
    return;
  }
  if (command === "models") {
    await ensureLogins();
    const current = await pickModel();
    for (const model of await listModels(await openai.accessToken())) say(`${model.slug === current ? "●" : " "} ${model.slug}  ${model.name}`);
    return;
  }
  if (command === "model") {
    if (!argument) throw new Error("모델 이름을 적어주세요. 예: dalgrak-helper model <이름>");
    setModel(argument); say(`다음부터 ${argument} 모델을 써요.`);
    return;
  }
  if (command !== "start") { say(HELP); process.exitCode = 1; return; }
  await ensureLogins();
  const stop = new AbortController();
  process.on("SIGINT", () => { say("\n도우미를 끕니다. 다시 켜면 이어서 대화할 수 있어요."); stop.abort(); process.exit(0); });
  await serve({ version, log: (line) => say(`[${new Date().toLocaleTimeString()}] ${line}`), signal: stop.signal });
}

main().catch((error) => { console.error(error?.message ?? "알 수 없는 오류가 났어요."); process.exitCode = 1; });
