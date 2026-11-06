"use client";
// HANDOFF §8 이벤트를 모아서 /api/find/events 로 보낸다. 아이디어 원문·이메일은 보내지 않는다.
type Props = Record<string, string | number | boolean | string[]>;
let queue: Array<{ name: string; props?: Props }> = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function session() {
  try {
    let id = sessionStorage.getItem("find_session");
    if (!id) {
      id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      sessionStorage.setItem("find_session", id);
    }
    return id.replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
  } catch {
    return "nostorage" + Math.random().toString(36).slice(2, 10);
  }
}

function flush() {
  timer = null;
  if (!queue.length) return;
  const body = JSON.stringify({ session: session(), events: queue.splice(0, 20) });
  fetch("/api/find/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  if (queue.length) timer = setTimeout(flush, 300);
}

export function track(name: string, props?: Props) {
  queue.push(props ? { name, props } : { name });
  if (!timer) timer = setTimeout(flush, 800);
}

if (typeof window !== "undefined") window.addEventListener("pagehide", flush);
