import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readSession } from "./session";
import { getActiveUser, type PublicUser } from "./users";
import type { LocalProject } from "./project-types";

// Who is looking: the operator (password login) sees only the projects made
// with that login, never a participant's; an invited user sees only their own.
// The operator runs the in-app AI; an invited user runs it only when allowed.
export type Viewer = { kind: "operator" } | { kind: "user"; user: PublicUser };

export async function getViewer(request: NextRequest): Promise<Viewer | null> {
  const session = await readSession(request.cookies.get("dalgeurak_session")?.value, process.env.SESSION_SECRET);
  if (!session) return null;
  if (!session.userId) return { kind: "operator" };
  const user = await getActiveUser(session.userId);
  return user ? { kind: "user", user } : null;
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
