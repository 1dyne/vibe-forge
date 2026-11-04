import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "../../../../lib/audit";
import { listGrants, revokeGrant } from "../../../../lib/oauth";
import { hasValidOrigin } from "../../../../lib/request-security";
import { getViewer, unauthorized } from "../../../../lib/viewer";

// Apps the participant allowed through OAuth, and disconnecting one.
export async function GET(request: NextRequest) {
  const viewer = await getViewer(request);
  if (!viewer || viewer.kind !== "user") return unauthorized();
  return NextResponse.json({ connections: await listGrants(viewer.user.id) }, { headers: { "cache-control": "private, no-store" } });
}

export async function DELETE(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer || viewer.kind !== "user") return unauthorized();
  const parsed = z.object({ id: z.string().uuid() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "요청을 확인해주세요." }, { status: 400 });
  if (!(await revokeGrant(viewer.user.id, parsed.data.id))) return NextResponse.json({ error: "연결을 찾을 수 없어요." }, { status: 404 });
  await audit("app_disconnected", { userId: viewer.user.id });
  return NextResponse.json({ ok: true });
}
