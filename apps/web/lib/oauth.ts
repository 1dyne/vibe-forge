import { createHash, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { timingSafeEqualText } from "./session";
import { open, seal } from "./vault";

// OAuth 2.1 for the MCP connector (authorization code + PKCE, public clients
// registered dynamically). Every secret this file hands out (code, access
// token, refresh token) is stored only as a hash, next to the participant's
// data key sealed with a key derived from that same secret. So a token opens
// that person's records while it is presented, and nothing on the server
// (operator login, SESSION_SECRET, this file) opens them on its own.
export type OAuthClient = { id: string; name: string; redirectUris: string[]; createdAt: string };
type AuthCode = { hash: string; clientId: string; userId: string; redirectUri: string; challenge: string; expiresAt: number; wrapped: string };
export type Grant = {
  id: string; userId: string; clientId: string; clientName: string; createdAt: string; lastUsedAt: string;
  accessHash: string; accessExpiresAt: number; accessWrapped: string;
  refreshHash: string; refreshExpiresAt: number; refreshWrapped: string;
};
export type PublicGrant = Pick<Grant, "id" | "clientName" | "createdAt" | "lastUsedAt">;
type OAuthDatabase = { version: 1; clients: OAuthClient[]; codes: AuthCode[]; grants: Grant[] };

export const ACCESS_TTL_SEC = 60 * 60;
const REFRESH_TTL_MS = 60 * 86_400_000;
const CODE_TTL_MS = 5 * 60_000;
const MAX_CLIENTS = 5000;

let queue: Promise<unknown> = Promise.resolve();

function dataFile() {
  if (process.env.FORGE_TEST_OAUTH_FILE && process.env.NODE_ENV === "test") return process.env.FORGE_TEST_OAUTH_FILE;
  const cwd = process.cwd();
  const workspace = path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps" ? path.resolve(cwd, "../..") : cwd;
  return path.join(workspace, ".data", "oauth.json");
}

async function readDb(): Promise<OAuthDatabase> {
  try {
    const parsed = JSON.parse(await readFile(/* turbopackIgnore: true */ dataFile(), "utf8")) as OAuthDatabase;
    if (parsed.version !== 1) throw new Error("OAuth 저장 형식을 읽을 수 없습니다.");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, clients: [], codes: [], grants: [] };
    throw error;
  }
}

async function writeDb(database: OAuthDatabase) {
  const now = Date.now();
  database.codes = database.codes.filter((code) => code.expiresAt > now);
  database.grants = database.grants.filter((grant) => grant.refreshExpiresAt > now);
  const file = dataFile();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(database, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
}

function serialized<T>(operation: (database: OAuthDatabase) => Promise<T>): Promise<T> {
  const next = queue.then(async () => operation(await readDb()));
  queue = next.then(() => undefined, () => undefined);
  return next;
}

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");
const newSecret = () => randomBytes(32).toString("base64url");
const wrapKey = (secret: string, label: string) => Buffer.from(hkdfSync("sha256", secret, "dalgeurak-oauth-v1", label, 32));
const wrap = (dataKey: Buffer, secret: string, label: string) => seal(dataKey.toString("base64"), wrapKey(secret, label), label);
function unwrap(sealed: string, secret: string, label: string): Buffer | null {
  const value = open<string>(sealed, wrapKey(secret, label), label);
  return value ? Buffer.from(value, "base64") : null;
}

export class OAuthError extends Error {
  constructor(public code: "invalid_request" | "invalid_client" | "invalid_grant" | "unsupported_grant_type" | "invalid_redirect_uri" | "invalid_client_metadata", message: string) { super(message); }
}

// Loopback http is allowed for desktop tools (Claude Code); everything else must be https.
export function acceptableRedirect(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function registerClient(name: string, redirectUris: string[]): Promise<OAuthClient> {
  if (!redirectUris.length || redirectUris.length > 10 || !redirectUris.every(acceptableRedirect)) return Promise.reject(new OAuthError("invalid_redirect_uri", "redirect_uris must be https (or http on localhost)."));
  return serialized(async (database) => {
    if (database.clients.length >= MAX_CLIENTS) {
      // Drop the oldest clients nobody holds a grant for.
      const used = new Set(database.grants.map((grant) => grant.clientId));
      database.clients = database.clients.filter((client) => used.has(client.id)).slice(-MAX_CLIENTS + 100);
    }
    const client: OAuthClient = { id: randomUUID(), name: name.slice(0, 80) || "이름 없는 앱", redirectUris, createdAt: new Date().toISOString() };
    database.clients.push(client);
    await writeDb(database);
    return client;
  });
}

export async function getClient(id: string): Promise<OAuthClient | null> {
  await queue;
  return (await readDb()).clients.find((client) => client.id === id) ?? null;
}

export function createCode(input: { clientId: string; userId: string; redirectUri: string; challenge: string; dataKey: Buffer }): Promise<string> {
  return serialized(async (database) => {
    const code = newSecret();
    database.codes.push({ hash: hash(code), clientId: input.clientId, userId: input.userId, redirectUri: input.redirectUri, challenge: input.challenge, expiresAt: Date.now() + CODE_TTL_MS, wrapped: wrap(input.dataKey, code, `code:${input.userId}`) });
    await writeDb(database);
    return code;
  });
}

type TokenSet = { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string };

function issue(grant: Omit<Grant, "accessHash" | "accessExpiresAt" | "accessWrapped" | "refreshHash" | "refreshExpiresAt" | "refreshWrapped">, dataKey: Buffer): { grant: Grant; tokens: TokenSet } {
  const access = newSecret();
  const refresh = newSecret();
  const full: Grant = {
    ...grant,
    accessHash: hash(access), accessExpiresAt: Date.now() + ACCESS_TTL_SEC * 1000, accessWrapped: wrap(dataKey, access, `access:${grant.id}`),
    refreshHash: hash(refresh), refreshExpiresAt: Date.now() + REFRESH_TTL_MS, refreshWrapped: wrap(dataKey, refresh, `refresh:${grant.id}`)
  };
  return { grant: full, tokens: { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_SEC, refresh_token: refresh, scope: "mcp" } };
}

const pkceMatches = (verifier: string, challenge: string) => /^[A-Za-z0-9._~-]{43,128}$/.test(verifier) && timingSafeEqualText(createHash("sha256").update(verifier).digest("base64url"), challenge);

export function exchangeCode(input: { code: string; clientId: string; redirectUri: string; verifier: string }): Promise<TokenSet> {
  return serialized(async (database) => {
    const codeHash = hash(input.code);
    const index = database.codes.findIndex((item) => timingSafeEqualText(item.hash, codeHash));
    const found = index >= 0 ? database.codes[index] : null;
    // A code works once, even when the exchange fails.
    if (found) database.codes.splice(index, 1);
    if (!found || found.expiresAt <= Date.now() || found.clientId !== input.clientId || found.redirectUri !== input.redirectUri || !pkceMatches(input.verifier, found.challenge)) {
      await writeDb(database);
      throw new OAuthError("invalid_grant", "authorization code is invalid, expired or already used");
    }
    const dataKey = unwrap(found.wrapped, input.code, `code:${found.userId}`);
    if (!dataKey) { await writeDb(database); throw new OAuthError("invalid_grant", "authorization code could not be opened"); }
    const client = database.clients.find((item) => item.id === found.clientId);
    const now = new Date().toISOString();
    const { grant, tokens } = issue({ id: randomUUID(), userId: found.userId, clientId: found.clientId, clientName: client?.name ?? "앱", createdAt: now, lastUsedAt: now }, dataKey);
    database.grants.push(grant);
    await writeDb(database);
    return tokens;
  });
}

// Rotates the refresh token on every use.
export function refreshGrant(input: { refreshToken: string; clientId: string }): Promise<TokenSet> {
  return serialized(async (database) => {
    const refreshHash = hash(input.refreshToken);
    const index = database.grants.findIndex((item) => timingSafeEqualText(item.refreshHash, refreshHash));
    const found = index >= 0 ? database.grants[index] : null;
    if (!found || found.refreshExpiresAt <= Date.now() || found.clientId !== input.clientId) throw new OAuthError("invalid_grant", "refresh token is invalid or expired");
    const dataKey = unwrap(found.refreshWrapped, input.refreshToken, `refresh:${found.id}`);
    if (!dataKey) throw new OAuthError("invalid_grant", "refresh token could not be opened");
    const { grant, tokens } = issue({ id: found.id, userId: found.userId, clientId: found.clientId, clientName: found.clientName, createdAt: found.createdAt, lastUsedAt: new Date().toISOString() }, dataKey);
    database.grants[index] = grant;
    await writeDb(database);
    return tokens;
  });
}

export async function authenticateAccess(accessToken: string): Promise<{ userId: string; grantId: string; dataKey: Buffer } | null> {
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(accessToken)) return null;
  await queue;
  const accessHash = hash(accessToken);
  const grant = (await readDb()).grants.find((item) => timingSafeEqualText(item.accessHash, accessHash));
  if (!grant || grant.accessExpiresAt <= Date.now()) return null;
  const dataKey = unwrap(grant.accessWrapped, accessToken, `access:${grant.id}`);
  if (!dataKey) return null;
  if (Date.now() - new Date(grant.lastUsedAt).getTime() > 10 * 60_000) {
    void serialized(async (database) => {
      const current = database.grants.find((item) => item.id === grant.id);
      if (current) { current.lastUsedAt = new Date().toISOString(); await writeDb(database); }
    }).catch(() => {});
  }
  return { userId: grant.userId, grantId: grant.id, dataKey };
}

export async function listGrants(userId: string): Promise<PublicGrant[]> {
  await queue;
  return (await readDb()).grants.filter((grant) => grant.userId === userId).map(({ id, clientName, createdAt, lastUsedAt }) => ({ id, clientName, createdAt, lastUsedAt }));
}

export function revokeGrant(userId: string, grantId: string): Promise<boolean> {
  return serialized(async (database) => {
    const before = database.grants.length;
    database.grants = database.grants.filter((grant) => !(grant.userId === userId && grant.id === grantId));
    await writeDb(database);
    return database.grants.length < before;
  });
}

// Every connected app of this person stops at once (new link, revoke, erase).
export function revokeUserGrants(userId: string): Promise<void> {
  return serialized(async (database) => {
    database.grants = database.grants.filter((grant) => grant.userId !== userId);
    database.codes = database.codes.filter((code) => code.userId !== userId);
    await writeDb(database);
  });
}
