/* service worker — เก็บไฟล์ของแอปไว้ในเครื่อง ให้เปิดได้แม้ไม่มีเน็ต
   แก้ไฟล์ในเว็บแล้วให้ขยับเลข VERSION เพื่อให้ iPhone ที่ติดตั้งไว้โหลดของใหม่
   ไม่แตะ request ไป AI proxy (คนละ origin) — ส่งตรงทุกครั้ง ไม่ cache */

const VERSION = 'zjtrackercal-v3';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './manifest.webmanifest',
  './js/main.js',
  './js/state.js',
  './js/db.js',
  './js/calc.js',
  './js/ai.js',
  './js/ui.js',
  './js/charts.js',
  './js/data/foods.js',
  './js/data/met.js',
  './js/views/setup.js',
  './js/views/profile-forms.js',
  './js/views/dashboard.js',
  './js/views/diary.js',
  './js/views/add.js',
  './js/views/insight.js',
  './js/views/profile.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', e => {
  /* cache: 'reload' = ข้าม HTTP cache ของเบราว์เซอร์ ได้ไฟล์ล่าสุดจริงตอนอัปเดตเวอร์ชัน */
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ไฟล์ของแอป: ใช้ของในเครื่องก่อน แล้วแอบอัปเดตเบื้องหลัง (ครั้งหน้าที่เปิดจะได้ของใหม่) */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.includes('/api/')) return;

  /* config.js (ที่อยู่ proxy) เอาจากเน็ตก่อน — deploy proxy ใหม่แล้วแอปเห็นทันที */
  if (url.pathname.endsWith('/config.js')) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
      return hit || net;
    })
  );
});
