import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { corsHeaders, preflight } from "../../../../lib/oauth-metadata";
import { OAuthError, registerClient } from "../../../../lib/oauth";
import { clientIp, hit } from "../../../../lib/rate-limit";

const Registration = z.object({
  client_name: z.string().max(200).optional(),
  redirect_uris: z.array(z.string().max(500)).min(1).max(10),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional()
}).passthrough();

// Dynamic client registration (RFC 7591) for public clients such as claude.ai.
export async function POST(request: NextRequest) {
  if (!hit("oauthRegister", clientIp(request)).ok) return NextResponse.json({ error: "invalid_request", error_description: "too many registrations" }, { status: 429, headers: corsHeaders });
  const parsed = Registration.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_client_metadata", error_description: "redirect_uris is required" }, { status: 400, headers: corsHeaders });
  if (parsed.data.token_endpoint_auth_method && parsed.data.token_endpoint_auth_method !== "none") return NextResponse.json({ error: "invalid_client_metadata", error_description: "only public clients (token_endpoint_auth_method=none) are supported" }, { status: 400, headers: corsHeaders });
  try {
    const client = await registerClient(parsed.data.client_name ?? "", parsed.data.redirect_uris);
    return NextResponse.json({
      client_id: client.id, client_name: client.name, redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none",
      client_id_issued_at: Math.floor(new Date(client.createdAt).getTime() / 1000)
    }, { status: 201, headers: corsHeaders });
  } catch (error) {
    if (error instanceof OAuthError) return NextResponse.json({ error: error.code, error_description: error.message }, { status: 400, headers: corsHeaders });
    throw error;
  }
}
export const OPTIONS = preflight;
