import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "../../../lib/audit";
import { deleteOwnerData, rekeyOwnerData } from "../../../lib/local-project-store";
import { clientIp, hit, tooMany } from "../../../lib/rate-limit";
import { hasValidOrigin } from "../../../lib/request-security";
import { connectorLink, dashboardLink } from "../../../lib/links";
import { userSessionValue } from "../../../lib/session";
import { deleteUser, replaceToken, updateUser } from "../../../lib/users";
import { vaultFor } from "../../../lib/vault";
import { getViewer, unauthorized } from "../../../lib/viewer";

const noStore = { "cache-control": "private, no-store" };
const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

// The signed-in person's own connector address and which clients have used it.
export async function GET(request: NextRequest) {
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  if (viewer.kind === "operator") return NextResponse.json({ kind: "operator", connectorUrl: null, clients: [] }, { headers: noStore });
  return NextResponse.json({
    kind: "user", name: viewer.user.name,
    connectorUrl: connectorLink(request, viewer.token),
    dashboardUrl: dashboardLink(request, viewer.token),
    clients: viewer.user.clients ?? [],
    createdAt: viewer.user.createdAt,
    consent: viewer.user.consent ?? null
  }, { headers: noStore });
}

// Issues a new link (when the old one may have leaked). Records are re-sealed
// with the new token; the old connector and dashboard links stop working.
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer || viewer.kind !== "user") return unauthorized();
  const parsed = z.object({ action: z.literal("rotate_link") }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "요청을 확인해주세요." }, { status: 400 });
  const limited = hit("account", viewer.user.id);
  if (!limited.ok) return tooMany(limited.retryAfterSec);
  const token = randomBytes(24).toString("base64url");
  try {
    await rekeyOwnerData(vaultFor(viewer.token, viewer.user.id), vaultFor(token, viewer.user.id), () => replaceToken(viewer.user.id, viewer.token, token));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "링크를 바꾸지 못했어요." }, { status: 409 });
  }
  await audit("link_rotated", { userId: viewer.user.id });
  const response = NextResponse.json({
    connectorUrl: connectorLink(request, token),
    dashboardUrl: dashboardLink(request, token)
  }, { headers: noStore });
  response.cookies.set("dalgeurak_session", userSessionValue(token), { ...cookieOptions, maxAge: 60 * 60 * 24 * 30 });
  return response;
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
  const removedProjects = await deleteOwnerData(viewer.user.id);
  await deleteUser(viewer.user.id);
  await audit("user_erased_self", { userId: viewer.user.id });
  const response = NextResponse.json({ removedProjects }, { headers: noStore });
  response.cookies.set("dalgeurak_session", "", { ...cookieOptions, maxAge: 0 });
  return response;
}
