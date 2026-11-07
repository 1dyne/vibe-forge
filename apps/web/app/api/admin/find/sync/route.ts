import { NextRequest, NextResponse } from "next/server";
import { isOperator } from "../../../../../lib/find/admin-auth";
import { notionEnabled, syncMailbox } from "../../../../../lib/find/notion";
import { hasValidOrigin } from "../../../../../lib/request-security";

// 노션 우체통과 지금 바로 맞추기 (운영자만)
export async function POST(request: NextRequest) {
  if (!(await isOperator())) return NextResponse.json({ error: "운영자만 쓸 수 있어요." }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!notionEnabled()) return NextResponse.json({ error: "NOTION_TOKEN이 아직 없어요." }, { status: 409 });
  return NextResponse.json({ result: await syncMailbox(true) });
}
