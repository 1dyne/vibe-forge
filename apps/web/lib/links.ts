import type { NextRequest } from "next/server";
import { publicUrl } from "./request-security";

// Dashboard links keep the token after "#": browsers never send the fragment
// to the server, so it stays out of hosting access logs. The connector URL has
// to carry the token in its path (claude.ai custom connectors without OAuth).
export function dashboardLink(request: NextRequest, token: string, params?: Record<string, string>): string {
  const url = publicUrl(request, "/u");
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  url.hash = token;
  return url.toString();
}

export function withLinkParams(dashboardUrl: string, params: Record<string, string>): string {
  const url = new URL(dashboardUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export const connectorLink = (request: NextRequest, token: string) => publicUrl(request, `/api/mcp/${token}`).toString();
