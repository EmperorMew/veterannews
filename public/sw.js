/**
 * Veteran News — Service Worker
 *
 * Primary purpose: offline access to the crisis page.
 * If a veteran's connection drops, /crisis must still load.
 * Cached pages also speed up navigation.
 */

const CACHE_VERSION = 'vn-v3';
const CRITICAL_CACHE = 'vn-critical-v3';
const RUNTIME_CACHE = 'vn-runtime-v3';

// These pages must be available offline at all costs
const CRITICAL_URLS = [
  '/',
  '/crisis',
  '/resources',
  '/style.css',
  '/favicon.svg',
  '/manifest.json',
  '/placeholder.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CRITICAL_CACHE);
      // Best-effort caching — don't fail install if a URL 404s
      await Promise.allSettled(CRITICAL_URLS.map(u => cache.add(u)));
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k !== CRITICAL_CACHE && k !== RUNTIME_CACHE).map(k => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses or analytics
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/')) return;

  // Crisis page: cache-first for instant offline access
  if (url.pathname === '/crisis' || url.pathname === '/crisis/') {
    event.respondWith(cacheFirst(req, CRITICAL_CACHE));
    return;
  }

  // HTML navigations: network-first with cache fallback
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(req, RUNTIME_CACHE));
    return;
  }

  // Static assets: stale-while-revalidate
  if (/\.(css|js|svg|png|jpg|jpeg|webp|woff2?)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) {
    // Refresh in background
    fetch(req).then(res => caches.open(cacheName).then(c => c.put(req, res))).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    // Last-resort offline crisis fallback HTML
    return new Response(offlineCrisisHTML(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    // Last-resort offline crisis fallback
    if (req.headers.get('accept')?.includes('text/html')) {
      const crisis = await caches.match('/crisis');
      if (crisis) return crisis;
      return new Response(offlineCrisisHTML(), {
        status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    return Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cached = await caches.match(req);
  const fetchPromise = fetch(req).then(res => {
    if (res.ok) caches.open(cacheName).then(c => c.put(req, res.clone()));
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}

// Bare-minimum HTML for when nothing else loads.
// Big number, big text, dial action, no fluff.
function offlineCrisisHTML() {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Crisis Line — Veteran News</title>
<meta name="theme-color" content="#0D2340">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,system-ui,sans-serif;background:#C8313D;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center}
.wrap{max-width:600px}
.label{font-size:.75rem;text-transform:uppercase;letter-spacing:.16em;opacity:.85;margin-bottom:16px}
h1{font-family:Georgia,serif;font-size:2.5rem;line-height:1.05;margin-bottom:24px}
.num{font-family:Georgia,serif;font-size:5rem;font-weight:700;line-height:1;margin:24px 0}
a.btn{display:inline-block;padding:18px 40px;background:#fff;color:#8B1A23;border-radius:999px;text-decoration:none;font-weight:700;font-size:1.125rem;margin:8px}
a.btn-2{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.4)}
p{font-size:1.0625rem;margin-bottom:16px;opacity:.95}
small{display:block;margin-top:32px;font-size:.875rem;opacity:.7}
</style></head>
<body><div class="wrap">
<div class="label">Veterans Crisis Line · 24/7 · Confidential · Free</div>
<h1>You're not alone. Help is one call away.</h1>
<div class="num">988<br><span style="font-size:1.5rem">press 1</span></div>
<a href="tel:988" class="btn">Call 988 — Press 1</a>
<a href="sms:838255" class="btn btn-2">Text 838255</a>
<p style="margin-top:32px">A trained responder, often a veteran themselves, is available right now. Calls are free and confidential. You do not need to be enrolled in VA care.</p>
<small>You're seeing this offline page because Veteran News couldn't reach the network. The 988 line still works on any phone with no internet required.</small>
</div></body></html>`;
}
