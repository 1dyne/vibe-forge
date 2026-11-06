import { NextRequest, NextResponse } from "next/server";
import { isOperator } from "../../../../../lib/find/admin-auth";
import { clearEvents } from "../../../../../lib/find/store";
import { hasValidOrigin } from "../../../../../lib/request-security";

// 오픈 전에 테스트로 쌓인 지표를 한 번 비운다 (운영자만)
export async function DELETE(request: NextRequest) {
  if (!(await isOperator())) return NextResponse.json({ error: "운영자만 지울 수 있어요." }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  return NextResponse.json({ cleared: await clearEvents() });
}
