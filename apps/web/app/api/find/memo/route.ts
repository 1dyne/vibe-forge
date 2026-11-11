import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addMemo, cleanUrl, deleteMemo, exportMarkdown, forgeMemos, MEMO_LIMIT, MEMO_MAX } from "../../../../lib/find/memo";
import { ownerHashFromRequest } from "../../../../lib/find/owner";
import { allow, clientKey } from "../../../../lib/find/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";
import { forgeFires, forgeForOwner } from "../../../../lib/find/village-store";

// 작업실 메모는 주인만: 이 기기의 대장간 쿠키가 있어야 읽고 쓸 수 있다
async function owner(request: NextRequest) { const h = ownerHashFromRequest(request); return h ? forgeForOwner(h) : null; }
const noStore = { "cache-control": "no-store" };

export async function GET(request: NextRequest) {
  const forge = await owner(request);
  if (!forge) return NextResponse.json({ error: "내 대장간에서만 볼 수 있어." }, { status: 403 });
  const memos = await forgeMemos(forge.id);
  if (request.nextUrl.searchParams.get("export") === "1") {
    const md = exportMarkdown(forge.nickname, await forgeFires(forge.id), memos);
    return new NextResponse(md, { headers: { ...noStore, "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="dalgrak-memo.md"` } });
  }
  return NextResponse.json({ memos }, { headers: noStore });
}

const Add = z.object({ fireId: z.string().regex(/^[A-Za-z0-9_-]{4,40}$/), body: z.string().max(600), url: z.string().max(600).optional() }).strict();
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  if (!allow("find-memo", clientKey(request), 30)) return NextResponse.json({ error: "잠깐 쉬었다 해줘." }, { status: 429 });
  const forge = await owner(request);
  if (!forge) return NextResponse.json({ error: "내 대장간에서만 메모를 남길 수 있어." }, { status: 403 });
  const parsed = Add.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const body = parsed.data.body!.trim();
  if (!body) return NextResponse.json({ error: "메모를 적어줘." }, { status: 400 });
  if (body.length > MEMO_MAX) return NextResponse.json({ error: `메모는 ${MEMO_MAX}자까지만 돼.` }, { status: 400 });
  const url = cleanUrl(parsed.data.url);
  if (url === "bad") return NextResponse.json({ error: "링크는 http나 https로 시작하는 주소만 돼." }, { status: 400 });
  const [fires, memos] = await Promise.all([forgeFires(forge.id), forgeMemos(forge.id)]);
  if (!fires.some((f) => f.id === parsed.data.fireId)) return NextResponse.json({ error: "내 도깨비불에만 메모를 남길 수 있어." }, { status: 400 });
  if (memos.length >= MEMO_LIMIT) return NextResponse.json({ error: `메모는 ${MEMO_LIMIT}개까지 쌓을 수 있어. 내보낸 뒤 오래된 걸 지워줘.` }, { status: 400 });
  const memo = await addMemo({ forgeId: forge.id, fireId: parsed.data.fireId!, body, url });
  return NextResponse.json({ memo }, { status: 201 });
}

const Del = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{4,20}$/) }).strict();
export async function DELETE(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const forge = await owner(request);
  if (!forge) return NextResponse.json({ error: "내 대장간에서만 지울 수 있어." }, { status: 403 });
  const parsed = Del.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  return NextResponse.json({ ok: await deleteMemo(forge.id, parsed.data.id!) });
}
