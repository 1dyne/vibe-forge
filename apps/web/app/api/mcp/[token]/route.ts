import { NextRequest, NextResponse } from "next/server";
import { publicUrl } from "../../../../lib/request-security";
import { methodNotAllowed, rpcError, serveMcp } from "../../../../lib/mcp-server";
import { clientIp, exhausted, hit } from "../../../../lib/rate-limit";
import { findUserByToken } from "../../../../lib/users";
import { vaultFor } from "../../../../lib/vault";

// Older connector URL with the participant's token in the path. Kept for
// tools without OAuth support; the path lands in hosting access logs, so
// /api/mcp with OAuth is the address the dashboard hands out first.
export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const ip = clientIp(request);
  if (exhausted("linkFailure", ip)) return NextResponse.json(rpcError(null, -32002, "요청이 너무 많아요. 잠시 후 다시 시도해주세요."), { status: 429 });
  const user = await findUserByToken(token);
  if (!user) {
    hit("linkFailure", ip);
    return NextResponse.json(rpcError(null, -32001, "커넥터 주소가 올바르지 않거나 사용이 중지됐어요. 대시보드의 내 계정에서 주소를 다시 확인해주세요."), { status: 404 });
  }
  return serveMcp(request, { user, vault: vaultFor(token, user.id), // Links Claude shows carry no token: they end up in the chat history, and
  // the token is the key to the person's records. The dashboard asks the
  // person to sign in instead (the cookie from an earlier visit usually does).
  dashboardUrl: publicUrl(request, "/").toString() });
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
