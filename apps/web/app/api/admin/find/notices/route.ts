import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isOperator } from "../../../../../lib/find/admin-auth";
import { hasValidOrigin } from "../../../../../lib/request-security";
import { createNotice } from "../../../../../lib/find/village-store";

const Body = z.object({ title: z.string().trim().min(1).max(60), body: z.string().trim().min(1).max(500), kind: z.enum(["update", "alley", "fix", "event"]) }).strict();

// 마을 소식판에 글 붙이기 (운영자만). 주민이 다음에 들어오면 달그락이 말풍선으로 한 번 알려준다.
export async function POST(request: NextRequest) {
  if (!(await isOperator())) return NextResponse.json({ error: "운영자만 쓸 수 있어요." }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "제목과 내용을 적어주세요." }, { status: 400 });
  return NextResponse.json({ notice: await createNotice({ title: parsed.data.title!, body: parsed.data.body!, kind: parsed.data.kind! }) }, { status: 201 });
}
