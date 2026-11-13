import type { NextRequest } from "next/server";
import { arrivedOrigin, publicUrl } from "./request-security";

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

// Token-in-path connector for tools without OAuth (lands in access logs).
export const legacyConnectorLink = (request: NextRequest, token: string) => publicUrl(request, `/api/mcp/${token}`).toString();

// The OAuth connector address: the same for everyone, safe to show anywhere.
// 요청이 들어온 주소 기준: Railway 주소로 등록한 커넥터와 dalgrak.app 으로 등록한 커넥터가 둘 다 맞는 메타데이터를 받는다.
export const mcpResource = (request: NextRequest) => new URL("/api/mcp", arrivedOrigin(request)).toString();
export const issuer = (request: NextRequest) => arrivedOrigin(request);
