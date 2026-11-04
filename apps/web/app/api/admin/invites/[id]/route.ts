import { NextRequest, NextResponse } from "next/server";
import { audit } from "../../../../../lib/audit";
import { hasValidOrigin } from "../../../../../lib/request-security";
import { disableInvite } from "../../../../../lib/users";
import { getViewer } from "../../../../../lib/viewer";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if ((await getViewer(request))?.kind !== "operator") return NextResponse.json({ error: "운영자만 사용할 수 있어요." }, { status: 403 });
  try {
    const { id } = await context.params;
    await disableInvite(id);
    await audit("invite_disabled", { inviteId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "중지하지 못했습니다." }, { status: 404 });
  }
}
