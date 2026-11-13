import { NextRequest, NextResponse } from "next/server";
import { methodNotAllowed, rpcError, serveMcp } from "../../../lib/mcp-server";
import { corsHeaders, preflight } from "../../../lib/oauth-metadata";
import { authenticateAccess } from "../../../lib/oauth";
import { arrivedOrigin, publicUrl } from "../../../lib/request-security";
import { getActiveUser } from "../../../lib/users";

// The connector address everyone adds: /api/mcp with an OAuth bearer token.
// No secret in the URL, so nothing sensitive reaches hosting access logs or
// the conversation where Claude repeats the address.
function unauthorized(request: NextRequest, description: string) {
  const metadata = new URL("/.well-known/oauth-protected-resource/api/mcp", arrivedOrigin(request)).toString();
  return NextResponse.json(rpcError(null, -32001, description), {
    status: 401,
    headers: { ...corsHeaders, "www-authenticate": `Bearer resource_metadata="${metadata}", error="invalid_token", error_description="${description.replace(/"/g, "'")}"` }
  });
}

export async function POST(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return unauthorized(request, "login required");
  const session = await authenticateAccess(token);
  const user = session ? await getActiveUser(session.userId) : null;
  if (!session || !user) return unauthorized(request, "token is invalid or expired");
  const response = await serveMcp(request, { user, vault: { ownerId: user.id, key: session.dataKey }, dashboardUrl: publicUrl(request, "/").toString() });
  for (const [key, value] of Object.entries(corsHeaders)) response.headers.set(key, value);
  return response;
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = preflight;
