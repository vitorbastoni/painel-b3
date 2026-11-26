/* Painel B3 — casco do aplicativo.
   A página, o manifesto e os ícones ficam em cache para abrir sem rede.
   Cotações e indicadores (brapi, Banco Central, ANBIMA, BrasilAPI, AwesomeAPI) são
   sempre buscados na rede e nunca gravados neste cache. */
'use strict';

var VERSION = '11';
var SHELL_CACHE = 'painel-b3-shell-v' + VERSION;

var SHELL = [
  'index.html',
  'manifest-v2.webmanifest',
  'icons/vb-192.png',
  'icons/vb-512.png',
  'icons/vb-maskable-192.png',
  'icons/vb-maskable-512.png',
  'icons/vb-apple-touch.png',
  'icons/vb-favicon.png',
  'icons/vb-favicon.svg',
  'curva-juros.json',
  'xlsx-lite.js'
];

function isLiveDataHost(hostname) {
  var h = String(hostname || '').toLowerCase();
  if (h === 'brapi.dev' || h.endsWith('.brapi.dev')) return true;
  if (h === 'brasilapi.com.br' || h.endsWith('.brasilapi.com.br')) return true;
  if (h === 'anbima.com.br' || h.endsWith('.anbima.com.br')) return true;
  if (h === 'bcb.gov.br' || h.endsWith('.bcb.gov.br')) return true;
  if (h === 'economia.awesomeapi.com.br' || h.endsWith('.awesomeapi.com.br')) return true;
  return false;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key !== SHELL_CACHE;
      }).map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function networkFirstShell(request) {
  return caches.open(SHELL_CACHE).then(function (cache) {
    return fetch(request).then(function (response) {
      if (response && response.ok && response.type === 'basic' && !response.redirected) {
        cache.put(request, response.clone());
      }
      return response;
    }).catch(function (err) {
      return caches.match(request, { ignoreSearch: true }).then(function (cached) {
        if (cached) return cached;
        if (request.mode === 'navigate') {
          return caches.match('index.html').then(function (fallback) {
            if (fallback) return fallback;
            throw err;
          });
        }
        throw err;
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (isLiveDataHost(url.hostname)) {
    // Links (ex.: brapi.dev/dashboard) seguem normais. Só as consultas da página
    // são forçadas à rede, sem passar pelo cache HTTP nem pelo Cache Storage.
    if (request.mode === 'navigate') return;
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // O script do service worker não entra no cache: senão uma versão nova nunca chega.
  if (url.pathname.endsWith('/sw.js')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  event.respondWith(networkFirstShell(request));
});
