import { createHash, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { timingSafeEqualText } from "./session";
import { open, seal } from "./vault";

// Browser sessions for email/Google accounts. The cookie holds a random secret;
// the server keeps its hash and the account's data key sealed under that
// secret, so a session opens records only while its cookie is presented.
// Email tokens (verify, reset) are one-time and stored as hashes too.
type Session = { hash: string; userId: string; expiresAt: number; sealed: string; createdAt: string };
export type EmailPurpose = "verify" | "reset" | "unlock";
type EmailToken = { hash: string; userId: string; purpose: EmailPurpose; expiresAt: number };
type AuthDatabase = { version: 1; sessions: Session[]; tokens: EmailToken[] };

let queue: Promise<unknown> = Promise.resolve();

function dataFile() {
  if (process.env.FORGE_TEST_AUTH_FILE && process.env.NODE_ENV === "test") return process.env.FORGE_TEST_AUTH_FILE;
  const cwd = process.cwd();
  const workspace = path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps" ? path.resolve(cwd, "../..") : cwd;
  return path.join(workspace, ".data", "auth.json");
}

async function readDb(): Promise<AuthDatabase> {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ dataFile(), "utf8")) as AuthDatabase;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, sessions: [], tokens: [] };
    throw error;
  }
}

async function writeDb(database: AuthDatabase) {
  const now = Date.now();
  database.sessions = database.sessions.filter((item) => item.expiresAt > now);
  database.tokens = database.tokens.filter((item) => item.expiresAt > now);
  const file = dataFile();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(database, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
}

function serialized<T>(operation: (database: AuthDatabase) => Promise<T>): Promise<T> {
  const next = queue.then(async () => operation(await readDb()));
  queue = next.then(() => undefined, () => undefined);
  return next;
}

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");
const sessionKey = (secret: string) => Buffer.from(hkdfSync("sha256", secret, "dalgeurak-session-v1", "session", 32));
export const SESSION_SHORT_MS = 12 * 60 * 60_000;
export const SESSION_LONG_MS = 30 * 86_400_000;

export function createSession(userId: string, dataKey: Buffer, ttlMs: number): Promise<string> {
  return serialized(async (database) => {
    const secret = randomBytes(32).toString("base64url");
    database.sessions.push({ hash: hash(secret), userId, expiresAt: Date.now() + ttlMs, sealed: seal(dataKey.toString("base64"), sessionKey(secret), `session:${userId}`), createdAt: new Date().toISOString() });
    await writeDb(database);
    return secret;
  });
}

export async function openSession(secret: string): Promise<{ userId: string; dataKey: Buffer } | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(secret)) return null;
  await queue;
  const wanted = hash(secret);
  const session = (await readDb()).sessions.find((item) => timingSafeEqualText(item.hash, wanted));
  if (!session || session.expiresAt <= Date.now()) return null;
  const value = open<string>(session.sealed, sessionKey(secret), `session:${session.userId}`);
  return value ? { userId: session.userId, dataKey: Buffer.from(value, "base64") } : null;
}

export function endSession(secret: string): Promise<void> {
  return serialized(async (database) => {
    const wanted = hash(secret);
    database.sessions = database.sessions.filter((item) => !timingSafeEqualText(item.hash, wanted));
    await writeDb(database);
  });
}

// Signs the person out everywhere (password change, reset, leaving), except
// optionally the session making the change.
export function endUserSessions(userId: string, keepSecret?: string): Promise<void> {
  return serialized(async (database) => {
    const keep = keepSecret ? hash(keepSecret) : null;
    database.sessions = database.sessions.filter((item) => item.userId !== userId || item.hash === keep);
    database.tokens = keepSecret ? database.tokens : database.tokens.filter((item) => item.userId !== userId);
    await writeDb(database);
  });
}

const TTL: Record<EmailPurpose, number> = { verify: 48 * 60 * 60_000, reset: 30 * 60_000, unlock: 10 * 60_000 };

export function createEmailToken(userId: string, purpose: EmailPurpose): Promise<string> {
  return serialized(async (database) => {
    // One live token per purpose: a new email replaces the old link.
    database.tokens = database.tokens.filter((item) => !(item.userId === userId && item.purpose === purpose));
    const token = randomBytes(32).toString("base64url");
    database.tokens.push({ hash: hash(token), userId, purpose, expiresAt: Date.now() + TTL[purpose] });
    await writeDb(database);
    return token;
  });
}

export async function peekEmailToken(token: string, purpose: EmailPurpose): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  await queue;
  const wanted = hash(token);
  const found = (await readDb()).tokens.find((item) => item.purpose === purpose && timingSafeEqualText(item.hash, wanted));
  return found && found.expiresAt > Date.now() ? found.userId : null;
}

export function consumeEmailToken(token: string, purpose: EmailPurpose): Promise<string | null> {
  return serialized(async (database) => {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
    const wanted = hash(token);
    const found = database.tokens.find((item) => item.purpose === purpose && timingSafeEqualText(item.hash, wanted));
    if (!found) return null;
    database.tokens = database.tokens.filter((item) => item !== found);
    await writeDb(database);
    return found.expiresAt > Date.now() ? found.userId : null;
  });
}

export const newId = randomUUID;
