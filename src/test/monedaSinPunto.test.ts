import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Guardia contra la séptima copia. Dos cosas que ya pasaron y no deberían
// volver a pasar:
//   1. escribir la sigla como "S/." (el punto no va: S/ es un símbolo, no una
//      abreviatura), y
//   2. formatear el precio de un aviso a mano en el componente de turno, que es
//      como llegamos a tener tres formatos distintos conviviendo en la app.
const RAIZ = join(process.cwd(), "src");

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === "test") continue;
      out.push(...archivos(p));
    } else if (/\.(ts|tsx)$/.test(e)) {
      out.push(p);
    }
  }
  return out;
}

describe("moneda", () => {
  const fuentes = archivos(RAIZ);

  it("no queda ningún 'S/.' en la interfaz", () => {
    const culpables = fuentes.filter((f) => readFileSync(f, "utf8").includes("S/."));
    expect(culpables).toEqual([]);
  });

  it("nadie formatea el precio de un aviso por su cuenta", () => {
    // Un precio pintado a mano se salta el "Precio a convenir" del helper y
    // enseña "PEN 0" o "S/ 0". Pasó en el panel de moderación y en el del
    // buscador, y no se vio hasta probarlo en producción.
    const aMano = [
      /\.price\b[^\n]{0,40}\.toLocaleString\(/,
      /price\s*\|\|\s*0\)\.toLocaleString\(/,
    ];
    const culpables = fuentes.filter((f) => {
      if (f.endsWith(join("lib", "pricing.ts"))) return false;
      const src = readFileSync(f, "utf8");
      return aMano.some((re) => re.test(src));
    });
    expect(culpables).toEqual([]);
  });

  it("solo pricing.ts arma la sigla con un importe", () => {
    // Busca plantillas del tipo `S/ ${...}` fuera del módulo de precios.
    const culpables = fuentes.filter((f) => {
      if (f.endsWith(join("lib", "pricing.ts")) || f.endsWith(join("lib", "soporte.ts"))) return false;
      const src = readFileSync(f, "utf8");
      return /`(S\/|US\$) \$\{/.test(src);
    });
    expect(culpables).toEqual([]);
  });
});
