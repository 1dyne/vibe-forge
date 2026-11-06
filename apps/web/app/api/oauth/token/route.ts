import { NextRequest, NextResponse } from "next/server";
import { corsHeaders, preflight } from "../../../../lib/oauth-metadata";
import { OAuthError, exchangeCode, refreshGrant } from "../../../../lib/oauth";
import { clientIp, exhausted, hit } from "../../../../lib/rate-limit";

const fail = (code: string, description: string, status = 400) => NextResponse.json({ error: code, error_description: description }, { status, headers: corsHeaders });

// Token endpoint (authorization_code with PKCE, refresh_token with rotation).
// Server-to-server from the client, so no cookies and no Origin check.
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (exhausted("linkFailure", ip)) return fail("invalid_request", "too many failed attempts", 429);
  const type = request.headers.get("content-type") ?? "";
  const raw = type.includes("application/json") ? await request.json().catch(() => ({})) : Object.fromEntries(new URLSearchParams(await request.text()));
  const field = (name: string) => (typeof raw?.[name] === "string" ? raw[name] as string : "");
  try {
    const grantType = field("grant_type");
    const clientId = field("client_id");
    if (!clientId) return fail("invalid_client", "client_id is required", 401);
    const tokens = grantType === "authorization_code"
      ? await exchangeCode({ code: field("code"), clientId, redirectUri: field("redirect_uri"), verifier: field("code_verifier") })
      : grantType === "refresh_token"
        ? await refreshGrant({ refreshToken: field("refresh_token"), clientId })
        : null;
    if (!tokens) return fail("unsupported_grant_type", "use authorization_code or refresh_token");
    return NextResponse.json(tokens, { headers: { ...corsHeaders, pragma: "no-cache" } });
  } catch (error) {
    if (error instanceof OAuthError) {
      hit("linkFailure", ip);
      return fail(error.code, error.message);
    }
    throw error;
  }
}
export const OPTIONS = preflight;
