import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isOperator } from "../../../../../lib/find/admin-auth";
import { hasValidOrigin } from "../../../../../lib/request-security";
import { resolveReport, setVisibility } from "../../../../../lib/find/village-store";

const Body = z.object({ id: z.number().int().positive(), forgeId: z.string().min(4).max(16), hide: z.boolean() }).strict();

// 신고 처리: 확인만 하거나, 그 집을 비공개로 숨긴다 (운영자만)
export async function PATCH(request: NextRequest) {
  if (!(await isOperator())) return NextResponse.json({ error: "운영자만" }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (p.data.hide) await setVisibility(p.data.forgeId!, "private");
  await resolveReport(p.data.id!);
  return NextResponse.json({ ok: true });
}
