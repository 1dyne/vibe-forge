import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readSession, userTokenFrom } from "./session";
import { findUserByToken, type PublicUser } from "./users";
import { vaultFor, withVault } from "./vault";
import type { LocalProject } from "./project-types";

// Who is looking: the operator (password login) sees only the projects made
// with that login, never a participant's; an invited user sees only their own.
// The operator runs the in-app AI; an invited user runs it only when allowed.
export type Viewer = { kind: "operator" } | { kind: "user"; user: PublicUser; token: string };

const SESSION_COOKIE = "dalgeurak_session";

export async function getViewer(request: NextRequest): Promise<Viewer | null> {
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const token = userTokenFrom(cookie);
  if (token) {
    const user = await findUserByToken(token);
    return user ? { kind: "user", user, token } : null;
  }
  return (await readSession(cookie, process.env.SESSION_SECRET)) ? { kind: "operator" } : null;
}

// Wraps a route handler so the store can open the signed-in participant's
// sealed records for this request, and only theirs. Operator requests and
// anonymous requests run with no key.
export function withViewerVault<A extends unknown[]>(handler: (request: NextRequest, ...rest: A) => Promise<Response>) {
  return async (request: NextRequest, ...rest: A): Promise<Response> => {
    const viewer = await getViewer(request);
    const vault = viewer?.kind === "user" ? vaultFor(viewer.token, viewer.user.id) : null;
    return withVault(vault, () => handler(request, ...rest));
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
