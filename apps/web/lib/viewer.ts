import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { openSession } from "./auth-store";
import { readSession, sessionSecretFrom, userTokenFrom } from "./session";
import { findUserByToken, getActiveUser, type PublicUser } from "./users";
import { vaultFor, withVault, type Vault } from "./vault";
import type { LocalProject } from "./project-types";

// Who is looking: the operator (password login) sees only the projects made
// with that login, never a participant's; a participant sees only their own.
// A participant arrives with either their old secret link ("link") or an
// email/Google session ("session"); both carry the key to their records.
export type Viewer =
  | { kind: "operator" }
  | { kind: "user"; user: PublicUser; vault: Vault; via: "link"; token: string }
  | { kind: "user"; user: PublicUser; vault: Vault; via: "session"; sessionSecret: string };

export const SESSION_COOKIE = "dalgeurak_session";

export async function viewerFromCookie(cookie: string | undefined): Promise<Viewer | null> {
  const token = userTokenFrom(cookie);
  if (token) {
    const user = await findUserByToken(token);
    return user ? { kind: "user", user, vault: vaultFor(token, user.id), via: "link", token } : null;
  }
  const secret = sessionSecretFrom(cookie);
  if (secret) {
    const session = await openSession(secret);
    const user = session ? await getActiveUser(session.userId) : null;
    return session && user ? { kind: "user", user, vault: { ownerId: user.id, key: session.dataKey }, via: "session", sessionSecret: secret } : null;
  }
  return (await readSession(cookie, process.env.SESSION_SECRET)) ? { kind: "operator" } : null;
}

export async function getViewer(request: NextRequest): Promise<Viewer | null> {
  return viewerFromCookie(request.cookies.get(SESSION_COOKIE)?.value);
}

// Wraps a route handler so the store can open the signed-in participant's
// sealed records for this request, and only theirs. Operator requests and
// anonymous requests run with no key.
export function withViewerVault<A extends unknown[]>(handler: (request: NextRequest, ...rest: A) => Promise<Response>) {
  return async (request: NextRequest, ...rest: A): Promise<Response> => {
    const viewer = await getViewer(request);
    return withVault(viewer?.kind === "user" ? viewer.vault : null, () => handler(request, ...rest));
  };
}

export function ownerIdOf(viewer: Viewer): string | null {
  return viewer.kind === "user" ? viewer.user.id : null;
}

export function canAccess(viewer: Viewer, project: Pick<LocalProject, "ownerId"> | null | undefined): boolean {
  if (!project) return false;
  return viewer.kind === "operator" ? !project.ownerId : project.ownerId === viewer.user.id;
}

export function canUseWebAi(viewer: Viewer): boolean {
  return viewer.kind === "operator" || viewer.user.webAi;
}

export const unauthorized = () => NextResponse.json({ error: "다시 로그인해주세요." }, { status: 401 });
export const notFound = () => NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
export const webAiDenied = () => NextResponse.json({ error: "이 계정은 Claude 커넥터로 대화하는 계정이에요. 대화와 설계는 내 Claude에서 이어가고, 여기서는 확인과 승인만 해주세요." }, { status: 403 });
