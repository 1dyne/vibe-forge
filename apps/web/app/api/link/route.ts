import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, exhausted, hit } from "../../../lib/rate-limit";
import { hasValidOrigin } from "../../../lib/request-security";
import { userSessionValue } from "../../../lib/session";
import { findUserByToken } from "../../../lib/users";

const Body = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),
  p: z.string().regex(/^[0-9a-f-]{36}$/).optional(),
  open: z.union([z.enum(["profile", "claude", "dev", "account", "decisions"]), z.string().regex(/^(task|conflict):[0-9a-f-]{36}$/)]).optional()
}).strict();

// Signs a participant in from a /u#<token> dashboard link for 30 days.
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const ip = clientIp(request);
  if (exhausted("linkFailure", ip)) return NextResponse.json({ error: "시도가 너무 많아요. 15분 뒤 다시 시도해주세요." }, { status: 429 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  const user = parsed.success ? await findUserByToken(parsed.data.token) : null;
  if (!parsed.success || !user) {
    hit("linkFailure", ip);
    return NextResponse.json({ error: "개인 링크가 올바르지 않거나 사용이 중지됐어요." }, { status: 404 });
  }
  const target = new URLSearchParams();
  if (parsed.data.p) target.set("p", parsed.data.p);
  if (parsed.data.open) target.set("open", parsed.data.open);
  const response = NextResponse.json({ next: target.size ? `/?${target}` : "/" }, { headers: { "cache-control": "no-store" } });
  response.cookies.set("dalgeurak_session", userSessionValue(parsed.data.token), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return response;
}
