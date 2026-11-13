import { spawn } from "node:child_process";
import path from "node:path";

try {
  process.loadEnvFile(path.resolve(".env.local"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const command = process.argv[2];
if (!new Set(["dev", "build", "start"]).has(command)) throw new Error("usage: run-next.mjs <dev|build|start> [...args]");
const nextBin = path.resolve("node_modules/next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, command, "apps/web", ...process.argv.slice(3)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

// 배포가 바뀔 때 Railway가 보내는 종료 신호(SIGTERM)는 정상 종료다. 자식(next)에게 넘기고 0으로 끝내야
// "Deploy Crashed" 메일이 가지 않는다 (예전엔 신호를 그대로 되던져서 npm이 실패로 보고했다).
let stopping = false;
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => { stopping = true; child.kill(sig); });
}
child.on("exit", (code, signal) => {
  if (stopping) { process.exitCode = 0; return; }
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
