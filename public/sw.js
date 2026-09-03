/* eFFe Multiclasificados — service worker.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE ARCHIVO **NO** HACE, Y POR QUÉ ES LO MÁS IMPORTANTE DE ÉL
 *
 * Un service worker se instala en el navegador de cada visitante y sobrevive a
 * los despliegues: si guarda en caché el HTML, la gente se queda con la versión
 * vieja de la aplicación y NO HAY FORMA DE ARREGLARLO DESDE EL SERVIDOR. Hay
 * que esperar a que cada navegador decida actualizarlo.
 *
 * En esta aplicación eso sería especialmente grave, porque hay dos mecanismos
 * que dependen de recibir siempre el HTML fresco:
 *
 *   · AvisoActualizar compara el build desplegado con el que corre y ofrece
 *                     recargar cuando hay uno nuevo. (UpdateGate NO: ese solo
 *                     actúa en el APK y en el iPhone.)
 *   · boot-watchdog   avisa si el bundle no llega a ejecutarse.
 *
 * Un HTML cacheado los deja a los dos ciegos. Así que aquí:
 *
 *   ✗ NO se cachea el HTML ni ninguna navegación.
 *   ✗ NO se cachea nada de la API, de Supabase ni de ningún otro dominio.
 *   ✗ NO se cachea ninguna respuesta que no sea un 200 normal.
 *   ✓ Solo se cachean los ficheros de /assets/, que llevan un hash en el nombre:
 *     cuando cambia el contenido cambia el nombre, así que servir el viejo desde
 *     la caché es imposible por construcción.
 *
 * Existe, entonces, para dos cosas: que la aplicación se pueda INSTALAR (Chrome
 * exige un service worker con manejador de `fetch`) y que abrirla sin conexión
 * enseñe una página nuestra en vez del dinosaurio del navegador.
 * ───────────────────────────────────────────────────────────────────────────── */

// Subir el número al cambiar este archivo: al cambiar el nombre de la caché, la
// vieja se borra entera en el `activate`.
const CACHE = "effe-v1";
const SIN_CONEXION = "/sin-conexion.html";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.add(SIN_CONEXION))
      // Si la página de respaldo no se puede descargar, el service worker se
      // instala igual: sin ella se pierde el mensaje de "sin conexión", pero
      // fallar la instalación entera por eso sería mucho peor.
      .catch(() => undefined)
      // Sin `skipWaiting`, un service worker nuevo se queda esperando a que se
      // cierren TODAS las pestañas de la aplicación. Con esto, el arreglo llega
      // en la siguiente recarga.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;

  // Solo GET. Un POST cacheado sería un pago repetido o un aviso duplicado.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Nada de otros dominios: ni Supabase, ni Google Maps, ni la pasarela. Sus
  // respuestas llevan sesión o cambian a cada momento.
  if (url.origin !== self.location.origin) return;

  // Las navegaciones (abrir una página) van SIEMPRE a la red. Si no hay red, la
  // página de respaldo. Nunca se sirve HTML cacheado: ver el aviso de arriba.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() =>
        caches.match(SIN_CONEXION).then((r) => r || new Response("Sin conexión", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
        })),
      ),
    );
    return;
  }

  // Los ficheros del build, que llevan hash en el nombre. Aquí la caché es
  // segura: un cambio de contenido cambia el nombre del fichero.
  if (!url.pathname.startsWith("/assets/")) return;

  e.respondWith(
    caches.match(req).then((cacheada) => {
      if (cacheada) return cacheada;
      return fetch(req).then((res) => {
        // `res.ok` y `type === "basic"`: un 404 o una respuesta opaca guardada
        // en caché sería un fichero roto servido para siempre.
        if (res.ok && res.type === "basic") {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => undefined);
        }
        return res;
      });
    }),
  );
});

// Salida de emergencia: desde la aplicación se puede pedir que se desinstale.
// Sin esto, un service worker con un fallo grave solo se quita a mano desde las
// herramientas del navegador, y eso no se le puede pedir a un usuario.
self.addEventListener("message", (e) => {
  if (e.data === "effe:desinstalar") {
    self.registration.unregister().then(() => self.clients.claim());
  }
});
