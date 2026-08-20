/* Service worker cho PWA "Gia phả họ Hồ"
   - App shell (HTML, icon…): chạy offline
   - Dữ liệu Google Sheet: ưu tiên mạng (mới nhất), offline dùng bản đã lưu
   - Thư viện CDN, phông chữ, ảnh Drive: dùng cache, ngầm cập nhật
   Đổi số phiên bản khi cập nhật để xoá cache cũ. */
const VERSION = 'giapha-v20';
const CORE = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-512-maskable.png',
  './apple-touch-icon.png', './favicon-64.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.allSettled(CORE.map(u => c.add(u))))  // không để 1 file lỗi làm hỏng cả gói
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // 1) Dữ liệu Google Sheet (opensheet): MẠNG TRƯỚC, offline lấy cache
  if (url.hostname.indexOf('opensheet') !== -1) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // 1b) Ảnh Google (Drive / googleusercontent): chỉ lấy mạng, KHÔNG cache (tránh giữ bản lỗi)
  if (url.hostname.indexOf('googleusercontent') !== -1 || url.hostname === 'drive.google.com') {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // 2) Điều hướng trang: cache trước (mở được khi offline), không có thì ra mạng
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put('./index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html').then(c => c || caches.match('./')))
    );
    return;
  }

  // 3) Còn lại (CDN, phông, ảnh Drive, icon…): stale-while-revalidate
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
