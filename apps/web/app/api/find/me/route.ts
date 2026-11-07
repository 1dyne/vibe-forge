import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { syncMailbox } from "../../../../lib/find/notion";
import { ownerHashFromRequest } from "../../../../lib/find/owner";
import { hasValidOrigin } from "../../../../lib/request-security";
import { alleyName } from "../../../../lib/find/village";
import { forgeForOwner, latestNotices, unseenReplies, updateMail } from "../../../../lib/find/village-store";

// 이 기기 주인의 대장간 요약 + 아직 못 본 우체통 답장 + 최근 마을 소식.
// 노션에서 바뀐 답장은 여기서 10분에 한 번씩 가져온다.
export async function GET(request: NextRequest) {
  void syncMailbox().catch(() => undefined);
  const hash = ownerHashFromRequest(request);
  const forge = hash ? await forgeForOwner(hash) : null;
  const replies = forge ? (await unseenReplies(forge.id)).map((m) => ({ id: m.id, asked: m.body.slice(0, 40), reply: m.reply })) : [];
  const notices = (await latestNotices(3)).map((n) => ({ id: n.id, title: n.title, body: n.body, kind: n.kind, publishedAt: n.publishedAt }));
  return NextResponse.json({
    forge: forge ? { id: forge.id, nickname: forge.nickname, alley: alleyName(forge.theme, forge.alleySeq), plotNo: forge.plotNo, visibility: forge.visibility } : null,
    replies,
    notices
  }, { headers: { "cache-control": "no-store" } });
}

const Seen = z.object({ replyIds: z.array(z.string().min(4).max(32)).max(20) }).strict();

/** 답장 말풍선을 봤다고 표시 (내 대장간 편지만) */
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const hash = ownerHashFromRequest(request);
  const forge = hash ? await forgeForOwner(hash) : null;
  const parsed = Seen.safeParse(await request.json().catch(() => null));
  if (!forge || !parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const mine = new Set((await unseenReplies(forge.id)).map((m) => m.id));
  for (const id of parsed.data.replyIds ?? []) if (mine.has(id)) await updateMail(id, { replySeen: true });
  return NextResponse.json({ ok: true });
}
