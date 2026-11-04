import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidOrigin } from "../../../../lib/request-security";
import { connectorLink, dashboardLink } from "../../../../lib/links";
import { createUser, listUsers } from "../../../../lib/users";
import { getViewer } from "../../../../lib/viewer";
import { audit } from "../../../../lib/audit";

const forbidden = () => NextResponse.json({ error: "운영자만 사용할 수 있어요." }, { status: 403 });

export async function GET(request: NextRequest) {
  if ((await getViewer(request))?.kind !== "operator") return forbidden();
  return NextResponse.json({ users: await listUsers() });
}

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if ((await getViewer(request))?.kind !== "operator") return forbidden();
  const parsed = z.object({ name: z.string().trim().min(1).max(60), webAi: z.boolean().default(false) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "이름을 1~60자로 입력해주세요." }, { status: 400 });
  const { user, token } = await createUser(parsed.data.name, parsed.data.webAi);
  await audit("user_invited", { userId: user.id });
  return NextResponse.json({
    user,
    connectorUrl: connectorLink(request, token),
    dashboardUrl: dashboardLink(request, token)
  }, { status: 201 });
}
