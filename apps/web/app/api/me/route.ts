import { NextRequest, NextResponse } from "next/server";
import { publicUrl } from "../../../lib/request-security";
import { revealToken } from "../../../lib/users";
import { getViewer, unauthorized } from "../../../lib/viewer";

// The signed-in person's own connector address and which clients have used it.
export async function GET(request: NextRequest) {
  const viewer = await getViewer(request);
  if (!viewer) return unauthorized();
  if (viewer.kind === "operator") return NextResponse.json({ kind: "operator", connectorUrl: null, clients: [] }, { headers: { "cache-control": "private, no-store" } });
  const token = await revealToken(viewer.user.id);
  return NextResponse.json({
    kind: "user", name: viewer.user.name,
    connectorUrl: token ? publicUrl(request, `/api/mcp/${token}`).toString() : null,
    clients: viewer.user.clients ?? []
  }, { headers: { "cache-control": "private, no-store" } });
}
