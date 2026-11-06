// 달그락 대장간 service worker: shows notifications and opens the item they
// point to. It does not cache pages.
self.addEventListener("push", (event) => {
  let data = { title: "달그락 대장간", body: "", url: "/" };
  try { data = { ...data, ...event.data.json() }; } catch (_) { /* keep defaults */ }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: data.url }, tag: "dalgeurak" }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) if (new URL(client.url).origin === target.origin && "navigate" in client) { await client.navigate(target.href); return client.focus(); }
    return self.clients.openWindow(target.href);
  })());
});
