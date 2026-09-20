/* AzoApp — Web-push service worker (FCM).
 * Handles the raw `push` event directly (no Firebase SDK needed inside the SW), so
 * notifications are shown even when the browser is closed / phone is locked, with
 * no dependency on a network fetch at SW start-up. */
/* eslint-disable no-undef */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function parsePush(event) {
  try {
    const p = event.data ? event.data.json() : {};
    // FCM v1 web-push payload: { notification?, data?, fcmOptions? }
    return { n: p.notification || {}, d: p.data || {}, link: (p.fcmOptions && p.fcmOptions.link) || '' };
  } catch (e) {
    return { n: {}, d: {}, link: '' };
  }
}

function showJobRequest(d) {
  const bid = d.booking_id || '';
  const icon = d.icon || '/logo192.png';
  // Per-service list (name + pre-tax price) so the partner sees every individual
  // service instead of a combined "N services · Category" line. All prices are
  // tax-EXCLUDED (sent by the backend).
  let items = [];
  try { items = d.items_json ? JSON.parse(d.items_json) : []; } catch (e) { items = []; }
  const fmt = (n) => {
    const v = Number(n);
    return isNaN(v) ? '' : '\u20b9' + v.toLocaleString('en-IN');
  };
  let body;
  if (items.length) {
    body = items.map((it) => {
      const q = (it.qty && it.qty > 1) ? (' \u00d7' + it.qty) : '';
      const p = it.price ? (' — ' + fmt(it.price)) : '';
      return '\u2022 ' + (it.name || 'Service') + q + p;
    }).join('\n');
    if (d.city) body += '\n' + d.city;
  } else {
    const parts = [d.service_name, d.city, d.services_total ? fmt(d.services_total) : ''].filter(Boolean);
    body = parts.join(' \u00b7 ') || 'Tap to view the request';
  }
  return self.registration.showNotification('New job request \u2014 AzoApp', {
    body: body,
    icon: icon,
    badge: icon,
    image: d.image || undefined,
    requireInteraction: true,
    silent: false,
    vibrate: [500, 200, 500, 200, 500, 200, 800],
    tag: 'job-' + bid,
    renotify: true,
    timestamp: Date.now(),
    data: { link: '/partner?job=' + bid, booking_id: bid },
    actions: [
      { action: 'accept', title: '\u2705 Accept' },
      { action: 'reject', title: '\u274c Reject' },
    ],
  });
}

self.addEventListener('push', (event) => {
  const { n, d, link } = parsePush(event);
  if (d.type === 'job_request') {
    event.waitUntil(showJobRequest(d));
    return;
  }
  if (d.type === 'chat_message') {
    // WhatsApp-style: "Sender" / "text\nService • Booking #CODE", one stacked
    // notification per chat thread (tag), tap opens that exact conversation.
    const icon = d.icon || '/logo192.png';
    const body = (d.body || n.body || '') + (d.body && d.service_name ? '\n' + d.service_name + ' \u2022 Booking #' + (d.code || '') : '');
    event.waitUntil(self.registration.showNotification(d.sender_name || n.title || 'New message', {
      body: body,
      icon: icon,
      badge: icon,
      vibrate: [200, 100, 200],
      tag: d.tag || ('chat-' + (d.booking_id || '')),
      renotify: true,
      timestamp: Date.now(),
      data: { link: d.link || link || '/', type: 'chat_message', booking_id: d.booking_id || '' },
    }));
    return;
  }
  const title = n.title || d.title || 'AzoApp';
  const icon = n.icon || d.icon || '/logo192.png';
  event.waitUntil(self.registration.showNotification(title, {
    body: n.body || d.body || '',
    icon: icon,
    badge: icon,
    image: d.image || n.image || undefined,
    silent: false,
    vibrate: [300, 150, 300],
    data: { link: d.link || link || '/' },
    tag: d.tag || undefined,
    renotify: !!d.tag,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const bid = data.booking_id || '';
  let link = data.link || '/';
  if (data.type === 'chat_message') { /* deep link already points at the chat */ }
  else if (event.action === 'accept' && bid) link = '/partner?job=' + bid + '&ring=accept';
  else if (event.action === 'reject' && bid) link = '/partner?job=' + bid + '&ring=reject';
  else if (bid) link = '/partner?job=' + bid + '&ring=open';
  const target = new URL(link, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cl) => {
      for (const c of cl) {
        if ('focus' in c) {
          try { if ('navigate' in c) c.navigate(target); } catch (e) { /* ignore */ }
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    })
  );
});
