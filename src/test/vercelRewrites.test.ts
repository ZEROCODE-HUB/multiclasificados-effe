// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { getTransformedRoutes, normalizeRoutes } from "@vercel/routing-utils";
import path from "node:path";

/**
 * La reescritura de rutas de `vercel.json`, que es fácil de romper sin notarlo
 * porque no falla al desplegar: falla en el navegador de un usuario.
 *
 * Era `/(.*) -> /index.html`, o sea TODO. Un archivo de código que no existe
 * (pasa en cada despliegue con las pestañas ya abiertas, porque los nombres
 * llevan el hash del contenido) devolvía el HTML de la app con código 200. El
 * navegador intentaba ejecutar HTML como JavaScript y salía:
 *
 *   TypeError: Failed to fetch dynamically imported module: .../SettingsPage-tBDPHwQP.js
 *
 * Un 404 honesto habría dicho lo que pasaba a la primera.
 */

const CRUDO = fs.readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8");
const vercel = JSON.parse(CRUDO) as {
  rewrites: Array<{ source: string; destination: string }>;
  redirects?: unknown[];
  headers?: Array<Record<string, unknown>>;
};

// Se comprueba contra las rutas COMPILADAS por Vercel, no contra el texto de
// `source`: los `rewrites` se escriben en path-to-regexp (`/aviso/:id`), que no
// es una expresión regular. Tratarlo como tal daba resultados falsos.
// Si el archivo no es válido no se lanza aquí: reventar al cargar el módulo
// deja la suite en "no tests", que no dice nada. Se devuelve vacío y es la
// prueba del validador, más abajo, la que informa con el mensaje de Vercel.
const transformadas = getTransformedRoutes({ rewrites: vercel.rewrites, headers: vercel.headers });
const rutas = (transformadas.routes ?? []).filter((r) => r.dest);

/** A qué destino manda Vercel una ruta dada (la primera regla que casa). */
const destinoDe = (ruta: string): string | null => {
  for (const r of rutas) {
    if (new RegExp(r.src!).test(ruta)) return String(r.dest);
  }
  return null;
};
const coincide = (ruta: string) => destinoDe(ruta) === "/index.html";
const reglaSpa = vercel.rewrites.find((r) => r.destination === "/index.html")!;

describe("vercel.json — la reescritura SPA no se traga los assets", () => {
  it("existe una regla que manda al index.html", () => {
    expect(reglaSpa).toBeTruthy();
  });

  it("las rutas de la app SÍ se reescriben (las resuelve el router)", () => {
    for (const ruta of [
      "/",
      "/buscar",
      "/dashboard/anunciante/configuracion",
      "/dashboard/admin/tarifas",
    ]) {
      expect(coincide(ruta), ruta).toBe(true);
    }
  });

  it("la ficha de un aviso va a la función de vista previa, y ANTES que la regla general", () => {
    // El orden importa: Vercel aplica la primera regla que casa. Si la general
    // fuera antes, la función nunca se ejecutaría y los enlaces compartidos
    // volverían a la tarjeta genérica.
    expect(destinoDe("/aviso/01e6d187-aa3f-448d-802f-a69c17900d0c")).toContain("og-aviso");
    // Pero no se traga el listado ni otras rutas.
    expect(destinoDe("/buscar")).toBe("/index.html");
  });

  it("las rutas de /api tampoco se reescriben, o la función se llamaría a sí misma", () => {
    expect(coincide("/api/og-aviso")).toBe(false);
  });

  it("los archivos de /assets NO se reescriben: si faltan, deben dar 404", () => {
    for (const archivo of [
      "/assets/SettingsPage-tBDPHwQP.js",
      "/assets/index-C3UicwE2.js",
      "/assets/index-abc123.css",
    ]) {
      expect(coincide(archivo), archivo).toBe(false);
    }
  });

  it("una ruta que solo EMPIEZA por algo parecido sigue reescribiéndose", () => {
    // Que la exclusión no se pase de lista y rompa rutas legítimas.
    expect(coincide("/assetsxyz")).toBe(true);
    expect(coincide("/mis-assets/foo")).toBe(true);
  });
});

/**
 * Y que el archivo siga siendo VÁLIDO para Vercel.
 *
 * Esto costó tres commits sin desplegar, y en silencio: GitHub aceptaba el push,
 * la web seguía en pie sirviendo la versión anterior y nada avisaba. Fueron DOS
 * fallos encadenados, y el segundo solo apareció al arreglar el primero:
 *
 *  1. Claves `"//"` metidas en las reglas a modo de comentario (JSON no tiene
 *     comentarios). El esquema de vercel.json declara `additionalProperties:
 *     false` y rechaza el archivo entero.
 *  2. Un `source` con grupo de captura con nombre — `/aviso/(?<id>[^/]+)` —, que
 *     es sintaxis de expresión regular. Los `rewrites` usan path-to-regexp:
 *     `/aviso/:id`, y el parámetro se referencia como `:id` en el destino (con
 *     `$id` se queda literal y no sustituye nada).
 *
 * Por eso aquí ya no se comprueba a ojo: se pasa por `@vercel/routing-utils`,
 * que es el paquete que usa la propia Vercel para transformar y validar las
 * rutas. Lo que pase esto, pasa el despliegue.
 */
describe("vercel.json — el archivo es válido para Vercel", () => {
  it("las rutas pasan el validador de la propia Vercel", () => {
    expect(transformadas.error?.message, "Vercel rechazaría este vercel.json").toBeUndefined();
    const n = normalizeRoutes(transformadas.routes ?? []);
    expect(n.error?.message).toBeUndefined();
  });

  it("el parámetro del aviso se sustituye de verdad en el destino", () => {
    // Con `$id` en vez de `:id` el destino se quedaba tal cual y la función
    // recibía la cadena "$id" en lugar del identificador.
    const ruta = rutas.find((r) => String(r.dest).includes("og-aviso"))!;
    expect(ruta.dest).toMatch(/id=\$\d+$/);
    expect(ruta.dest).not.toContain("$id");
  });

  it("ninguna regla lleva claves que el esquema no conozca", () => {
    // `routing-utils` transforma rutas pero NO valida el esquema del archivo:
    // acepta un `"//"` que Vercel rechaza. Por eso esta comprobación sigue.
    const CLAVES = {
      rewrites: ["source", "destination", "has", "missing", "statusCode"],
      redirects: ["source", "destination", "permanent", "statusCode", "has", "missing", "env"],
      headers: ["source", "headers", "has", "missing"],
    } as const;
    for (const seccion of Object.keys(CLAVES) as Array<keyof typeof CLAVES>) {
      for (const entrada of (vercel[seccion] ?? []) as Array<Record<string, unknown>>) {
        const sobran = Object.keys(entrada).filter((k) => !CLAVES[seccion].includes(k as never));
        expect(sobran, `regla de ${seccion} con claves no válidas`).toEqual([]);
      }
    }
  });

  it("no hay comentarios `//` colados como clave", () => {
    expect(CRUDO).not.toMatch(/"\/\/"\s*:/);
  });
});
