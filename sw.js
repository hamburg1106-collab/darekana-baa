"use strict";

/* サービスワーカー: 絵と画面を全部端末に保存しておき、電波のない電車やトンネルでも遊べるようにする。
   更新したら CACHE_NAME の版数を上げること（上げないとスマホ側に反映されない）。 */

const CACHE_NAME = "darekana-v1";
const SHELL_FILES = [
  "./", "./index.html", "./style.css", "./script.js", "./manifest.json",
  "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png",
  "./img/bg.webp","./img/cat_happy.webp","./img/cat_normal.webp","./img/dog_bark.webp","./img/dog_happy.webp","./img/dog_normal.webp","./img/elephant_happy.webp","./img/elephant_normal.webp","./img/lion_happy.webp","./img/lion_normal.webp","./img/lion_roar.webp","./img/panda_bamboo.webp","./img/panda_happy.webp","./img/panda_normal.webp","./img/penguin_flap.webp","./img/penguin_happy.webp","./img/penguin_normal.webp","./img/rabbit_ear.webp","./img/rabbit_happy.webp","./img/rabbit_normal.webp","./img/seal_clap.webp","./img/seal_happy.webp","./img/seal_normal.webp","./img/squirrel_happy.webp","./img/squirrel_nibble.webp","./img/squirrel_normal.webp","./img/suke_baa.webp","./img/suke_blink.webp","./img/suke_happy.webp","./img/suke_normal.webp","./img/suke_surprised.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request)));
});
