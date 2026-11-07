import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pushMail } from "../../../../lib/find/notion";
import { ownerHashFromRequest } from "../../../../lib/find/owner";
import { allow, clientKey } from "../../../../lib/find/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";
import { createMail, forgeForOwner } from "../../../../lib/find/village-store";

// 달그락 우체통: 비공개 건의함. 이름·연락처 칸은 없고, 화면·기기·대장간 id만 자동으로 붙는다.
const Body = z.object({
  kind: z.enum(["feature", "bug", "decor", "chat"]),
  body: z.string().trim().min(2).max(2000),
  screen: z.string().max(120).optional(),
  website: z.string().max(0).optional()
}).strict();

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("find-mail", clientKey(request), 5, 10 * 60_000)) return NextResponse.json({ error: "편지는 10분에 5통까지야. 조금 있다 다시 넣어줘." }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "두 글자 이상 적어줘." }, { status: 400 });
  const hash = ownerHashFromRequest(request);
  const forge = hash ? await forgeForOwner(hash) : null;
  const device = (request.headers.get("user-agent") ?? "").slice(0, 160);
  const mail = await createMail({ forgeId: forge?.id ?? null, kind: parsed.data.kind!, body: parsed.data.body!, context: { screen: parsed.data.screen ?? "", device } });
  await pushMail(mail);
  return NextResponse.json({ ok: true, id: mail.id, hasForge: Boolean(forge) }, { status: 201 });
}
