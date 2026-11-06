import { randomBytes } from "node:crypto";
import { forgetUser } from "../../../lib/notify";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { changePassword, newRecovery, setPassword, switchLock } from "../../../lib/account-service";
import { audit } from "../../../lib/audit";
import { createSession, endUserSessions, SESSION_LONG_MS } from "../../../lib/auth-store";
import { failure, origin, setAccountCookie } from "../../../lib/auth-http";
import { dashboardLink, legacyConnectorLink, mcpResource } from "../../../lib/links";
import { deleteOwnerData, rekeyOwnerData } from "../../../lib/local-project-store";
import { revokeUserGrants } from "../../../lib/oauth";
import { clientIp, hit, tooMany } from "../../../lib/rate-limit";
import { hasValidOrigin } from "../../../lib/request-security";
import { userSessionValue } from "../../../lib/session";
import { changeAccount, deleteUser, replaceToken, updateUser } from "../../../lib/users";
import { vaultFor } from "../../../lib/vault";
import { getViewer, unauthorized } from "../../../lib/viewer";

const noStore = { "cache-control": "private, no-store" };
const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

// The signed-in person's account: how they sign in, how their records are
// locked, their connector address and (old link accounts only) their link.
export async function GET(request: NextRequest) {
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  if (viewer.kind === "operator") return NextResponse.json({ kind: "operator", connectorUrl: null, clients: [] }, { headers: noStore });
  const { user } = viewer;
  return NextResponse.json({
    kind: "user", name: user.name, auth: user.auth, email: user.email ?? null, emailVerified: Boolean(user.emailVerifiedAt),
    lock: user.lock, passwordSet: user.passwordSet,
    connectorUrl: mcpResource(request),
    ...(viewer.via === "link" ? { legacyConnectorUrl: legacyConnectorLink(request, viewer.token), dashboardUrl: dashboardLink(request, viewer.token) } : {}),
    clients: user.clients ?? [], createdAt: user.createdAt, consent: user.consent ?? null, googleConsent: user.googleConsent ?? null
  }, { headers: noStore });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rotate_link") }).strict(),
  z.object({ action: z.literal("set_password"), password: z.string().max(200), email: z.string().trim().max(254).optional() }).strict(),
  z.object({ action: z.literal("change_password"), current: z.string().max(200), next: z.string().max(200) }).strict(),
  z.object({ action: z.literal("new_recovery"), password: z.string().max(200) }).strict(),
  z.object({ action: z.literal("switch_lock"), to: z.enum(["sealed", "server"]), password: z.string().max(200) }).strict(),
  z.object({ action: z.literal("rename"), name: z.string().trim().min(1).max(30) }).strict(),
  z.object({ action: z.literal("reset_records"), confirm: z.literal("초기화") }).strict()
]);

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer || viewer.kind !== "user") return unauthorized();
  const parsed = Action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "요청을 확인해주세요." }, { status: 400 });
  const limited = hit("account", viewer.user.id);
  if (!limited.ok) return tooMany(limited.retryAfterSec);
  const input = parsed.data;
  try {
    if (input.action === "rotate_link") {
      if (viewer.via !== "link") return NextResponse.json({ error: "링크 계정에서만 쓸 수 있어요." }, { status: 400 });
      // Issues a new link (when the old one may have leaked). Records are
      // re-sealed with the new token; the old link and connected apps stop.
      const token = randomBytes(24).toString("base64url");
      await rekeyOwnerData(vaultFor(viewer.token, viewer.user.id), vaultFor(token, viewer.user.id), () => replaceToken(viewer.user.id, viewer.token, token));
      await revokeUserGrants(viewer.user.id);
      await audit("link_rotated", { userId: viewer.user.id });
      const response = NextResponse.json({ connectorUrl: mcpResource(request), legacyConnectorUrl: legacyConnectorLink(request, token), dashboardUrl: dashboardLink(request, token) }, { headers: noStore });
      response.cookies.set("dalgeurak_session", userSessionValue(token), { ...cookieOptions, maxAge: 60 * 60 * 24 * 30 });
      return response;
    }
    if (input.action === "switch_lock") {
      await switchLock({ user: viewer.user, dataKey: viewer.vault.key, password: input.password, to: input.to as "sealed" | "server" });
      return NextResponse.json({ lock: input.to === "server" ? "server" : "password" }, { headers: noStore });
    }
    if (input.action === "set_password") {
      const result = await setPassword({ user: viewer.user, dataKey: viewer.vault.key, password: input.password, email: input.email, origin: origin(request) });
      // A link account becomes an email account: its link stops, so give the
      // browser a regular session now.
      const response = NextResponse.json(result, { headers: noStore });
      if (viewer.via === "link") {
        await revokeUserGrants(viewer.user.id);
        setAccountCookie(response, await createSession(viewer.user.id, viewer.vault.key, SESSION_LONG_MS), SESSION_LONG_MS);
      }
      return response;
    }
    if (input.action === "change_password") {
      await changePassword({ user: viewer.user, dataKey: viewer.vault.key, current: input.current, next: input.next, keepSession: viewer.via === "session" ? viewer.sessionSecret : undefined });
      return NextResponse.json({ ok: true }, { headers: noStore });
    }
    if (input.action === "rename") {
      const user = await changeAccount(viewer.user.id, (record) => { record.name = input.name; });
      return NextResponse.json({ name: user.name }, { headers: noStore });
    }
    if (input.action === "reset_records") {
      // Starts over in the same account: every project and the maker profile
      // go; sign-in, links and connected apps stay.
      const removedProjects = await deleteOwnerData(viewer.user.id);
      await audit("records_reset", { userId: viewer.user.id });
      return NextResponse.json({ removedProjects }, { headers: noStore });
    }
    return NextResponse.json({ recoveryCode: await newRecovery({ user: viewer.user, dataKey: viewer.vault.key, password: input.password }) }, { headers: noStore });
  } catch (error) {
    return failure(error, "변경하지 못했어요.");
  }
}

// Leaving: erases the account, every project and the maker profile at once.
export async function DELETE(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer || viewer.kind !== "user") return unauthorized();
  const limited = hit("account", clientIp(request));
  if (!limited.ok) return tooMany(limited.retryAfterSec);
  const parsed = z.object({ confirm: z.literal("탈퇴") }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "확인 문구로 ‘탈퇴’를 입력해주세요." }, { status: 400 });
  await updateUser(viewer.user.id, { revoke: true });
  await revokeUserGrants(viewer.user.id);
  await endUserSessions(viewer.user.id);
  const removedProjects = await deleteOwnerData(viewer.user.id);
  await deleteUser(viewer.user.id);
  await forgetUser(viewer.user.id).catch(() => {});
  await audit("user_erased_self", { userId: viewer.user.id });
  const response = NextResponse.json({ removedProjects }, { headers: noStore });
  response.cookies.set("dalgeurak_session", "", { ...cookieOptions, maxAge: 0 });
  return response;
}
