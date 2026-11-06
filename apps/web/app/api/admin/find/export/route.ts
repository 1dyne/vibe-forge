import { NextResponse } from "next/server";
import { allWaitlist } from "../../../../../lib/find/store";

// 로그인한 관리자만 (proxy.ts가 /api/admin 을 보호한다)
function cell(v: unknown) {
  const s = v == null ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const rows = await allWaitlist();
  const head = ["created_at", "email", "referral_code", "referred_by", "fire_id", "idea", "sentence", "picked", "peak_fire", "fire_color", "marketing_consent", "coupon_sent_at"];
  const body = rows.map((r) => [r.createdAt, r.email, r.referralCode, r.referredBy, r.fireId, r.idea, r.sentence, r.picked, r.peakFire, r.fireColor, r.marketingConsent, r.couponSentAt].map(cell).join(","));
  return new NextResponse("﻿" + [head.join(","), ...body].join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="find-waitlist-${new Date().toISOString().slice(0, 10)}.csv"` }
  });
}
