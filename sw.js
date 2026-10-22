// sw.js — the service worker. It saves a copy of every app file on the
// phone, so the app opens with no internet.
//
// WHEN YOU CHANGE ANY APP FILE: bump CACHE_NAME (v1 -> v2). The phone
// then downloads the new files the next time it's online, and uses
// them from the next launch. Your phrases and takes (in IndexedDB) are not touched.

const CACHE_NAME = 'bards-tongue-v1';
const FONT_CACHE = 'bards-tongue-fonts';

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/db.js',
  './js/ui.js',
  './js/audio.js',
  './js/speech.js',
  './js/score.js',
  './js/sprite.js',
  './js/board.js',
  './js/library.js',
  './js/shadow.js',
  './js/backup.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

// Install: download and save every app file.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete copies from older versions (the font copy is kept).
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME && n !== FONT_CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Fetch: answer from the saved copy first; fall back to the network.
// Google Fonts are saved the first time they load, so they work offline too.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(event.request).then((saved) => saved || fetch(event.request).then((res) => {
          cache.put(event.request, res.clone());
          return res;
        })))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((saved) => saved || fetch(event.request))
  );
});
