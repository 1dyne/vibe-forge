import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dropIdea, inboxOpen } from "../../../../lib/meetup-inbox";
import { hit } from "../../../../lib/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";

export const dynamic = "force-dynamic";

// ── MEETUP: 2026-11-28 밋업 시연 전용 (lib/meetup-inbox.ts 참고). 밋업이 끝나면 지운다 ──
// 로그인 없이 아이디어 한 줄을 발표자의 화면으로 보낸다. 받는 화면이 열려 있을 때만 받는다.
const Body = z.object({ code: z.string().regex(/^[0-9a-f]{8}$/), text: z.string().trim().min(2).max(140), name: z.string().trim().max(16).default("") }).strict();

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? "";
  return NextResponse.json({ open: /^[0-9a-f]{8}$/.test(code) && inboxOpen(code) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!hit("mcp", `meetup-idea:${ip}`).ok) return NextResponse.json({ error: "조금 뒤에 다시 보내 주세요." }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "아이디어는 2~140자로 적어 주세요." }, { status: 400 });
  const { code, text, name } = parsed.data;
  // 줄바꿈과 꾸밈 글자는 화면에서 편지 모양을 깨뜨리므로 한 줄로 편다
  const flat = (s: string) => s.replace(/[\r\n*_#`>|]+/g, " ").replace(/\s+/g, " ").trim();
  const result = dropIdea(code, { text: flat(text), name: flat(name ?? ""), at: new Date().toISOString() });
  if (result === "closed") return NextResponse.json({ error: "지금은 받는 화면이 열려 있지 않아요. 발표자가 화면을 열면 다시 보내 주세요." }, { status: 409 });
  if (result === "full") return NextResponse.json({ error: "아이디어가 많이 밀려 있어요. 조금 뒤에 다시 보내 주세요." }, { status: 429 });
  return NextResponse.json({ ok: true });
}
