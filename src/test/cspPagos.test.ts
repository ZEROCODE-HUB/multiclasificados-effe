// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * La cabecera de seguridad NO puede cerrarle la puerta al 3-D Secure.
 *
 * ── LO QUE PASÓ, PARA QUE NO SE REPITA ───────────────────────────────
 *
 * `form-action 'self'` tumbó los pagos con tarjeta. El síntoma era un mensaje
 * de Izipay que no menciona nada de esto:
 *
 *     Unable to authenticate
 *
 * La causa está en cómo funciona la verificación del banco. La librería de
 * Izipay (`kr-payment-form.min.js`) hace esto DENTRO de nuestra página:
 *
 *     const f = document.createElement("form");
 *     f.action = instruccion.http.url;   // ← el dominio del BANCO emisor
 *     f.target = iframe.id;
 *     f.submit();
 *
 * Es el envío de los parámetros del 3-D Secure 2 (`creq`, `threeDSMethodData`,
 * `threeDSSessionData`). Con `form-action 'self'`, el navegador BLOQUEA ese
 * envío: la ventana del banco no llega a cargarse, la autenticación no ocurre y
 * el pago muere sin que nada en nuestro lado registre un error.
 *
 * ── POR QUÉ `https:` Y NO UNA LISTA DE DOMINIOS ──────────────────────
 *
 * Porque el dominio no se puede saber de antemano: la página de verificación la
 * sirve el BANCO QUE EMITIÓ LA TARJETA, y hay uno distinto por banco y por país.
 * Enumerarlos es imposible y una lista incompleta rompe el pago justo para los
 * clientes del banco que falte — el fallo más caro que existe aquí.
 *
 * `https:` sigue sirviendo de algo: prohíbe `http:` y `javascript:`, que es lo
 * que se explotaría en un secuestro de formulario. Y el resto de la política
 * aguanta: `script-src` sin `unsafe-inline`, `object-src 'none'`,
 * `base-uri 'self'` y `frame-ancestors 'none'`.
 */

const VERCEL = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8"),
) as { headers?: Array<{ headers?: Array<{ key: string; value: string }> }> };

/** Las directivas de una política, indexadas por nombre. */
function directivas(politica: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const trozo of politica.split(";")) {
    const [nombre, ...resto] = trozo.trim().split(/\s+/);
    if (nombre) m.set(nombre.toLowerCase(), resto.join(" "));
  }
  return m;
}

const POLITICAS = (VERCEL.headers ?? [])
  .flatMap((g) => g.headers ?? [])
  .filter((h) => /^content-security-policy/i.test(h.key))
  .map((h) => ({ nombre: h.key, d: directivas(h.value) }));

describe("las cabeceras dejan pasar la verificación del banco", () => {
  it("hay una política aplicada y otra en pruebas", () => {
    // Si desaparecieran, el resto de esta prueba pasaría sin comprobar nada.
    expect(POLITICAS.length).toBe(2);
  });

  for (const { nombre } of POLITICAS) {
    it(`${nombre}: \`form-action\` admite dominios externos`, () => {
      const d = POLITICAS.find((p) => p.nombre === nombre)!.d;
      const valor = d.get("form-action") ?? "";
      // `'self'` a secas es exactamente lo que rompía el pago.
      expect(valor, "form-action no puede quedarse en 'self'").not.toBe("'self'");
      expect(valor).toMatch(/\bhttps:|\*/);
    });
  }

  it("la política en pruebas tampoco puede cerrar el marco del banco", () => {
    // `frame-src` solo está en la de pruebas. Si algún día se promueve a
    // aplicada con una lista cerrada de dominios, el 3-D Secure vuelve a
    // romperse: la página de verificación NO está en micuentaweb.pe.
    const prueba = POLITICAS.find((p) => /report-only/i.test(p.nombre))!;
    const frame = prueba.d.get("frame-src");
    if (frame !== undefined) expect(frame).toMatch(/\bhttps:|\*/);
  });
});

describe("y lo que NO se afloja", () => {
  // Abrir `form-action` no es excusa para aflojar el resto.
  it("los guardias que de verdad frenan una inyección siguen puestos", () => {
    const aplicada = POLITICAS.find((p) => !/report-only/i.test(p.nombre))!.d;
    expect(aplicada.get("object-src")).toBe("'none'");
    expect(aplicada.get("base-uri")).toBe("'self'");
    expect(aplicada.get("frame-ancestors")).toBe("'none'");
    // Sin `unsafe-inline` no hay script que se pueda colar en la página, que es
    // el paso previo a cualquier secuestro de formulario.
    expect(aplicada.get("script-src")).not.toContain("unsafe-inline");
  });
});
