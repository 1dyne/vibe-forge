import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyEmail } from "../../../../lib/account-service";
import { failure } from "../../../../lib/auth-http";
import { clientIp, exhausted, hit } from "../../../../lib/rate-limit";
import { hasValidOrigin } from "../../../../lib/request-security";

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const ip = clientIp(request);
  if (exhausted("linkFailure", ip)) return NextResponse.json({ error: "시도가 너무 많아요. 잠시 후 다시 해주세요." }, { status: 429 });
  const parsed = z.object({ token: z.string().max(100) }).strict().safeParse(await request.json().catch(() => null));
  try {
    if (!parsed.success) throw new Error("bad token");
    const user = await verifyEmail(parsed.data.token);
    return NextResponse.json({ email: user.email });
  } catch (error) {
    hit("linkFailure", ip);
    return failure(error, "인증하지 못했어요.");
  }
}
