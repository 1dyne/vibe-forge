import { NextRequest, NextResponse } from "next/server";
import { helperStatus } from "../../../../lib/helper-relay";
import { getViewer, unauthorized } from "../../../../lib/viewer";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  if (viewer.kind !== "user") return NextResponse.json({ online: false, model: null, version: null, account: null });
  return NextResponse.json(helperStatus(viewer.user.id), { headers: { "cache-control": "no-store" } });
}
