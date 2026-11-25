import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

export const b64url = (buffer) => Buffer.from(buffer).toString("base64url");
export const random = (bytes = 32) => b64url(randomBytes(bytes));
export const challengeOf = (verifier) => b64url(createHash("sha256").update(verifier).digest());

const page = (title, body) => `<!doctype html><html lang="ko"><meta charset="utf-8"><title>달그락 도우미</title><body style="font:16px/1.7 system-ui,sans-serif;max-width:480px;margin:18vh auto;padding:0 24px;color:#1f1f1f"><h1 style="font-size:20px">${title}</h1><p>${body}</p></body></html>`;

/**
 * 127.0.0.1에서 로그인 결과를 한 번 받는다. 주소는 반드시 127.0.0.1이어야 하고
 * (localhost로 바꾸면 안 된다), 경로는 로그인마다 같아야 한다. 포트만 달라질 수 있다.
 */
export async function listenOnce({ path, ports }) {
  let lastError;
  for (const port of ports) {
    try { return await open(path, port); } catch (error) { lastError = error; }
  }
  throw lastError ?? new Error("로그인 결과를 받을 포트를 열지 못했어요.");
}

function open(path, port) {
  return new Promise((resolve, reject) => {
    let settle;
    const result = new Promise((done) => { settle = done; });
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
      if (url.pathname !== path) { response.writeHead(404).end(); return; }
      const failed = url.searchParams.get("error");
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(failed ? page("연결하지 못했어요", "이 창을 닫고 달그락 도우미에서 다시 시도해주세요.") : page("연결됐어요", "이 창을 닫고 달그락 대장간으로 돌아가세요."));
      settle(url.searchParams);
      setTimeout(() => server.close(), 200);
    });
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const actual = server.address().port;
      resolve({ redirectUri: `http://127.0.0.1:${actual}${path}`, result, close: () => server.close() });
    });
  });
}

export function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
}

export function openBrowser(url) {
  const [command, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : ["xdg-open", [url]];
  try { spawn(command, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref(); } catch { /* 주소를 직접 열게 안내한다 */ }
}
