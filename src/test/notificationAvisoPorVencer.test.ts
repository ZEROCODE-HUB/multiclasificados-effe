import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { notificationText, notificationLink, type AppNotification } from "@/lib/notifications";
import { rutaDeNotificacion } from "@/lib/textoDeNotificacion";

/**
 * La campana de "tu aviso está por vencer" tiene que llevar AL AVISO.
 *
 * Reportado por el cliente en la auditoría de agosto (anexo B, punto 06): el
 * aviso llegaba y dejaba al usuario en la lista general de sus avisos. Con
 * veinte avisos, saber cuál de ellos vence es ponerse a buscar — justo cuando le
 * quedan horas para renovarlo. El correo ya se corrigió; esto es la campana.
 */
const AVISO = "11111111-1111-4111-8111-111111111111";

const mk = (type: string, payload: Record<string, unknown>): AppNotification => ({
  id: "n1",
  type,
  title: "Tu aviso está por vencer",
  payload,
  read_at: null,
  created_at: "2026-08-25T00:00:00Z",
});

describe("aviso por vencer", () => {
  it("lleva al aviso concreto, no a la lista general", () => {
    expect(notificationLink(mk("listing_expiring", { listing_id: AVISO }), "anunciante"))
      .toBe(`/dashboard/anunciante/avisos?aviso=${AVISO}`);
  });

  it("sin id del aviso sigue llevando a sus avisos: mejor eso que a ninguna parte", () => {
    expect(notificationLink(mk("listing_expiring", {}), "anunciante"))
      .toBe("/dashboard/anunciante/avisos");
  });

  it("el texto sigue diciendo cuántos días quedan", () => {
    // Sin la cifra, "vence pronto" no ayuda a decidir si renovar ahora o luego.
    expect(notificationText(mk("listing_expiring", { listing_title: "Depa en Miraflores", dias: 3 })))
      .toContain("vence en 3 días");
  });

  it("un solo día se dice en singular", () => {
    expect(notificationText(mk("listing_expiring", { listing_title: "Depa", dias: 1 })))
      .toContain("vence en 1 día");
  });
});

describe("los otros avisos sobre un aviso también señalan cuál", () => {
  it("cuando lo deshabilita moderación", () => {
    // Es el caso donde más importa saber cuál: el usuario quiere ver QUÉ aviso
    // le tumbaron y por qué, no revisar los veinte.
    expect(notificationLink(mk("listing_disabled", { listing_id: AVISO }), "anunciante"))
      .toBe(`/dashboard/anunciante/avisos?aviso=${AVISO}`);
  });

  it("y cuando vuelve a estar visible", () => {
    expect(notificationLink(mk("listing_enabled", { listing_id: AVISO }), "anunciante"))
      .toBe(`/dashboard/anunciante/avisos?aviso=${AVISO}`);
  });
});

describe("el CORREO va al mismo sitio que la campana", () => {
  // Reportado abriendo el correo real: llevaba a la ficha pública del aviso, y
  // esa sale de `listing_cards`, que solo trae los ACTIVOS. Basta leer el correo
  // unas horas tarde —o al día siguiente— para que el aviso ya haya caducado y
  // el enlace no lleve a ninguna parte: se veía una ficha vacía.
  //
  // "Mis avisos" tiene el aviso SIEMPRE, vencido o no, y es donde se renueva.
  //
  // Esto se comprobaba leyendo el `switch` del correo con expresiones regulares.
  // Ya no hay tal `switch`: los tres canales preguntan a `rutaDeNotificacion`,
  // así que ahora se comprueba la respuesta en vez del texto del archivo.

  it("enlaza a Mis avisos con el aviso señalado", () => {
    expect(rutaDeNotificacion("listing_expiring", { listing_id: AVISO }, "anunciante"))
      .toBe(`/dashboard/anunciante/avisos?aviso=${AVISO}`);
  });

  it("y ya NO enlaza a la ficha pública, que puede haber caducado", () => {
    expect(rutaDeNotificacion("listing_expiring", { listing_id: AVISO }, "anunciante"))
      .not.toContain("/aviso/");
  });

  it("la ficha pública sigue usándose donde el aviso SÍ está activo", () => {
    // Una reseña nueva: ahí el enlace directo es lo correcto. El aviso está
    // publicado, que es la condición para que alguien lo haya podido reseñar.
    expect(rutaDeNotificacion("new_review", { listing_id: AVISO }, "anunciante"))
      .toBe(`/aviso/${AVISO}`);
  });

  it("el correo pide la ruta al módulo compartido y no se la inventa", () => {
    const CORREO = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/functions/send-email/index.ts"), "utf8",
    );
    expect(CORREO).toContain("rutaDeNotificacion");
    // Ni una sola ruta escrita a mano en la función: era así como se separó del
    // resto en primer lugar.
    expect(CORREO).not.toMatch(/\/dashboard\/anunciante\/avisos/);
  });
});
