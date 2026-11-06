import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "../../../../lib/audit";
import { createCode, getClient } from "../../../../lib/oauth";
import { hasValidOrigin } from "../../../../lib/request-security";
import { getViewer } from "../../../../lib/viewer";

const Decision = z.object({
  client_id: z.string().uuid(),
  redirect_uri: z.string().max(500),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  state: z.string().max(500),
  decision: z.enum(["allow", "deny"])
}).strict();

// The consent button. Needs the participant's own session (their link token),
// which is what lets the server hand their data key to the new grant.
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer || viewer.kind !== "user") return NextResponse.json({ error: "참여자 링크로 로그인한 뒤 다시 시도해주세요." }, { status: 401 });
  const parsed = Decision.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "요청을 확인해주세요." }, { status: 400 });
  const client = await getClient(parsed.data.client_id);
  if (!client || !client.redirectUris.includes(parsed.data.redirect_uri)) return NextResponse.json({ error: "등록되지 않은 앱이거나 돌아갈 주소가 달라요." }, { status: 400 });
  const target = new URL(parsed.data.redirect_uri);
  if (parsed.data.state) target.searchParams.set("state", parsed.data.state);
  if (parsed.data.decision === "deny") {
    target.searchParams.set("error", "access_denied");
    return NextResponse.json({ redirect: target.toString() });
  }
  const code = await createCode({ clientId: client.id, userId: viewer.user.id, redirectUri: parsed.data.redirect_uri, challenge: parsed.data.code_challenge, dataKey: viewer.vault.key });
  await audit("app_connected", { userId: viewer.user.id, note: client.name.slice(0, 40) });
  target.searchParams.set("code", code);
  return NextResponse.json({ redirect: target.toString() }, { headers: { "cache-control": "no-store" } });
}
