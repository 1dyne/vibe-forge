import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidOrigin } from "../../../../../lib/request-security";
import { deleteOwnerData } from "../../../../../lib/local-project-store";
import { deleteUser, updateUser } from "../../../../../lib/users";
import { getViewer } from "../../../../../lib/viewer";
import { audit } from "../../../../../lib/audit";
import { revokeUserGrants } from "../../../../../lib/oauth";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if ((await getViewer(request))?.kind !== "operator") return NextResponse.json({ error: "운영자만 사용할 수 있어요." }, { status: 403 });
  const parsed = z.object({ webAi: z.boolean().optional(), revoke: z.literal(true).optional() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "입력값을 확인해주세요." }, { status: 400 });
  try {
    const { id } = await context.params;
    const user = await updateUser(id, parsed.data);
    if (parsed.data.revoke) {
      await revokeUserGrants(id);
      await audit("user_revoked", { userId: id });
    }
    if (parsed.data.webAi !== undefined) await audit("web_ai_changed", { userId: id, note: String(parsed.data.webAi) });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "변경하지 못했습니다." }, { status: 404 });
  }
}

// Erases the participant and everything they left. Stops the link first, so
// nothing new can be saved while the records are being removed.
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if ((await getViewer(request))?.kind !== "operator") return NextResponse.json({ error: "운영자만 사용할 수 있어요." }, { status: 403 });
  try {
    const { id } = await context.params;
    await updateUser(id, { revoke: true });
    await revokeUserGrants(id);
    const removedProjects = await deleteOwnerData(id);
    await deleteUser(id);
    await audit("user_erased_by_operator", { userId: id });
    return NextResponse.json({ removedProjects });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "삭제하지 못했습니다." }, { status: 404 });
  }
}
