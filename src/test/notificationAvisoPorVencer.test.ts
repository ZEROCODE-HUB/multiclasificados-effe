import { describe, it, expect } from "vitest";
import { notificationText, notificationLink, type AppNotification } from "@/lib/notifications";

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
