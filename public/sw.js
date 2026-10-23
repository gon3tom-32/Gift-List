// Shows push notifications and opens the app when one is tapped.
self.addEventListener('push', (event) => {
  let data = { title: 'Gift-List', body: '' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* plain text or empty push */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const home = new URL('./', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(home) && 'focus' in w) return w.focus();
      }
      return self.clients.openWindow(home);
    }),
  );
});
