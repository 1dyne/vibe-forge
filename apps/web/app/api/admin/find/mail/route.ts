import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isOperator } from "../../../../../lib/find/admin-auth";
import { hasValidOrigin } from "../../../../../lib/request-security";
import { updateMail } from "../../../../../lib/find/village-store";

const Body = z.object({ id: z.string().min(4).max(32), status: z.enum(["new", "reading", "planned", "done", "wontdo"]), reply: z.string().max(300).nullable() }).strict();

// 우체통 편지 상태·답장 (운영자만). 보통은 노션에서 바꾸고, 급할 때 여기서.
export async function PATCH(request: NextRequest) {
  if (!(await isOperator())) return NextResponse.json({ error: "운영자만 바꿀 수 있어요." }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const reply = parsed.data.reply?.trim() || null;
  await updateMail(parsed.data.id!, { status: parsed.data.status!, reply, replySeen: false });
  return NextResponse.json({ ok: true });
}
