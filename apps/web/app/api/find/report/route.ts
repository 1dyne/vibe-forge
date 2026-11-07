import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ownerHashFromRequest } from "../../../../lib/find/owner";
import { allow, clientKey } from "../../../../lib/find/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";
import { createReport, forgeForOwner, getForge, REPORT_REASONS } from "../../../../lib/find/village-store";

// 집 신고: 운영 화면에 쌓이고, 다인이 확인해서 숨긴다
const Body = z.object({ host: z.string().regex(/^[A-Za-z0-9]{4,16}$/), reason: z.enum(REPORT_REASONS) }).strict();

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("find-report", clientKey(request), 5, 10 * 60_000)) return NextResponse.json({ error: "잠깐 쉬었다 해줘." }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const host = await getForge(parsed.data.host!);
  if (!host) return NextResponse.json({ error: "not found" }, { status: 404 });
  const hash = ownerHashFromRequest(request);
  const me = hash ? await forgeForOwner(hash) : null;
  await createReport(host.id, me?.id ?? null, parsed.data.reason!);
  return NextResponse.json({ ok: true }, { status: 201 });
}
