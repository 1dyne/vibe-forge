import { hkdfSync, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { KeyEnvelopes } from "./users";
import { open, seal } from "./vault";

// Each account has one random data key that seals its records (vault.ts).
// That key is kept only inside envelopes:
//   password  – opened with a key stretched from the password (scrypt)
//   recovery  – opened with the recovery code shown once at sign-up
//   server    – opened with VAULT_MASTER_KEY (Google accounts that agreed)
// The password is also checked against a separate scrypt hash, with its own
// salt, so the stored hash never doubles as the envelope key.
const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, length: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const COST = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const PASSWORD_MIN = 10;
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상으로 만들어주세요.`;
  if (password.length > 200) return "비밀번호가 너무 길어요.";
  if (email && password.trim().toLowerCase() === email.trim().toLowerCase()) return "이메일과 다른 비밀번호를 써주세요.";
  if (/^(.)\1+$/.test(password)) return "같은 글자만 반복한 비밀번호는 쓸 수 없어요.";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFC"), salt, 32, COST);
  return ["scrypt", COST.N, COST.r, COST.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = (stored ?? "").split("$");
  if (kind !== "scrypt" || !salt || !hash) {
    // Spend the same time so a missing account is not distinguishable.
    await scrypt(password, randomBytes(16), 32, COST);
    return false;
  }
  const actual = await scrypt(password.normalize("NFC"), Buffer.from(salt, "base64url"), 32, { N: Number(n), r: Number(r), p: Number(p), maxmem: COST.maxmem });
  const expected = Buffer.from(hash, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const label = (userId: string, kind: string) => `account:${userId}:${kind}`;

async function passwordKey(password: string, salt: string) {
  return scrypt(password.normalize("NFC"), Buffer.from(salt, "base64url"), 32, COST);
}

export async function sealWithPassword(dataKey: Buffer, password: string, userId: string): Promise<NonNullable<KeyEnvelopes["password"]>> {
  const salt = randomBytes(16).toString("base64url");
  return { salt, sealed: seal(dataKey.toString("base64"), await passwordKey(password, salt), label(userId, "password")) };
}

export async function openWithPassword(envelope: KeyEnvelopes["password"], password: string, userId: string): Promise<Buffer | null> {
  if (!envelope) return null;
  const value = open<string>(envelope.sealed, await passwordKey(password, envelope.salt), label(userId, "password"));
  return value ? Buffer.from(value, "base64") : null;
}

// 20 characters from an alphabet without look-alikes (≈100 bits), shown as 5 groups.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newRecoveryCode(): string {
  const bytes = randomBytes(20);
  const chars = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
  return chars.match(/.{4}/g)!.join("-");
}
const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
const recoveryKey = (code: string, userId: string) => Buffer.from(hkdfSync("sha256", normalizeCode(code), "dalgeurak-recovery-v1", userId, 32));

export function sealWithRecovery(dataKey: Buffer, code: string, userId: string): string {
  return seal(dataKey.toString("base64"), recoveryKey(code, userId), label(userId, "recovery"));
}
export function openWithRecovery(sealed: string | undefined, code: string, userId: string): Buffer | null {
  if (!sealed || normalizeCode(code).length !== 20) return null;
  const value = open<string>(sealed, recoveryKey(code, userId), label(userId, "recovery"));
  return value ? Buffer.from(value, "base64") : null;
}

// VAULT_MASTER_KEY is only for Google accounts that agreed to the server-held
// lock. It is separate from SESSION_SECRET so rotating one leaves the other.
function masterKey(userId: string): Buffer {
  const secret = process.env.VAULT_MASTER_KEY;
  if (!secret || secret.length < 32) throw new Error("VAULT_MASTER_KEY가 설정되지 않았어요(32자 이상).");
  return Buffer.from(hkdfSync("sha256", secret, "dalgeurak-server-lock-v1", userId, 32));
}
export function sealWithServer(dataKey: Buffer, userId: string): string {
  return seal(dataKey.toString("base64"), masterKey(userId), label(userId, "server"));
}
export function openWithServer(sealed: string | undefined, userId: string): Buffer | null {
  if (!sealed) return null;
  const value = open<string>(sealed, masterKey(userId), label(userId, "server"));
  return value ? Buffer.from(value, "base64") : null;
}

export const newDataKey = () => randomBytes(32);
