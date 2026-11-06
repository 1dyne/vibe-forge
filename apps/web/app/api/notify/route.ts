import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidOrigin } from "../../../lib/request-security";
import { getViewer, unauthorized } from "../../../lib/viewer";
import { addPushSubscription, notifySettings, removePushSubscription, sendTestNotice, setEmailNotices } from "../../../lib/notify";

// The person's notification settings: push on this device, email on/off and
// a test notification. Only participants have them (the operator has none).
export async function GET(request: NextRequest) {
  const viewer = await getViewer(request);
  if (!viewer || viewer.kind !== "user") return unauthorized();
  return NextResponse.json({ ...(await notifySettings(viewer.user.id)), hasEmail: Boolean(viewer.user.email) }, { headers: { "cache-control": "no-store" } });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subscribe"), subscription: z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }).strict() }).passthrough(), label: z.string().max(60).optional() }),
  z.object({ action: z.literal("unsubscribe"), endpoint: z.string().url().max(1000) }),
  z.object({ action: z.literal("email"), on: z.boolean() }),
  z.object({ action: z.literal("test") })
]);

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  const viewer = await getViewer(request);
  if (!viewer || viewer.kind !== "user") return unauthorized();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "입력값을 확인해주세요." }, { status: 400 });
  const input = parsed.data;
  const userId = viewer.user.id;
  if (input.action === "subscribe") {
    const endpoint = new URL(input.subscription.endpoint);
    if (endpoint.protocol !== "https:") return NextResponse.json({ error: "알림 주소가 올바르지 않아요." }, { status: 400 });
    const keys = input.subscription.keys as { p256dh: string; auth: string };
    await addPushSubscription(userId, { endpoint: input.subscription.endpoint, keys, ...(input.label ? { label: input.label } : {}) });
  } else if (input.action === "unsubscribe") {
    await removePushSubscription(userId, input.endpoint);
  } else if (input.action === "email") {
    if (input.on && !viewer.user.email) return NextResponse.json({ error: "이메일이 있는 계정만 이메일 알림을 켤 수 있어요." }, { status: 409 });
    await setEmailNotices(userId, input.on);
  } else {
    const settings = await notifySettings(userId);
    if (!settings.pushDevices && !settings.email) return NextResponse.json({ error: "켜진 알림이 없어요." }, { status: 409 });
    await sendTestNotice(userId, process.env.APP_BASE_URL ?? request.nextUrl.origin);
  }
  return NextResponse.json(await notifySettings(userId));
}
