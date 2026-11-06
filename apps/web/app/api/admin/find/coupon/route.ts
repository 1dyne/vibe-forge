import { isOperator } from "../../../../../lib/find/admin-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { markCoupon } from "../../../../../lib/find/store";
import { hasValidOrigin } from "../../../../../lib/request-security";

const Body = z.object({ id: z.string().min(4).max(32), sent: z.boolean() }).strict();

// 누코드 쿠폰을 수동으로 보냈는지 표시 (로그인한 관리자만)
export async function POST(request: NextRequest) {
  if (!(await isOperator())) return NextResponse.json({ error: "운영자만 바꿀 수 있어요." }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  await markCoupon(parsed.data.id!, parsed.data.sent!);
  return NextResponse.json({ ok: true });
}
