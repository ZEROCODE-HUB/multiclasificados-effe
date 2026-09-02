import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * LA WEB SE PUEDE INSTALAR, Y EL SERVICE WORKER NO PUEDE ROMPER NADA.
 *
 * La segunda mitad es la que importa. Un service worker se instala en el
 * navegador de cada visitante y SOBREVIVE A LOS DESPLIEGUES: si guarda el HTML
 * en caché, la gente se queda con la versión vieja de la aplicación y no hay
 * forma de arreglarlo desde el servidor — hay que esperar a que cada navegador
 * decida actualizarlo por su cuenta.
 *
 * Aquí eso sería peor de lo normal, porque dos mecanismos dependen de recibir
 * siempre el HTML fresco: `UpdateGate`, que obliga a recargar cuando hay versión
 * nueva, y `public/boot-watchdog.js`, que avisa si el bundle no arranca. Un HTML
 * cacheado los deja ciegos a los dos.
 *
 * Por eso estas comprobaciones son sobre lo que el service worker NO hace.
 */

const raiz = path.resolve(__dirname, "../..");
const leer = (p: string) => fs.readFileSync(path.resolve(raiz, p), "utf8");

const SW = leer("public/sw.js");
const MANIFIESTO = JSON.parse(leer("public/manifest.webmanifest"));
const INDEX = leer("index.html");
const VERCEL = JSON.parse(leer("vercel.json"));

describe("el manifiesto tiene lo que el navegador exige para ofrecer instalar", () => {
  it("nombre, arranque, alcance y pantalla completa", () => {
    expect(MANIFIESTO.name).toBeTruthy();
    expect(MANIFIESTO.short_name).toBeTruthy();
    expect(MANIFIESTO.start_url).toBeTruthy();
    expect(MANIFIESTO.scope).toBe("/");
    // "browser" abriría una pestaña normal y el navegador no ofrece instalarla.
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(MANIFIESTO.display);
  });

  it("los dos iconos obligatorios: 192 y 512", () => {
    // Chrome no ofrece instalar sin estos dos tamaños exactos.
    const tamanos = MANIFIESTO.icons.map((i: { sizes: string }) => i.sizes);
    expect(tamanos).toContain("192x192");
    expect(tamanos).toContain("512x512");
  });

  it("y esos iconos existen de verdad", () => {
    // Un manifiesto que apunta a un icono que no está deja la aplicación
    // instalada con el cuadrito gris del navegador.
    for (const icono of MANIFIESTO.icons as Array<{ src: string }>) {
      expect(fs.existsSync(path.resolve(raiz, "public", icono.src.replace(/^\//, "")))).toBe(true);
    }
  });

  it("el index lo enlaza, y con las etiquetas que iOS necesita aparte", () => {
    // iOS ignora el manifiesto: "Añadir a pantalla de inicio" mira sus propias
    // etiquetas y el apple-touch-icon.
    expect(INDEX).toContain('rel="manifest"');
    expect(INDEX).toContain("apple-mobile-web-app-capable");
    expect(INDEX).toContain("apple-touch-icon");
  });
});

describe("el service worker NO puede cachear el HTML", () => {
  it("las navegaciones van siempre a la red", () => {
    expect(SW).toContain('req.mode === "navigate"');
    // Red primero y la página de respaldo solo en el `catch`: nunca al revés.
    expect(SW).toMatch(/fetch\(req\)\.catch\(/);
  });

  it("solo cachea /assets/, que lleva hash en el nombre", () => {
    // Es lo que hace la caché segura por construcción: si cambia el contenido,
    // cambia el nombre del fichero.
    expect(SW).toContain('url.pathname.startsWith("/assets/")');
  });

  it("no guarda nada de otros dominios", () => {
    // Supabase, Google Maps y la pasarela llevan sesión o cambian a cada rato.
    expect(SW).toContain("url.origin !== self.location.origin");
  });

  it("no guarda peticiones que no sean GET", () => {
    // Un POST cacheado sería un pago repetido o un aviso duplicado.
    expect(SW).toContain('req.method !== "GET"');
  });

  it("no guarda respuestas que no sean un 200 propio", () => {
    // Un 404 en caché es un fichero roto servido para siempre.
    expect(SW).toContain("res.ok");
    expect(SW).toContain('res.type === "basic"');
  });
});

describe("y se puede quitar de encima si sale mal", () => {
  it("el service worker atiende una orden de desinstalarse", () => {
    expect(SW).toContain("effe:desinstalar");
    expect(SW).toContain("unregister()");
  });

  it("y hay un interruptor de despliegue que además limpia lo ya instalado", () => {
    // Cambiar el archivo en el servidor NO basta: el service worker viejo sigue
    // vivo en cada navegador. `VITE_PWA=off` es lo que de verdad lo quita.
    const PWA = leer("src/lib/pwa.ts");
    expect(PWA).toContain("VITE_PWA");
    expect(PWA).toContain("unregister");
    expect(PWA).toContain("caches.delete");
  });

  it("dentro del APK y del iPhone no se registra", () => {
    // Allí la aplicación ya es nativa: el service worker solo competiría con la
    // actualización por OTA.
    expect(leer("src/lib/pwa.ts")).toContain("Capacitor.isNativePlatform()");
  });
});

describe("el hosting sirve los ficheros y no los reescribe", () => {
  const reescritura = VERCEL.rewrites.find(
    (r: { destination: string }) => r.destination === "/index.html",
  );

  it("sw.js, el manifiesto y la página sin conexión quedan fuera del comodín", () => {
    // La reescritura manda TODO a index.html. Si atrapara al service worker, el
    // navegador se descargaría el HTML de la portada creyendo que es JavaScript.
    for (const fichero of ["sw\\.js", "manifest\\.webmanifest", "sin-conexion\\.html"]) {
      expect(reescritura.source).toContain(fichero);
    }
  });

  it("y sw.js no se cachea en el CDN", () => {
    // Si el CDN lo guardara, la salida de emergencia no llegaría a nadie.
    const cabeceras = VERCEL.headers.find((h: { source: string }) => h.source === "/sw.js");
    expect(cabeceras).toBeTruthy();
    expect(JSON.stringify(cabeceras)).toContain("must-revalidate");
  });
});
