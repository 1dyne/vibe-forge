import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { issuer, mcpResource } from "./links";
import { publicUrl } from "./request-security";

const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, authorization, mcp-protocol-version", "cache-control": "no-store" };
export const corsHeaders = cors;
export const preflight = () => new Response(null, { status: 204, headers: cors });

export function protectedResourceMetadata(request: NextRequest) {
  return NextResponse.json({ resource: mcpResource(request), authorization_servers: [issuer(request)], bearer_methods_supported: ["header"], scopes_supported: ["mcp"], resource_name: "달그락 대장간" }, { headers: cors });
}

export function authorizationServerMetadata(request: NextRequest) {
  return NextResponse.json({
    issuer: issuer(request),
    authorization_endpoint: publicUrl(request, "/oauth/authorize").toString(),
    token_endpoint: publicUrl(request, "/api/oauth/token").toString(),
    registration_endpoint: publicUrl(request, "/api/oauth/register").toString(),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"]
  }, { headers: cors });
}
