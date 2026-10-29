import type { NextRequest } from "next/server";

export function hasValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}
