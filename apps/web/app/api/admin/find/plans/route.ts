import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isOperator } from "../../../../../lib/find/admin-auth";
import { hasValidOrigin } from "../../../../../lib/request-security";
import { createPlan, setPlanStatus } from "../../../../../lib/find/village-store";

const Create = z.object({ title: z.string().trim().min(1).max(60), description: z.string().trim().max(300) }).strict();
const Status = z.object({ id: z.number().int().positive(), status: z.enum(["voting", "building", "done"]) }).strict();

export async function POST(request: NextRequest) {
  if (!(await isOperator())) return NextResponse.json({ error: "운영자만" }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const p = Create.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "제목을 적어주세요." }, { status: 400 });
  await createPlan(p.data.title!, p.data.description ?? "");
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  if (!(await isOperator())) return NextResponse.json({ error: "운영자만" }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const p = Status.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  await setPlanStatus(p.data.id!, p.data.status!);
  return NextResponse.json({ ok: true });
}
