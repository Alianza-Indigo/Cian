/*
 * Service worker de CIAN — Fase 0.
 *
 * Alcance deliberadamente minimo: hace instalable la aplicacion y da una
 * pantalla decente sin conexion. NO cachea respuestas autenticadas ni datos.
 *
 * Regla 3.6: mostrar informacion de salud vieja o de otra sesion seria peor
 * que no mostrar nada. Por eso solo se guardan recursos estaticos publicos.
 */

/*
 * Sube de version cuando cambie algo de PRECACHE_URLS.
 *
 * Al cambiar el logotipo esto no era opcional: los iconos estan precacheados y
 * se sirven de cache primero, asi que quien ya tuviera la aplicacion instalada
 * habria seguido viendo el logo viejo indefinidamente. El manejador de
 * `activate` borra las caches que no sean esta, asi que basta con el nombre.
 *
 * v2 — logotipo nuevo.
 */
const CACHE_NAME = 'cian-shell-v2';
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // La pantalla sin conexion lo enseña, y sin conexion no se puede ir a
  // buscarlo: si no esta aqui, se ve rota justo cuando importa.
  '/brand/cian-logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Nada de lo que responda el servidor de aplicacion se guarda: puede
  // contener datos de la persona.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then(
          (cached) =>
            cached ??
            new Response('Sin conexión', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            }),
        ),
      ),
    );
    return;
  }

  /*
   * Recursos estaticos publicos: primero cache, luego red.
   *
   * `/brand/` entra aqui y no solo en PRECACHE_URLS. Precachear un archivo no
   * sirve de nada si el manejador no lo busca en cache: la peticion se iria a
   * la red igual, y sin conexion la pantalla de «sin conexion» se veria sin
   * logotipo, que es justo el momento en que no hay a donde ir a buscarlo.
   */
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request)),
    );
  }
});

/*
 * Notificaciones (Fase 8).
 *
 * El contenido llega cifrado y el navegador ya lo descifro cuando este codigo
 * corre. Se muestra tal cual: no se pide nada a la red ni se guarda nada en
 * cache, porque el texto puede decir a que hora se bana una persona.
 *
 * `requireInteraction` queda en false a proposito. Una notificacion que se
 * queda fija en pantalla hasta que la tocas es exactamente el tipo de presion
 * que esta plataforma no quiere ejercer.
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch (error) {
    payload = { title: 'CIAN', body: event.data.text() };
  }

  const title = payload.title || 'CIAN';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Sin vibracion y sin sonido forzado: el dispositivo decide.
      requireInteraction: false,
      // La etiqueta evita que se apilen varios avisos del mismo recordatorio.
      tag: payload.tag || title,
      data: { url: payload.url || '/' },
    }),
  );
});

/*
 * Al tocar la notificacion se enfoca una pestana ya abierta en vez de abrir
 * otra. Acumular pestanas de la misma aplicacion es ruido, y este modulo
 * existe justamente para no anadir ruido.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            if ('navigate' in client) client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
