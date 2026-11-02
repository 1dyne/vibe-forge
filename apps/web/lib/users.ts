import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { timingSafeEqualText } from "./session";

// People the operator invites. Each gets one secret token that works both as
// their Claude connector URL and as their dashboard sign-in link. Only the
// token's hash is stored, so the plain token is shown once at creation.
export type ForgeUser = {
  id: string;
  name: string;
  tokenHash: string;
  webAi: boolean;
  createdAt: string;
  revokedAt: string | null;
};
export type PublicUser = Omit<ForgeUser, "tokenHash">;

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
  await writeFile(temporary, JSON.stringify(database, null, 2), "utf8");
  await rename(temporary, file);
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation, operation);
  queue = next.then(() => undefined, () => undefined);
  return next;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const toPublic = ({ tokenHash: _hash, ...user }: ForgeUser): PublicUser => user;

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
