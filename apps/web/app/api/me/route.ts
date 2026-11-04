import { NextRequest, NextResponse } from "next/server";
import { publicUrl } from "../../../lib/request-security";
import { getViewer, unauthorized } from "../../../lib/viewer";

// The signed-in person's own connector address and which clients have used it.
export async function GET(request: NextRequest) {
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  if (viewer.kind === "operator") return NextResponse.json({ kind: "operator", connectorUrl: null, clients: [] }, { headers: { "cache-control": "private, no-store" } });
  return NextResponse.json({
    kind: "user", name: viewer.user.name,
    connectorUrl: publicUrl(request, `/api/mcp/${viewer.token}`).toString(),
    clients: viewer.user.clients ?? []
  }, { headers: { "cache-control": "private, no-store" } });
}
