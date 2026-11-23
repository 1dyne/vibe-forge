import { NextResponse } from "next/server";
import { usingPostgres } from "../../../lib/row-store";

export function GET() {
  // store는 이사가 실제로 적용됐는지 밖에서 확인하려고 둔다. 비밀이 아니다.
  return NextResponse.json({ ok: true, service: "dalgeurak-web", mode: process.env.APP_MODE ?? "mock", store: usingPostgres() ? "postgres" : "file" });
}
