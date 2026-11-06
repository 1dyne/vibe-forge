import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isOperator } from "../../../../../lib/find/admin-auth";
import { removeEntry } from "../../../../../lib/find/store";
import { hasValidOrigin } from "../../../../../lib/request-security";

const Body = z.object({ id: z.string().min(4).max(32) }).strict();

// 삭제 요청이 오면 대기 신청과 그 사람의 도깨비불을 함께 지운다 (운영자만)
export async function DELETE(request: NextRequest) {
  if (!(await isOperator())) return NextResponse.json({ error: "운영자만 지울 수 있어요." }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  return NextResponse.json({ removed: await removeEntry(parsed.data.id!) });
}
