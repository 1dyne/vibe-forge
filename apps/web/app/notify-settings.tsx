"use client";
import { useEffect, useState } from "react";

// Notification settings in 내 계정: push on this device (needs the installed
// app on iPhone), email, and a test.
type Settings = { pushDevices: number; email: boolean; pushAvailable: boolean; emailAvailable: boolean; publicKey: string | null; hasEmail: boolean };

const urlBase64ToUint8Array = (base64: string) => { const padded = (base64 + "=".repeat((4 - base64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"); const raw = atob(padded); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

export default function NotifySettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ios = typeof navigator !== "undefined" && /iPhone|iPad/.test(navigator.userAgent);
  const standalone = typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches;
  useEffect(() => {
    fetch("/api/notify", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then(setSettings).catch(() => {});
    if (supported) navigator.serviceWorker.getRegistration("/sw.js").then((reg) => reg?.pushManager.getSubscription()).then((sub) => setSubscribed(Boolean(sub))).catch(() => {});
  }, [supported]);
  async function post(body: unknown, done?: string) {
    setBusy(true); setMessage("");
    try {
      const r = await fetch("/api/notify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "저장하지 못했어요.");
      setSettings((s) => s && { ...s, ...b });
      if (done) setMessage(done);
    } catch (e) { setMessage(e instanceof Error ? e.message : "저장하지 못했어요."); } finally { setBusy(false); }
  }
  async function enablePush() {
    if (!settings?.publicKey) return;
    setBusy(true); setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("알림 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(settings.publicKey) });
      setBusy(false);
      await post({ action: "subscribe", subscription: sub.toJSON(), label: navigator.userAgent.slice(0, 60) }, "이 기기에서 알림을 받아요.");
      setSubscribed(true);
    } catch (e) { setMessage(e instanceof Error ? e.message : "알림을 켜지 못했어요."); setBusy(false); }
  }
  async function disablePush() {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await post({ action: "unsubscribe", endpoint: sub.endpoint }, "이 기기의 알림을 껐어요."); await sub.unsubscribe(); }
    setSubscribed(false);
  }
  if (!settings) return null;
  return <div className="notify-settings">
    <h3>알림</h3>
    <p className="muted"><small>내가 해야 할 일이 생기거나 바뀔 때, 결정이나 승인이 필요할 때, 질문에 답이 왔을 때만 알려요. 같은 프로젝트의 알림은 10분에 한 번으로 묶어요. 알림에는 할 일 제목이 보여요.</small></p>
    <div className="notify-row"><span><b>이 기기로 받기</b>{settings.pushDevices > 0 && <small> · 등록된 기기 {settings.pushDevices}대</small>}</span>
      {!settings.pushAvailable ? <small className="muted">아직 서버에 푸시 알림이 설정되지 않았어요.</small>
        : !supported ? <small className="muted">{ios && !standalone ? "아이폰은 Safari 공유 버튼 → 홈 화면에 추가로 앱을 설치한 뒤, 설치한 앱에서 켤 수 있어요 (iOS 16.4 이상)." : "이 브라우저는 웹 알림을 지원하지 않아요."}</small>
        : subscribed ? <button disabled={busy} onClick={disablePush}>끄기</button> : <button className="primary" disabled={busy} onClick={enablePush}>켜기</button>}
    </div>
    <div className="notify-row"><span><b>이메일로 받기</b>{!settings.hasEmail && <small> · 이메일이 있는 계정만 쓸 수 있어요</small>}</span>
      {settings.hasEmail && settings.emailAvailable && <label className="switch"><input type="checkbox" checked={settings.email} disabled={busy} onChange={(e) => post({ action: "email", on: e.target.checked }, e.target.checked ? "이메일 알림을 켰어요." : "이메일 알림을 껐어요.")} />{settings.email ? "켜짐" : "꺼짐"}</label>}
    </div>
    {(settings.pushDevices > 0 || settings.email) && <button disabled={busy} onClick={() => post({ action: "test" }, "시험 알림을 보냈어요.")}>알림 시험 보내기</button>}
    {message && <p className="notice" role="status">{message}</p>}
  </div>;
}
