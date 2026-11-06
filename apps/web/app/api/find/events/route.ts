import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { EVENT_NAMES } from "../../../../lib/find/api-schema";
import { recordEvent } from "../../../../lib/find/store";
import { allow, clientKey } from "../../../../lib/find/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";

// HANDOFF §8 이벤트. 아이디어 원문·이메일은 받지 않는다.
const Body = z.object({
  session: z.string().regex(/^[A-Za-z0-9]{6,32}$/),
  events: z.array(z.object({ name: z.enum(EVENT_NAMES), props: z.record(z.string().max(32), z.union([z.string().max(60), z.number(), z.boolean(), z.array(z.string().max(32)).max(24)])).optional() }).strict()).min(1).max(20)
}).strict();

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("find-events", clientKey(request), 120)) return new NextResponse(null, { status: 204 });
  const text = await request.text().catch(() => "");
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* sendBeacon은 text/plain으로 올 수 있다 */ }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad events" }, { status: 400 });
  const now = new Date().toISOString();
  try {
    for (const e of parsed.data.events) await recordEvent({ name: e.name, session: parsed.data.session, props: e.props ?? {}, createdAt: now });
  } catch (error) {
    console.error("find events failed", error instanceof Error ? error.message : "unknown");
  }
  return new NextResponse(null, { status: 204 });
}
