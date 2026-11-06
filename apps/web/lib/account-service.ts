import { createEmailToken, consumeEmailToken, createSession, endUserSessions, SESSION_LONG_MS, SESSION_SHORT_MS } from "./auth-store";
import { hashPassword, newDataKey, newRecoveryCode, openWithPassword, openWithRecovery, openWithServer, passwordProblem, sealWithPassword, sealWithRecovery, sealWithServer, verifyPassword } from "./account-keys";
import { audit } from "./audit";
import { deleteOwnerData } from "./local-project-store";
import { resetMail, sendMail, verifyMail } from "./mailer";
import { revokeUserGrants } from "./oauth";
import { GOOGLE_NOTICE_VERSION, PRIVACY_VERSION, TERMS_VERSION } from "./policies";
import { randomUUID } from "node:crypto";
import { accountByEmail, accountByGoogle, accountById, changeAccount, createAccount, normalizeEmail, SignupError, toPublicUser, type Consent, type ForgeUser, type PublicUser } from "./users";

export class AccountError extends Error {
  constructor(message: string, public status = 400, public code?: "unverified" | "locked") { super(message); }
}

const consentNow = (): Consent => ({ termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, ageConfirmed: true, agreedAt: new Date().toISOString() });
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

// The person chooses how their records are locked when they sign up:
// "sealed"  – only their password or recovery code opens the records; the
//             operator cannot, and a forgotten password without the code
//             loses them.
// "server"  – the server also keeps a key (VAULT_MASTER_KEY), so a password
//             reset keeps the records and the server can work on them while
//             the person is away. They can switch later in 내 계정.
export type LockChoice = "sealed" | "server";
export const serverLockAvailable = () => (process.env.VAULT_MASTER_KEY ?? "").length >= 32;
export async function signUpWithEmail(input: { name: string; email: string; password: string; inviteCode?: string; origin: string; lock?: LockChoice }): Promise<{ user: PublicUser; recoveryCode: string }> {
  const email = normalizeEmail(input.email);
  if (!EMAIL.test(email)) throw new AccountError("이메일 주소를 확인해주세요.");
  const problem = passwordProblem(input.password, email);
  if (problem) throw new AccountError(problem);
  const id = randomUUID();
  const dataKey = newDataKey();
  const recoveryCode = newRecoveryCode();
  if (input.lock === "server" && !serverLockAvailable()) throw new AccountError("지금은 서버 보관을 고를 수 없어요. 잠금 보관으로 가입해주세요.", 409);
  const keys = { password: await sealWithPassword(dataKey, input.password, id), recovery: sealWithRecovery(dataKey, recoveryCode, id), ...(input.lock === "server" ? { server: sealWithServer(dataKey, id) } : {}) };
  const user = await createAccount({ id, name: input.name, email, auth: "password", emailVerified: false, passwordHash: await hashPassword(input.password), keys, consent: consentNow(), inviteCode: input.inviteCode })
    .catch((error) => { if (error instanceof SignupError) throw new AccountError(error.message, 403); throw error; });
  await sendVerification(user.id, email, user.name, input.origin);
  await audit("user_signed_up", { userId: user.id, note: "email" });
  return { user, recoveryCode };
}

export async function sendVerification(userId: string, email: string, name: string, origin: string) {
  const token = await createEmailToken(userId, "verify");
  await sendMail(verifyMail(email, name, `${origin}/auth/verify#${token}`));
}

export async function resendVerification(email: string, origin: string): Promise<void> {
  const account = await accountByEmail(email);
  if (!account || account.emailVerifiedAt || !account.email) return;
  await sendVerification(account.id, account.email, account.name, origin);
}

export async function verifyEmail(token: string): Promise<PublicUser> {
  const userId = await consumeEmailToken(token, "verify");
  if (!userId) throw new AccountError("인증 링크가 만료됐거나 이미 사용됐어요. 로그인 화면에서 인증 메일을 다시 받아주세요.");
  const user = await changeAccount(userId, (record) => { record.emailVerifiedAt ??= new Date().toISOString(); });
  await audit("email_verified", { userId });
  return user;
}

export async function logIn(email: string, password: string, remember: boolean): Promise<{ user: PublicUser; secret: string; maxAgeMs: number }> {
  const account = await accountByEmail(email);
  const ok = await verifyPassword(password, account?.passwordHash);
  if (!account || !ok) throw new AccountError("이메일 또는 비밀번호가 맞지 않아요.", 401);
  if (!account.emailVerifiedAt) throw new AccountError("이메일 인증을 먼저 해주세요. 메일함의 인증 링크를 누르면 로그인할 수 있어요.", 403, "unverified");
  const dataKey = await openWithPassword(account.keys?.password, password, account.id);
  if (!dataKey) throw new AccountError("기록 잠금을 열지 못했어요. 비밀번호 찾기로 복구 코드를 사용해주세요.", 409);
  const maxAgeMs = remember ? SESSION_LONG_MS : SESSION_SHORT_MS;
  return { user: toPublicUser(account), secret: await createSession(account.id, dataKey, maxAgeMs), maxAgeMs };
}

export async function requestReset(email: string, origin: string): Promise<void> {
  const account = await accountByEmail(email);
  // Same answer whether or not the address exists.
  if (!account?.email || !account.keys?.password) return;
  const token = await createEmailToken(account.id, "reset");
  await sendMail(resetMail(account.email, `${origin}/auth/reset#${token}`));
  await audit("password_reset_requested", { userId: account.id });
}

// With the recovery code the records stay; without it the person can still
// take the account back, but the old records are erased since nobody can open them.
export async function resetPassword(input: { token: string; password: string; recoveryCode?: string; abandon?: boolean }): Promise<{ recoveryCode: string; keptRecords: boolean }> {
  const userId = await consumeEmailToken(input.token, "reset");
  if (!userId) throw new AccountError("링크가 만료됐거나 이미 사용됐어요. 비밀번호 찾기를 다시 해주세요.");
  const account = await accountById(userId);
  if (!account) throw new AccountError("계정을 찾을 수 없어요.", 404);
  const problem = passwordProblem(input.password, account.email);
  if (problem) throw new AccountError(problem);
  // Server-held lock: the records survive a reset without the recovery code.
  let dataKey = input.recoveryCode ? openWithRecovery(account.keys?.recovery, input.recoveryCode, userId) : null;
  const serverKept = account.keys?.server && account.keys.password ? openWithServer(account.keys.server, userId) : null;
  if (!dataKey && serverKept) dataKey = serverKept;
  if (!dataKey && !input.abandon) throw new AccountError("복구 코드가 맞지 않아요. 다시 확인하거나 ‘복구 코드가 없어요’를 선택해주세요.");
  const keptRecords = Boolean(dataKey);
  if (!dataKey) {
    await deleteOwnerData(userId);
    dataKey = newDataKey();
  }
  const recoveryCode = newRecoveryCode();
  const passwordEnvelope = await sealWithPassword(dataKey, input.password, userId);
  const passwordHash = await hashPassword(input.password);
  await changeAccount(userId, (record) => { record.passwordHash = passwordHash; record.keys = { password: passwordEnvelope, recovery: sealWithRecovery(dataKey!, recoveryCode, userId), ...(serverKept ? { server: record.keys!.server } : {}) }; record.emailVerifiedAt ??= new Date().toISOString(); });
  await endUserSessions(userId);
  await revokeUserGrants(userId);
  await audit(keptRecords ? "password_reset" : "password_reset_records_erased", { userId });
  return { recoveryCode, keptRecords };
}

// Sets (or replaces) the password and recovery code for the signed-in person,
// using the data key their current session already holds. Turns a Google
// account with the server-held lock into a password lock, and a link account
// into an email account (the link stops working).
export async function setPassword(input: { user: PublicUser; dataKey: Buffer; password: string; email?: string; origin: string }): Promise<{ recoveryCode: string; verificationSent: boolean }> {
  const current = await accountById(input.user.id);
  if (!current) throw new AccountError("계정을 찾을 수 없어요.", 404);
  const email = current.email ?? (input.email ? normalizeEmail(input.email) : undefined);
  if (!email || !EMAIL.test(email)) throw new AccountError("로그인에 쓸 이메일 주소를 입력해주세요.");
  if (!current.email && await accountByEmail(email)) throw new AccountError("이미 다른 계정에서 쓰는 이메일이에요.");
  const problem = passwordProblem(input.password, email);
  if (problem) throw new AccountError(problem);
  const recoveryCode = newRecoveryCode();
  const passwordEnvelope = await sealWithPassword(input.dataKey, input.password, current.id);
  const passwordHash = await hashPassword(input.password);
  const becameEmailAccount = !current.email;
  await changeAccount(current.id, (record) => {
    record.email = email;
    record.passwordHash = passwordHash;
    record.keys = { password: passwordEnvelope, recovery: sealWithRecovery(input.dataKey, recoveryCode, current.id) };
    if (record.auth === "link" || !record.auth) {
      record.auth = "password";
      record.emailVerifiedAt = null;
      delete record.tokenHash;
    }
  });
  if (becameEmailAccount) await sendVerification(current.id, email, current.name, input.origin);
  await audit(current.auth === "google" ? "lock_upgraded" : becameEmailAccount ? "link_converted" : "password_set", { userId: current.id });
  return { recoveryCode, verificationSent: becameEmailAccount };
}

export async function changePassword(input: { user: PublicUser; dataKey: Buffer; current: string; next: string; keepSession?: string }): Promise<void> {
  const account = await accountById(input.user.id);
  if (!account?.passwordHash || !(await verifyPassword(input.current, account.passwordHash))) throw new AccountError("지금 비밀번호가 맞지 않아요.", 401);
  const problem = passwordProblem(input.next, account.email);
  if (problem) throw new AccountError(problem);
  const passwordEnvelope = await sealWithPassword(input.dataKey, input.next, account.id);
  const passwordHash = await hashPassword(input.next);
  await changeAccount(account.id, (record) => { record.passwordHash = passwordHash; record.keys = { ...record.keys, password: passwordEnvelope }; });
  await endUserSessions(account.id, input.keepSession);
  await audit("password_changed", { userId: account.id });
}

export async function newRecovery(input: { user: PublicUser; dataKey: Buffer; password: string }): Promise<string> {
  const account = await accountById(input.user.id);
  if (!account?.passwordHash || !(await verifyPassword(input.password, account.passwordHash))) throw new AccountError("비밀번호가 맞지 않아요.", 401);
  const recoveryCode = newRecoveryCode();
  await changeAccount(account.id, (record) => { record.keys = { ...record.keys, recovery: sealWithRecovery(input.dataKey, recoveryCode, account.id) }; });
  await audit("recovery_code_replaced", { userId: account.id });
  return recoveryCode;
}

// Google: returns a session, or says a password is needed to open the records.
export type GoogleProfile = { sub: string; email: string; emailVerified: boolean; name: string };
export async function googleSignIn(profile: GoogleProfile, signup: { agreed: boolean; name?: string; inviteCode?: string } | null, remember = true): Promise<{ kind: "session"; secret: string; maxAgeMs: number; user: PublicUser } | { kind: "unlock"; userId: string } | { kind: "needs_signup" }> {
  if (!profile.emailVerified) throw new AccountError("구글 계정의 이메일이 인증되지 않았어요.");
  let account: ForgeUser | null = await accountByGoogle(profile.sub);
  if (!account) {
    const byEmail = await accountByEmail(profile.email);
    if (byEmail) throw new AccountError("이 이메일은 이메일·비밀번호로 가입돼 있어요. 이메일로 로그인해주세요.", 409);
    if (!signup?.agreed) return { kind: "needs_signup" };
    const id = randomUUID();
    const created = await createAccount({
      id, keys: { server: sealWithServer(newDataKey(), id) },
      name: (signup.name?.trim() || profile.name || profile.email.split("@")[0]).slice(0, 30), email: profile.email, auth: "google", emailVerified: true,
      googleSub: profile.sub, consent: consentNow(), googleConsent: { version: GOOGLE_NOTICE_VERSION, agreedAt: new Date().toISOString() }, inviteCode: signup.inviteCode
    }).catch((error) => { if (error instanceof SignupError) throw new AccountError(error.message, 403); throw error; });
    await audit("user_signed_up", { userId: created.id, note: "google" });
    account = await accountById(created.id);
  }
  if (!account) throw new AccountError("계정을 만들지 못했어요.", 500);
  if (!account.keys?.server) return { kind: "unlock", userId: account.id };
  const dataKey = openWithServer(account.keys.server, account.id);
  if (!dataKey) throw new AccountError("기록 잠금을 열지 못했어요. 운영자에게 문의해주세요.", 500);
  const maxAgeMs = remember ? SESSION_LONG_MS : SESSION_SHORT_MS;
  return { kind: "session", secret: await createSession(account.id, dataKey, maxAgeMs), maxAgeMs, user: toPublicUser(account) };
}

// A Google account that set a password: Google proves who it is, the password opens the records.
export async function unlockWithPassword(unlockToken: string, password: string): Promise<{ secret: string; maxAgeMs: number }> {
  const userId = await consumeEmailToken(unlockToken, "unlock");
  const account = userId ? await accountById(userId) : null;
  if (!account) throw new AccountError("다시 구글로 로그인해주세요.", 401);
  if (!(await verifyPassword(password, account.passwordHash))) throw new AccountError("비밀번호가 맞지 않아요. 다시 구글로 로그인해주세요.", 401);
  const dataKey = await openWithPassword(account.keys?.password, password, account.id);
  if (!dataKey) throw new AccountError("기록 잠금을 열지 못했어요.", 409);
  return { secret: await createSession(account.id, dataKey, SESSION_LONG_MS), maxAgeMs: SESSION_LONG_MS };
}

export async function unlockToken(userId: string) {
  return createEmailToken(userId, "unlock");
}

// Switch between the two locks later (내 계정). Needs the password, and the
// records' key from the signed-in session.
export async function switchLock(input: { user: PublicUser; dataKey: Buffer; password: string; to: LockChoice }): Promise<void> {
  const account = await accountById(input.user.id);
  if (!account?.keys?.password || !account.passwordHash) throw new AccountError("비밀번호가 있는 계정에서만 바꿀 수 있어요.");
  if (!(await verifyPassword(input.password, account.passwordHash))) throw new AccountError("비밀번호가 맞지 않아요.", 403);
  if (input.to === "server" && !serverLockAvailable()) throw new AccountError("지금은 서버 보관을 고를 수 없어요.", 409);
  await changeAccount(account.id, (record) => {
    const { server: _server, ...rest } = record.keys ?? {};
    record.keys = input.to === "server" ? { ...rest, server: sealWithServer(input.dataKey, account.id) } : rest;
  });
  await audit(input.to === "server" ? "lock_server" : "lock_sealed", { userId: account.id });
}
