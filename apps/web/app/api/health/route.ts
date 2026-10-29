import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, service: "dalgeurak-web", mode: process.env.APP_MODE ?? "mock" });
}
