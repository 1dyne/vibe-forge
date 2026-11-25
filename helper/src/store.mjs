import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// 로그인 정보는 이 컴퓨터의 내 계정만 읽을 수 있는 파일에 둔다(0600).
// 서버로 보내지 않고, 로그에도 찍지 않는다.
export const configDir = () => process.env.DALGRAK_HELPER_HOME || join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "dalgrak-helper");

function file(name) {
  const dir = configDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  return join(dir, name);
}

export function read(name) {
  try { return JSON.parse(readFileSync(file(name), "utf8")); } catch { return null; }
}

export function write(name, value) {
  const path = file(name);
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(temp, path);
  try { chmodSync(path, 0o600); } catch { /* Windows */ }
}

export function remove(name) {
  try { rmSync(file(name)); } catch { /* 없으면 그만 */ }
}

// 이 컴퓨터(호스트)를 가리키는 이름표. 사람을 알아볼 수 있는 값이 아니고, 인증 수단도 아니다.
export function hostId() {
  const saved = read("host.json");
  if (saved?.ext_agent_host_id) return saved.ext_agent_host_id;
  const id = `urn:uuid:${randomUUID()}`;
  write("host.json", { ext_agent_host_id: id, createdAt: new Date().toISOString() });
  return id;
}
