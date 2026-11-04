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
  // How the account was made and what the person agreed to (self sign-up).
  source?: "operator" | "signup";
  consent?: Consent;
};
export type Consent = { termsVersion: string; privacyVersion: string; ageConfirmed: true; agreedAt: string };
export type PublicUser = Omit<ForgeUser, "tokenHash" | "tokenSealed">;

// Sign-up codes the operator hands out. Only the code's hash is stored.
export type Invite = { id: string; label: string; codeHash: string; maxUses: number; used: number; expiresAt: string | null; createdAt: string; disabledAt: string | null };
export type PublicInvite = Omit<Invite, "codeHash">;

type UserDatabase = { version: 1; users: ForgeUser[]; invites?: Invite[] };
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

export const MAX_USERS = () => Number(process.env.SIGNUP_MAX_USERS ?? 500);

export function createUser(name: string, webAi: boolean, extra: { source?: ForgeUser["source"]; consent?: Consent; inviteCode?: string } = {}): Promise<{ user: PublicUser; token: string }> {
  return serialized(async () => {
    const database = await readUsers();
    if (extra.source === "signup") {
      if (database.users.filter((item) => !item.revokedAt).length >= MAX_USERS()) throw new SignupError("지금은 정원이 찼어요. 운영자에게 문의해주세요.");
      if (extra.inviteCode !== undefined) {
        const hash = hashToken(extra.inviteCode.trim().toUpperCase());
        const invite = (database.invites ?? []).find((item) => timingSafeEqualText(item.codeHash, hash));
        if (!invite || invite.disabledAt || invite.used >= invite.maxUses || (invite.expiresAt && invite.expiresAt <= new Date().toISOString())) throw new SignupError("초대 코드가 올바르지 않거나 만료됐어요.");
        invite.used += 1;
      }
    }
    const token = randomBytes(24).toString("base64url");
    const user: ForgeUser = { id: randomUUID(), name, tokenHash: hashToken(token), webAi, createdAt: new Date().toISOString(), revokedAt: null, source: extra.source ?? "operator", ...(extra.consent ? { consent: extra.consent } : {}) };
    database.users.push(user);
    await writeUsers(database);
    return { user: toPublic(user), token };
  });
}

export class SignupError extends Error {}

// Issues a new link for the same account. The caller re-seals the person's
// records with the new token before calling this (see rotateParticipantLink).
export function replaceToken(id: string, oldToken: string, newToken: string): Promise<void> {
  return serialized(async () => {
    const database = await readUsers();
    const user = database.users.find((item) => item.id === id && !item.revokedAt);
    if (!user || !timingSafeEqualText(user.tokenHash, hashToken(oldToken))) throw new Error("링크를 다시 확인해주세요.");
    user.tokenHash = hashToken(newToken);
    delete user.tokenSealed;
    user.clients = [];
    await writeUsers(database);
  });
}

export async function listInvites(): Promise<PublicInvite[]> {
  await queue;
  return ((await readUsers()).invites ?? []).map(({ codeHash: _hash, ...invite }) => invite);
}

export function createInvite(label: string, maxUses: number, expiresAt: string | null): Promise<{ invite: PublicInvite; code: string }> {
  return serialized(async () => {
    const database = await readUsers();
    // Short enough to read aloud at a talk, long enough not to guess (≈ 60 bits).
    const code = randomBytes(8).toString("base64url").replace(/[-_]/g, "x").slice(0, 10).toUpperCase();
    const invite: Invite = { id: randomUUID(), label, codeHash: hashToken(code), maxUses, used: 0, expiresAt, createdAt: new Date().toISOString(), disabledAt: null };
    database.invites = [...(database.invites ?? []), invite];
    await writeUsers(database);
    const { codeHash: _hash, ...visible } = invite;
    return { invite: visible, code };
  });
}

export function disableInvite(id: string): Promise<void> {
  return serialized(async () => {
    const database = await readUsers();
    const invite = (database.invites ?? []).find((item) => item.id === id);
    if (!invite) throw new Error("초대 코드를 찾을 수 없습니다.");
    invite.disabledAt ??= new Date().toISOString();
    await writeUsers(database);
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
