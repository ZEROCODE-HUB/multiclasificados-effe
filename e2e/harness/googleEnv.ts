import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * La llave de Google para las pruebas de mapas en Chromium.
 *
 * Estas pruebas hablan con Google DE VERDAD, y es a propósito: lo que
 * comprueban —que el mapa se pinta, que los pines aparecen, que la lista de
 * sugerencias se puede pulsar por encima del mapa— depende de que el SDK real
 * se cargue y haga su trabajo. Un mapa simulado no probaría nada de eso, que es
 * justo lo que se rompe en silencio.
 *
 * Si no hay llave en el `.env`, las pruebas que la necesitan se saltan solas en
 * vez de fallar: quien clona el repositorio sin credenciales debe poder correr
 * el resto de la suite.
 *
 * ⚠️ La llave del `.env` NO puede estar restringida por referente HTTP. Estas
 * pruebas montan la página sin dominio propio, así que Google las rechazaría
 * igual que rechazaría a un tercero, y los mapas saldrían en blanco sin que eso
 * signifique nada. Lo correcto son dos llaves: una restringida por referente
 * para producción, y otra sin restricción de aplicación —pero limitada a las
 * tres APIs y con cuota diaria— para desarrollo y pruebas.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function leerEnv(): Record<string, string> {
  try {
    const texto = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
    const vars: Record<string, string> = {};
    for (const linea of texto.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linea);
      if (m) vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return vars;
  } catch {
    return {};
  }
}

const env = leerEnv();

export const LLAVE_DE_MAPAS = env.VITE_GOOGLE_MAPS_API_KEY ?? "";

/** El entorno que se le inyecta al harness. */
export const ENTORNO_DE_MAPAS = {
  VITE_GOOGLE_MAPS_API_KEY: LLAVE_DE_MAPAS,
  // Google permite expresamente DEMO_MAP_ID para pruebas. En producción va el
  // Map ID propio del proyecto (VITE_GOOGLE_MAPS_MAP_ID).
  VITE_GOOGLE_MAPS_MAP_ID: env.VITE_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
};

export const hayLlaveDeMapas = (): boolean => LLAVE_DE_MAPAS.length > 0;

/** Selector del lienzo del mapa de Google, una vez montado. */
export const MAPA_DE_GOOGLE = ".gm-style";
