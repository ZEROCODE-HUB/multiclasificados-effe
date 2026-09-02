import { describe, it, expect } from "vitest";
import { cuerpoDeNotificacion, rutaDeNotificacion } from "@/lib/textoDeNotificacion";

/**
 * QUE TODA NOTIFICACIÓN LLEVE A ALGUNA PARTE.
 *
 * Lo pidió el cliente (punto 09): "revisar que todas las notificaciones te
 * lleven o te indiquen el aviso o mensaje, y asegurar eso en todos los tipos".
 *
 * Una notificación que no lleva a ningún sitio es peor que no mandarla: obliga a
 * buscar a mano de qué habla, y en el momento en que hay que hacer algo —renovar
 * un aviso, responder un reclamo dentro del plazo legal— eso es exactamente lo
 * que hace que no se haga.
 *
 * Esta prueba recorre LOS QUINCE TIPOS. No comprueba que cada uno vaya a un
 * sitio concreto (eso está en las pruebas de cada caso), sino la regla general:
 * si la notificación habla de algo, tiene que llevar a ese algo.
 */

const AVISO = "11111111-1111-4111-8111-111111111111";
const CHAT = "22222222-2222-4222-8222-222222222222";

/** Los tipos que emite `notify_user`, con un payload realista.
 * Sin las dos excepciones declaradas (ver abajo). */
const TIPOS: Array<{ tipo: string; payload: Record<string, unknown>; rol: string }> = [
  { tipo: "listing_expiring", payload: { listing_id: AVISO, listing_title: "Depa", horas_restantes: 20, horas_transcurridas: 120 }, rol: "anunciante" },
  { tipo: "listing_disabled", payload: { listing_id: AVISO, listing_title: "Depa", reason: "Fotos repetidas" }, rol: "anunciante" },
  { tipo: "listing_enabled", payload: { listing_id: AVISO, listing_title: "Depa" }, rol: "anunciante" },
  { tipo: "new_message", payload: { conversation_id: CHAT, preview: "Hola" }, rol: "anunciante" },
  { tipo: "new_application", payload: { listing_title: "Cajero" }, rol: "anunciante" },
  { tipo: "application_status", payload: { status: "accepted" }, rol: "buscador" },
  { tipo: "new_review", payload: { listing_id: AVISO, rating: 5 }, rol: "anunciante" },
  { tipo: "saved_search_match", payload: { count: 3, name: "Autos en Lima" }, rol: "buscador" },
  { tipo: "complaint_new", payload: { resumen: "Reclamo R-0012 de Ana Pérez" }, rol: "admin" },
  { tipo: "career_new", payload: { nombre: "Ana", puesto: "contadora" }, rol: "admin" },
  { tipo: "moderation_warning", payload: { reason: "Fotos repetidas" }, rol: "anunciante" },
  { tipo: "invoice_voided", payload: { number: "B001-45", credits: 30 }, rol: "anunciante" },
  { tipo: "manual_payment_approved", payload: { purpose: "publish", published: true, listing_id: AVISO }, rol: "anunciante" },
  { tipo: "manual_payment_rejected", payload: { motivo: "El voucher no coincide" }, rol: "anunciante" },
];

describe("todos los tipos dicen algo", () => {
  it.each(TIPOS)("$tipo tiene un texto propio", ({ tipo, payload }) => {
    const texto = cuerpoDeNotificacion(tipo, payload);
    expect(texto.length).toBeGreaterThan(10);
    // Los tres genéricos que había: si sale uno, ese tipo se cayó al `default`.
    expect(texto).not.toBe("Notificación");
    expect(texto).not.toBe("Tienes una nueva notificación");
    expect(texto).not.toBe("Tienes una notificación nueva");
  });
});

describe("todos los tipos llevan a alguna parte", () => {
  // Las dos excepciones van en su propia prueba, abajo, y NO en esta lista:
  // así quitarlas de la excepción es una decisión y no un descuido.
  it.each(TIPOS)("$tipo tiene destino", ({ tipo, payload, rol }) => {
    expect(rutaDeNotificacion(tipo, payload, rol)).not.toBe("");
  });

  it("las dos excepciones son a propósito, y por motivos distintos", () => {
    // Una cuenta suspendida no tiene pantalla adonde ir: la cuenta está
    // suspendida.
    expect(rutaDeNotificacion("account_suspended", { reason: "x" }, "anunciante")).toBe("");
    // Y un mensaje del equipo sin aviso es INFORMATIVO: la campana lee esa
    // ausencia de destino y abre el texto completo en un modal. Darle un
    // destino haría que se navegara al panel y el mensaje no se leyera nunca.
    expect(rutaDeNotificacion("admin_message", { body: "Mantenimiento" }, "buscador")).toBe("");
  });
});

describe("la que habla de un aviso lleva HASTA ese aviso", () => {
  // No a la lista general: con veinte avisos, saber cuál es ponerse a buscar,
  // justo cuando quedan horas para renovarlo. `?aviso=` abre su pestaña, sube
  // hasta su fila y la resalta.
  const DE_AVISO = ["listing_expiring", "listing_disabled", "listing_enabled"];

  it.each(DE_AVISO)("%s señala el aviso", (tipo) => {
    expect(rutaDeNotificacion(tipo, { listing_id: AVISO }, "anunciante"))
      .toBe(`/dashboard/anunciante/avisos?aviso=${AVISO}`);
  });

  it("sin id sigue llevando a sus avisos: mejor eso que a ninguna parte", () => {
    expect(rutaDeNotificacion("listing_expiring", {}, "anunciante"))
      .toBe("/dashboard/anunciante/avisos");
  });

  it("una advertencia de moderación POR un aviso también lo señala", () => {
    // Antes dejaba en el panel y el usuario no sabía por cuál de sus avisos era.
    expect(rutaDeNotificacion("moderation_warning", { listing_id: AVISO, reason: "x" }, "anunciante"))
      .toBe(`/dashboard/anunciante/avisos?aviso=${AVISO}`);
  });

  it("y un mensaje del equipo sobre un aviso, igual", () => {
    expect(rutaDeNotificacion("admin_message", { listing_id: AVISO, body: "Revisa esto" }, "anunciante"))
      .toBe(`/dashboard/anunciante/avisos?aviso=${AVISO}`);
  });
});

describe("la que habla de un mensaje abre ESA conversación", () => {
  it("con el chat señalado", () => {
    expect(rutaDeNotificacion("new_message", { conversation_id: CHAT }, "anunciante"))
      .toBe(`/dashboard/anunciante/mensajes?c=${CHAT}`);
  });

  it("y en la rama del panel de quien lo recibe", () => {
    expect(rutaDeNotificacion("new_message", { conversation_id: CHAT }, "buscador"))
      .toBe(`/dashboard/buscador/mensajes?c=${CHAT}`);
  });
});

describe("una postulación lleva a donde se ve su estado", () => {
  it("a MIS postulaciones, no a la ficha del aviso", () => {
    // La ficha del aviso no dice en qué quedó la postulación de uno, que es lo
    // único que le importa a quien recibe ese aviso.
    expect(rutaDeNotificacion("application_status", { listing_id: AVISO, status: "accepted" }, "buscador"))
      .toBe("/dashboard/buscador/postulaciones");
  });
});
