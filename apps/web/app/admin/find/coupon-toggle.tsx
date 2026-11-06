"use client";
import { useState } from "react";

export default function CouponToggle({ id, sentAt }: { id: string; sentAt: string | null }) {
  const [sent, setSent] = useState(Boolean(sentAt));
  const [busy, setBusy] = useState(false);
  return (
    <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
      <input type="checkbox" checked={sent} disabled={busy} onChange={async (e) => {
        const next = e.target.checked;
        setBusy(true);
        const res = await fetch("/api/admin/find/coupon", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, sent: next }) });
        if (res.ok) setSent(next);
        setBusy(false);
      }} />
      {sent ? "발급함" : "미발급"}
    </label>
  );
}
