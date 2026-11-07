/// <reference lib="webworker" />
// 通知を受け取って表示する。画面のファイルは前もって保存しておき、電波がなくても開けるようにする
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/internal\//] }));
registerRoute(({ request }) => request.destination === 'font', new CacheFirst({ cacheName: 'fonts' }));

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d: { title?: string; body?: string; url?: string; tag?: string } = {};
  try { d = e.data?.json() ?? {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'FIRMWATCH', {
    body: d.body || '新しいバージョンが出ました。',
    icon: '/icon-192.png', badge: '/badge-96.png', tag: d.tag || 'firmwatch', data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await (c as WindowClient).navigate(url).catch(() => {}); return (c as WindowClient).focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
