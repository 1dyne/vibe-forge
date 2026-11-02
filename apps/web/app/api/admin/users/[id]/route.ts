import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidOrigin } from "../../../../../lib/request-security";
import { updateUser } from "../../../../../lib/users";
import { getViewer } from "../../../../../lib/viewer";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if ((await getViewer(request))?.kind !== "operator") return NextResponse.json({ error: "운영자만 사용할 수 있어요." }, { status: 403 });
  const parsed = z.object({ webAi: z.boolean().optional(), revoke: z.literal(true).optional() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "입력값을 확인해주세요." }, { status: 400 });
  try {
    const { id } = await context.params;
    return NextResponse.json({ user: await updateUser(id, parsed.data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "변경하지 못했습니다." }, { status: 404 });
  }
}
