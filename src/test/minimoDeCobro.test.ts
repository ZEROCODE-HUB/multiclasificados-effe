// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MIN_COBRO_SOLES } from "@/lib/pricing";

/**
 * El piso de cobro está escrito DOS VECES y tiene que decir lo mismo.
 *
 * ── POR QUÉ HAY DOS ──────────────────────────────────────────────────
 *
 * El navegador no puede leer el de la Edge Function y la Edge Function no
 * importa del navegador: son dos runtimes distintos (Vite y Deno). Así que hay
 * una constante en cada lado y esta prueba es lo único que impide que se
 * separen.
 *
 * ── QUÉ PASA SI SE SEPARAN ───────────────────────────────────────────
 *
 * El servidor es el que COBRA; el navegador es el que ENSEÑA. Si el del
 * navegador dice S/ 1 y el del servidor S/ 5, la pantalla promete un importe y
 * el formulario de la tarjeta pide otro — con la tarjeta ya en la mano, que es
 * el peor momento para una sorpresa. Es exactamente lo que pasó el 04/09,
 * aunque entonces por otro motivo: el aviso del mínimo llegaba dos pantallas
 * tarde.
 *
 * ── Y POR QUÉ EXISTE EL PISO ─────────────────────────────────────────
 *
 * Un cargo de céntimos es rechazo casi seguro del emisor. Cuando falta menos
 * que el mínimo se cobra el mínimo, y la diferencia NO se pierde: se acredita
 * como saldo, porque `settle_paid_order` acredita lo cobrado y no lo que
 * costaba el aviso.
 */

const SERVIDOR = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/functions/create-payment/index.ts"),
  "utf8",
);

describe("el mínimo de cobro", () => {
  it("es el mismo en el navegador y en el servidor", () => {
    const m = /const MIN_CHARGE_PEN\s*=\s*([\d.]+)\s*;/.exec(SERVIDOR);
    expect(m, "no se encontró MIN_CHARGE_PEN en create-payment").not.toBeNull();
    expect(Number(m![1])).toBe(MIN_COBRO_SOLES);
  });

  it("y el servidor lo aplica como SUELO, no como techo", () => {
    // `Math.max(falta, MIN)`: si se colara un `Math.min`, un aviso de S/ 50 se
    // cobraría a S/ 1. Se comprueba la forma exacta porque el error es de una
    // sola letra y no lo cazaría ninguna prueba de importes.
    expect(SERVIDOR).toMatch(/Math\.max\(\s*falta\s*,\s*MIN_CHARGE_PEN\s*\)/);
  });

  it("es un importe que un banco no rechaza por ridículo", () => {
    // No es un número mágico: por debajo de un sol el emisor rechaza casi
    // siempre. Si algún día sube por la comisión de la pasarela, que suba —
    // pero que nunca baje de aquí.
    expect(MIN_COBRO_SOLES).toBeGreaterThanOrEqual(1);
  });
});

describe("lo cobrado de más NO se pierde", () => {
  it("la orden guarda como créditos el importe COBRADO, no el del aviso", () => {
    // Esta es la línea que hace que los S/ 0.31 de vuelta acaben en el saldo.
    // Si dijera `solesToCredits(listingCost)`, se cobraría S/ 1 y se acreditaría
    // S/ 0.69: la diferencia se evaporaría en cada compra.
    expect(SERVIDOR).toMatch(/const credits\s*=\s*solesToCredits\(total\)/);
  });
});
