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

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
