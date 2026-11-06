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
// Accounts sign in one of three ways:
// - "password": email + password. The data key is sealed under a key derived
//   from the password (and a second copy under the recovery code), so only the
//   person can open their records.
// - "google": Google sign-in. With keys.server the data key is sealed under the
//   server's VAULT_MASTER_KEY (the person agreed to this lower lock); once they
//   set a password, keys.server is removed and Google only identifies them.
// - "link": the older secret-link accounts (data key derived from the link).
export type AuthKind = "password" | "google" | "link";
export type KeyEnvelopes = { password?: { salt: string; sealed: string }; recovery?: string; server?: string };
export type ForgeUser = {
  id: string;
  name: string;
  auth?: AuthKind;
  email?: string;
  emailVerifiedAt?: string | null;
  googleSub?: string;
  passwordHash?: string;
  keys?: KeyEnvelopes;
  googleConsent?: { version: string; agreedAt: string };
  tokenHash?: string;
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
export type PublicUser = Omit<ForgeUser, "tokenHash" | "tokenSealed" | "passwordHash" | "keys" | "googleSub"> & { passwordSet: boolean; lock: "password" | "server" | "link" };

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
// A server envelope means the server can open the records, whatever else exists.
export const lockOf = (user: Pick<ForgeUser, "keys" | "auth">): PublicUser["lock"] => user.keys?.server ? "server" : user.keys?.password ? "password" : "link";
const toPublic = ({ tokenHash: _hash, tokenSealed: _sealed, passwordHash: _password, keys, googleSub: _sub, ...user }: ForgeUser): PublicUser => ({ ...user, auth: user.auth ?? "link", passwordSet: Boolean(keys?.password), lock: lockOf({ keys, auth: user.auth }) });
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
  const user = (await readUsers()).users.find((item) => !item.revokedAt && item.tokenHash && timingSafeEqualText(item.tokenHash, hash));
  return user ? toPublic(user) : null;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Full records for the sign-in code only; never send these to a browser.
export async function accountByEmail(email: string): Promise<ForgeUser | null> {
  await queue;
  const wanted = normalizeEmail(email);
  return (await readUsers()).users.find((item) => !item.revokedAt && item.email === wanted) ?? null;
}
export async function accountByGoogle(sub: string): Promise<ForgeUser | null> {
  await queue;
  return (await readUsers()).users.find((item) => !item.revokedAt && item.googleSub === sub) ?? null;
}
export async function accountById(id: string): Promise<ForgeUser | null> {
  await queue;
  return (await readUsers()).users.find((item) => item.id === id && !item.revokedAt) ?? null;
}

export function toPublicUser(user: ForgeUser): PublicUser { return toPublic(user); }

// Creates an email or Google account (self sign-up rules apply).
export function createAccount(input: { id?: string; name: string; email: string; auth: "password" | "google"; emailVerified: boolean; passwordHash?: string; keys: KeyEnvelopes; googleSub?: string; consent: Consent; googleConsent?: ForgeUser["googleConsent"]; inviteCode?: string }): Promise<PublicUser> {
  return serialized(async () => {
    const database = await readUsers();
    admitSignup(database, input.inviteCode);
    const email = normalizeEmail(input.email);
    if (database.users.some((item) => !item.revokedAt && item.email === email)) throw new SignupError(input.auth === "google" ? "이미 이메일로 가입된 주소예요. 이메일과 비밀번호로 로그인해주세요." : "이미 가입된 이메일이에요. 로그인하거나 비밀번호 찾기를 이용해주세요.");
    const now = new Date().toISOString();
    const user: ForgeUser = {
      id: input.id ?? randomUUID(), name: input.name, auth: input.auth, email, emailVerifiedAt: input.emailVerified ? now : null,
      ...(input.googleSub ? { googleSub: input.googleSub } : {}), ...(input.passwordHash ? { passwordHash: input.passwordHash } : {}),
      keys: input.keys, webAi: false, createdAt: now, revokedAt: null, source: "signup", consent: input.consent,
      ...(input.googleConsent ? { googleConsent: input.googleConsent } : {})
    };
    database.users.push(user);
    await writeUsers(database);
    return toPublic(user);
  });
}

// Generic serialized change to one account (password, keys, email, link).
export function changeAccount(id: string, change: (user: ForgeUser) => void): Promise<PublicUser> {
  return serialized(async () => {
    const database = await readUsers();
    const user = database.users.find((item) => item.id === id && !item.revokedAt);
    if (!user) throw new Error("계정을 찾을 수 없습니다.");
    change(user);
    if (user.email && database.users.some((item) => item !== user && !item.revokedAt && item.email === user.email)) throw new SignupError("이미 다른 계정에서 쓰는 이메일이에요.");
    await writeUsers(database);
    return toPublic(user);
  });
}

function admitSignup(database: UserDatabase, inviteCode: string | undefined) {
  if (database.users.filter((item) => !item.revokedAt).length >= MAX_USERS()) throw new SignupError("지금은 정원이 찼어요. 운영자에게 문의해주세요.");
  if (inviteCode === undefined) return;
  const hash = hashToken(inviteCode.trim().toUpperCase());
  const invite = (database.invites ?? []).find((item) => timingSafeEqualText(item.codeHash, hash));
  if (!invite || invite.disabledAt || invite.used >= invite.maxUses || (invite.expiresAt && invite.expiresAt <= new Date().toISOString())) throw new SignupError("초대 코드가 올바르지 않거나 만료됐어요.");
  invite.used += 1;
}

export const MAX_USERS = () => Number(process.env.SIGNUP_MAX_USERS ?? 500);

export function createUser(name: string, webAi: boolean, extra: { source?: ForgeUser["source"]; consent?: Consent; inviteCode?: string } = {}): Promise<{ user: PublicUser; token: string }> {
  return serialized(async () => {
    const database = await readUsers();
    if (extra.source === "signup") admitSignup(database, extra.inviteCode);
    const token = randomBytes(24).toString("base64url");
    const user: ForgeUser = { id: randomUUID(), name, auth: "link", tokenHash: hashToken(token), webAi, createdAt: new Date().toISOString(), revokedAt: null, source: extra.source ?? "operator", ...(extra.consent ? { consent: extra.consent } : {}) };
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
    if (!user?.tokenHash || !timingSafeEqualText(user.tokenHash, hashToken(oldToken))) throw new Error("링크를 다시 확인해주세요.");
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
    return token && user.tokenHash && timingSafeEqualText(hashToken(token), user.tokenHash) ? [{ id: user.id, token }] : [];
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
