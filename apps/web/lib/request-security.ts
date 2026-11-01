import type { NextRequest } from "next/server";

// Behind a hosting proxy (Railway etc.) nextUrl carries the internal address,
// so the public origin comes from APP_BASE_URL or the forwarded headers.
export function publicOrigin(request: NextRequest): string {
  const configured = process.env.APP_BASE_URL;
  if (configured) return new URL(configured).origin;
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  if (host) return `${proto || "https"}://${host}`;
  return request.nextUrl.origin;
}

export function publicUrl(request: NextRequest, path: string): URL {
  return new URL(path, publicOrigin(request));
}

export function hasValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === publicOrigin(request) || origin === request.nextUrl.origin;
}
