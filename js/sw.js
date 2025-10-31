// sw.js — Stale-While-Revalidate pour images (AniList, OpenLibrary, + tes /images locaux)

const CACHE = 'img-cache-v1';
const IMG_HOSTS = [
  's4.anilist.co',
  'covers.openlibrary.org',
  'cdn.myanimelist.net', // images MAL
  'api.jikan.moe'        // JSON Jikan (optionnel)
];


self.addEventListener('install', (event) => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  const isLocalImage = url.pathname.startsWith('/images/');
  const isImgHost = IMG_HOSTS.includes(url.hostname);
  if (!isLocalImage && !isImgHost) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    const fetchPromise = fetch(event.request).then((netRes) => {
      if (netRes && netRes.ok) cache.put(event.request, netRes.clone());
      return netRes;
    }).catch(() => cached);

    return cached || fetchPromise;
  })());
});
