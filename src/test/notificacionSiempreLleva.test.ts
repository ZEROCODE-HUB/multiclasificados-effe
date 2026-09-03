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
 * Sin las TRES excepciones declaradas (ver abajo). */
const TIPOS: Array<{ tipo: string; payload: Record<string, unknown>; rol: string }> = [
  { tipo: "listing_expiring", payload: { listing_id: AVISO, listing_title: "Depa", horas_restantes: 20, horas_transcurridas: 120 }, rol: "anunciante" },
  { tipo: "listing_disabled", payload: { listing_id: AVISO, listing_title: "Depa", reason: "Fotos repetidas" }, rol: "anunciante" },
  { tipo: "listing_enabled", payload: { listing_id: AVISO, listing_title: "Depa" }, rol: "anunciante" },
  { tipo: "new_message", payload: { conversation_id: CHAT, preview: "Hola" }, rol: "anunciante" },
  { tipo: "new_application", payload: { listing_title: "Cajero" }, rol: "anunciante" },
  { tipo: "application_status", payload: { status: "accepted" }, rol: "buscador" },
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
  // Las tres excepciones van en su propia prueba, abajo, y NO en esta lista:
  // así quitarlas de la excepción es una decisión y no un descuido.
  it.each(TIPOS)("$tipo tiene destino", ({ tipo, payload, rol }) => {
    expect(rutaDeNotificacion(tipo, payload, rol)).not.toBe("");
  });

  it("las tres excepciones son a propósito, y por motivos distintos", () => {
    // Una cuenta suspendida no tiene pantalla adonde ir: la cuenta está
    // suspendida.
    expect(rutaDeNotificacion("account_suspended", { reason: "x" }, "anunciante")).toBe("");
    // Y un mensaje del equipo sin aviso es INFORMATIVO: la campana lee esa
    // ausencia de destino y abre el texto completo en un modal. Darle un
    // destino haría que se navegara al panel y el mensaje no se leyera nunca.
    expect(rutaDeNotificacion("admin_message", { body: "Mantenimiento" }, "buscador")).toBe("");
    // Una reseña llevaba a la ficha del aviso, pero las reseñas están ocultas
    // ahí desde julio (`ListingReviews` no se monta en ninguna parte). Llevaba
    // a una pantalla donde no está lo que la notificación anuncia. Tampoco se
    // pueden crear nuevas, así que esto solo afecta a las que quedan en la
    // campana: sin destino, se abren como informativas y dicen la puntuación.
    expect(rutaDeNotificacion("new_review", { listing_id: AVISO, rating: 5 }, "anunciante")).toBe("");
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
    const ruta = rutaDeNotificacion("application_status", { listing_id: AVISO, status: "accepted" }, "buscador");
    expect(ruta).toContain("/dashboard/buscador/postulaciones");
    expect(ruta).not.toContain("/aviso/");
  });
});

describe("y además SEÑALA la fila, no solo abre la lista", () => {
  /**
   * Una notificación que deja en una lista general no ha terminado su trabajo:
   * ha dicho que algo pasó y ha pedido que se busque. Con veinte avisos, o con
   * las postulaciones de una semana, eso es lo que hace que no se mire.
   *
   * Los identificadores que se usan aquí NO son inventados: son los que traen
   * las notificaciones reales de producción (comprobado el 2026-09-02).
   */
  it("la búsqueda guardada que encontró avisos", () => {
    expect(rutaDeNotificacion("saved_search_match", { saved_search_id: "s-1", count: 3 }, "buscador"))
      .toBe("/dashboard/buscador/busquedas?busqueda=s-1");
  });

  it("la postulación que acaba de llegar", () => {
    expect(rutaDeNotificacion("new_application", { application_id: "p-1" }, "anunciante"))
      .toBe("/dashboard/anunciante/postulaciones?postulacion=p-1");
  });

  it("y la postulación propia que cambió de estado, por su aviso", () => {
    // `application_status` solo trae `listing_id`. Basta: no se puede postular
    // dos veces al mismo aviso.
    expect(rutaDeNotificacion("application_status", { listing_id: AVISO }, "buscador"))
      .toBe(`/dashboard/buscador/postulaciones?aviso=${AVISO}`);
  });

  it("si falta el identificador, se abre la lista y ya: nunca un enlace roto", () => {
    // Las notificaciones viejas pueden no traerlo. Mejor la lista que un
    // parámetro vacío que no señala nada y ensucia la URL.
    expect(rutaDeNotificacion("saved_search_match", { count: 3 }, "buscador"))
      .toBe("/dashboard/buscador/busquedas");
    expect(rutaDeNotificacion("new_application", {}, "anunciante"))
      .toBe("/dashboard/anunciante/postulaciones");
  });
});

describe("al personal no se le ofrece un panel de usuario", () => {
  /**
   * `RequireRole` niega los paneles de usuario a las cuentas de administración,
   * a propósito y por diseño. Así que un enlace ahí no lleva a la sección: lleva
   * a "Acceso denegado".
   *
   * NO ES HIPOTÉTICO. Comprobado contra producción el 2026-09-02: hay cuentas de
   * personal con notificaciones de `new_application` (7), `application_status`
   * (6) y `new_message` (4). Las tres acababan en la pantalla de acceso
   * denegado al pulsarlas desde la campana.
   *
   * Sin destino, la campana abre el texto completo en un modal, que es lo que ya
   * hace con los avisos informativos. No se pierde nada: a ese panel no iban a
   * poder entrar igualmente.
   */
  const DE_USUARIO: Array<[string, Record<string, unknown>]> = [
    ["new_application", { application_id: "p-1" }],
    ["application_status", { listing_id: AVISO, status: "accepted" }],
    ["new_message", { conversation_id: CHAT }],
    ["listing_expiring", { listing_id: AVISO }],
    ["invoice_voided", { number: "B001-45" }],
    ["manual_payment_approved", { purpose: "publish", listing_id: AVISO }],
  ];

  it.each(["admin", "superadmin", "moderador", "soporte"])(
    "un %s no recibe enlace a un panel de usuario",
    (rol) => {
      for (const [tipo, payload] of DE_USUARIO) {
        expect(rutaDeNotificacion(tipo, payload, rol)).toBe("");
      }
    },
  );

  it("los cuatro roles de personal, no solo los dos con panel propio", () => {
    // Moderador y soporte no tienen rama propia (/dashboard/moderador no
    // existe), pero `isStaffRole` los cuenta como personal y `RequireRole` les
    // niega los paneles de usuario igual que a un admin. Olvidarlos aquí los
    // dejaba a ellos con el callejón sin salida.
    expect(rutaDeNotificacion("new_message", { conversation_id: CHAT }, "moderador")).toBe("");
    expect(rutaDeNotificacion("new_message", { conversation_id: CHAT }, "soporte")).toBe("");
  });

  it("pero el personal SÍ conserva los destinos que son suyos", () => {
    expect(rutaDeNotificacion("complaint_new", {}, "admin")).toBe("/dashboard/admin/reclamaciones");
    expect(rutaDeNotificacion("career_new", {}, "superadmin")).toBe("/dashboard/superadmin/postulaciones");
  });

  it("moderador y soporte van a la rama de admin, que es la que existe", () => {
    // NO hay `/dashboard/moderador/...`. Componiendo la ruta con el nombre del
    // rol —que es lo que se hacía— estos dos se quedaban sin destino, aunque
    // los dos SÍ pueden abrir la rama de admin: su guarda pide `min="soporte"`.
    // Lo que ven dentro lo recorta la Matriz de permisos, no la ruta.
    expect(rutaDeNotificacion("complaint_new", {}, "moderador")).toBe("/dashboard/admin/reclamaciones");
    expect(rutaDeNotificacion("career_new", {}, "soporte")).toBe("/dashboard/admin/postulaciones");
  });

  it("y a una reseña tampoco, que ya no lleva a ninguna parte", () => {
    // Da igual el rol: desde que las reseñas están ocultas en la ficha, este
    // tipo no tiene destino para nadie.
    expect(rutaDeNotificacion("new_review", { listing_id: AVISO }, "admin")).toBe("");
    expect(rutaDeNotificacion("new_review", { listing_id: AVISO }, "anunciante")).toBe("");
  });

  it("a un usuario normal no le cambia nada", () => {
    expect(rutaDeNotificacion("new_application", { application_id: "p-1" }, "anunciante"))
      .toBe("/dashboard/anunciante/postulaciones?postulacion=p-1");
  });
});
