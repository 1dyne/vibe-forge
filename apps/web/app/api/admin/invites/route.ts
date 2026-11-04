import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "../../../../lib/audit";
import { signupMode } from "../../../../lib/policies";
import { hasValidOrigin, publicUrl } from "../../../../lib/request-security";
import { createInvite, listInvites } from "../../../../lib/users";
import { getViewer } from "../../../../lib/viewer";

const forbidden = () => NextResponse.json({ error: "운영자만 사용할 수 있어요." }, { status: 403 });

export async function GET(request: NextRequest) {
  if ((await getViewer(request))?.kind !== "operator") return forbidden();
  return NextResponse.json({ mode: signupMode(), joinUrl: publicUrl(request, "/join").toString(), invites: await listInvites() }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if ((await getViewer(request))?.kind !== "operator") return forbidden();
  const parsed = z.object({ label: z.string().trim().min(1).max(60), maxUses: z.number().int().min(1).max(1000), days: z.number().int().min(1).max(365).nullable() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "이름, 사용 횟수(1~1000), 기간(1~365일)을 확인해주세요." }, { status: 400 });
  const expiresAt = parsed.data.days ? new Date(Date.now() + parsed.data.days * 86_400_000).toISOString() : null;
  const { invite, code } = await createInvite(parsed.data.label, parsed.data.maxUses, expiresAt);
  await audit("invite_created", { inviteId: invite.id });
  return NextResponse.json({ invite, code }, { status: 201, headers: { "cache-control": "no-store" } });
}
