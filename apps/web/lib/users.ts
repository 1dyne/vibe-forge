import { createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { timingSafeEqualText } from "./session";

// People the operator invites. Each gets one secret token that works both as
// their Claude connector URL and as their dashboard sign-in link. Only the
// token's hash is stored, so nobody holding the server's secrets can rebuild
// the token or the key it derives (see vault.ts). tokenSealed is a legacy
// field: links issued before sealing kept a recoverable copy, which the
// project store uses once to seal those records and then deletes.
export type ConnectedClient = { name: string; version: string; lastSeenAt: string };
export type ForgeUser = {
  id: string;
  name: string;
  tokenHash: string;
  tokenSealed?: string;
  clients?: ConnectedClient[];
  webAi: boolean;
  createdAt: string;
  revokedAt: string | null;
};
export type PublicUser = Omit<ForgeUser, "tokenHash" | "tokenSealed">;

type UserDatabase = { version: 1; users: ForgeUser[] };
let queue: Promise<unknown> = Promise.resolve();

function dataFile() {
  if (process.env.FORGE_TEST_USERS_FILE && process.env.NODE_ENV === "test") return process.env.FORGE_TEST_USERS_FILE;
  const cwd = process.cwd();
  const workspace = path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps" ? path.resolve(cwd, "../..") : cwd;
  return path.join(workspace, ".data", "users.json");
}

async function readUsers(): Promise<UserDatabase> {
  try {
    const parsed = JSON.parse(await readFile(/* turbopackIgnore: true */ dataFile(), "utf8")) as UserDatabase;
    if (parsed.version !== 1 || !Array.isArray(parsed.users)) throw new Error("저장된 사용자 형식을 읽을 수 없습니다.");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, users: [] };
    throw error;
  }
}

async function writeUsers(database: UserDatabase) {
  const file = dataFile();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(database, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation, operation);
  queue = next.then(() => undefined, () => undefined);
  return next;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const toPublic = ({ tokenHash: _hash, tokenSealed: _sealed, ...user }: ForgeUser): PublicUser => user;
const legacySealingKey = () => createHash("sha256").update(`dalgeurak-token:${process.env.SESSION_SECRET ?? ""}`).digest();

function unsealLegacyToken(sealed: string | undefined): string | null {
  if (!sealed || !process.env.SESSION_SECRET) return null;
  try {
    const [iv, tag, body] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", legacySealingKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    // SESSION_SECRET changed since the link was made; the operator issues a new one.
    return null;
  }
}

export async function listUsers(): Promise<PublicUser[]> {
  await queue;
  return (await readUsers()).users.map(toPublic);
}

export async function getActiveUser(id: string): Promise<PublicUser | null> {
  await queue;
  const user = (await readUsers()).users.find((item) => item.id === id && !item.revokedAt);
  return user ? toPublic(user) : null;
}

export async function findUserByToken(token: string): Promise<PublicUser | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  await queue;
  const hash = hashToken(token);
  const user = (await readUsers()).users.find((item) => !item.revokedAt && timingSafeEqualText(item.tokenHash, hash));
  return user ? toPublic(user) : null;
}

export function createUser(name: string, webAi: boolean): Promise<{ user: PublicUser; token: string }> {
  return serialized(async () => {
    const database = await readUsers();
    const token = randomBytes(24).toString("base64url");
    const user: ForgeUser = { id: randomUUID(), name, tokenHash: hashToken(token), webAi, createdAt: new Date().toISOString(), revokedAt: null };
    database.users.push(user);
    await writeUsers(database);
    return { user: toPublic(user), token };
  });
}

export function updateUser(id: string, change: { webAi?: boolean; revoke?: boolean }): Promise<PublicUser> {
  return serialized(async () => {
    const database = await readUsers();
    const user = database.users.find((item) => item.id === id);
    if (!user) throw new Error("사용자를 찾을 수 없습니다.");
    if (change.webAi !== undefined) user.webAi = change.webAi;
    if (change.revoke) user.revokedAt ??= new Date().toISOString();
    await writeUsers(database);
    return toPublic(user);
  });
}

// Permanently forgets a participant. Their link stops working at once.
export function deleteUser(id: string): Promise<void> {
  return serialized(async () => {
    const database = await readUsers();
    const users = database.users.filter((item) => item.id !== id);
    if (users.length === database.users.length) throw new Error("사용자를 찾을 수 없습니다.");
    await writeUsers({ ...database, users });
  });
}

// Legacy links whose token can still be recovered with SESSION_SECRET.
export async function takeLegacyTokens(): Promise<Array<{ id: string; token: string }>> {
  await queue;
  return (await readUsers()).users.flatMap((user) => {
    const token = unsealLegacyToken(user.tokenSealed);
    return token && timingSafeEqualText(hashToken(token), user.tokenHash) ? [{ id: user.id, token }] : [];
  });
}

export function forgetLegacyTokens(ids: string[]): Promise<void> {
  return serialized(async () => {
    const database = await readUsers();
    for (const user of database.users) if (ids.includes(user.id)) delete user.tokenSealed;
    await writeUsers(database);
  });
}

// Remembers which MCP clients (claude.ai, Claude Code, Codex…) have connected.
export function recordClient(id: string, name: string, version: string): Promise<void> {
  return serialized(async () => {
    const database = await readUsers();
    const user = database.users.find((item) => item.id === id);
    if (!user) return;
    const clients = (user.clients ?? []).filter((client) => client.name !== name);
    user.clients = [{ name: name.slice(0, 80), version: version.slice(0, 40), lastSeenAt: new Date().toISOString() }, ...clients].slice(0, 8);
    await writeUsers(database);
  });
}
