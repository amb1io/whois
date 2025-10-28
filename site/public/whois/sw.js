self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() ?? "" };
  }

  const title = payload.title || "Domain Alert";
  const options = {
    body: payload.body || "There is new activity on a monitored domain.",
    icon: payload.icon || "/favicon.svg",
    badge: payload.badge || "/favicon.svg",
    data: payload.data || {},
    requireInteraction: false,
    actions: payload.actions || []
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url;
  if (targetUrl) {
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
        const windowClient = clientsArr.find((client) => client.url === targetUrl);
        if (windowClient) {
          return windowClient.focus();
        }
        return self.clients.openWindow(targetUrl);
      })
    );
  }
});
