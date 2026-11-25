import type { NextRequest } from "next/server";
import { authenticateAccess } from "./oauth";
import { getActiveUser, type PublicUser } from "./users";
import type { Vault } from "./vault";

// 도우미는 커넥터와 같은 OAuth 토큰으로 온다(/api/mcp와 같은 로그인).
// 그 토큰에 든 열쇠로 그 사람의 기록만 열 수 있다.
export async function helperSession(request: NextRequest): Promise<{ user: PublicUser; vault: Vault } | null> {
  const token = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const session = await authenticateAccess(token);
  const user = session ? await getActiveUser(session.userId) : null;
  return session && user ? { user, vault: { ownerId: user.id, key: session.dataKey } } : null;
}

export const helperUnauthorized = () => Response.json({ error: "login required" }, { status: 401, headers: { "www-authenticate": "Bearer" } });
