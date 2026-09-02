import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { cuerpoDeNotificacion, rutaDeNotificacion } from "@/lib/textoDeNotificacion";

/**
 * QUE LOS TRES CANALES DIGAN LO MISMO.
 *
 * La misma notificación viaja por campana, correo y push, y cada uno tenía su
 * propio `switch`: 15 tipos en el front, 9 en el correo y 5 en el push. Lo que
 * no estaba en la lista de cada canal caía en su `default`, así que el aviso de
 * vencimiento —el único que le puede costar dinero al anunciante— llegaba al
 * teléfono como "Tienes una nueva notificación" y abría la ficha pública, que
 * si el aviso ya venció ni siquiera existe.
 *
 * Ahora hay un módulo y una copia para Deno. Esta prueba vigila las dos cosas:
 * que la copia no se separe del original, y que ningún canal se vuelva a
 * escribir sus propios textos por su cuenta.
 */

const raiz = path.resolve(__dirname, "../..");
// Normalizando los saltos de línea: el repositorio se edita en Windows y en
// Linux, y un CRLF contra un LF haría fallar la comparación por algo que no
// tiene nada que ver con lo que dicen los textos.
const leer = (p: string) =>
  fs.readFileSync(path.resolve(raiz, p), "utf8").replace(/\r\n/g, "\n");

const FRONT = leer("src/lib/textoDeNotificacion.ts");
const DENO = leer("supabase/functions/_shared/textoDeNotificacion.ts");
const CORREO = leer("supabase/functions/send-email/index.ts");
const PUSH = leer("supabase/functions/send-push/index.ts");

/** Los dos archivos a partir de donde empieza el código común. */
const MARCA = "export type Rol = string;";
const comun = (s: string) => s.slice(s.indexOf(MARCA));

describe("la copia de Deno no se separa del original", () => {
  it("es idéntica de `export type Rol` en adelante", () => {
    // Si esto falla, alguien tocó uno de los dos. Copiar el bloque del que se
    // cambió al otro; NO relajar la comprobación.
    expect(comun(DENO)).toBe(comun(FRONT));
  });

  it("las dos empiezan por donde se espera", () => {
    // Red de seguridad de la comprobación anterior: si la marca desapareciera,
    // `slice` devolvería el archivo entero en los dos y compararía basura.
    expect(FRONT).toContain(MARCA);
    expect(DENO).toContain(MARCA);
  });

  it("la copia trae su propio `enPalabras`, que en el front es un import", () => {
    // Deno no ve `@/lib/duracion`. Es la única diferencia admitida y va antes
    // de la marca, por eso la comparación empieza ahí.
    expect(DENO).toContain("export function enPalabras");
    expect(FRONT).toContain('import { enPalabras } from "@/lib/duracion";');
  });
});

describe("ningún canal se escribe sus propios textos", () => {
  it("el correo pregunta al módulo compartido", () => {
    expect(CORREO).toContain('from "../_shared/textoDeNotificacion.ts"');
    expect(CORREO).toContain("cuerpoDeNotificacion");
    expect(CORREO).toContain("rutaDeNotificacion");
  });

  it("el push también", () => {
    expect(PUSH).toContain('from "../_shared/textoDeNotificacion.ts"');
    expect(PUSH).toContain("cuerpoDeNotificacion");
    expect(PUSH).toContain("rutaDeNotificacion");
  });

  it("y ninguno se quedó con un `case \"listing_expiring\"` propio", () => {
    // Es la señal de que alguien volvió a abrir un `switch` paralelo.
    expect(CORREO).not.toContain('case "listing_expiring"');
    expect(PUSH).not.toContain('case "listing_expiring"');
  });

  it("el push ya no DEVUELVE «Tienes una nueva notificación»", () => {
    // Era su `default`, y le tocaba a diez de los quince tipos. Se busca el
    // `return` y no la frase suelta: el archivo la sigue nombrando en el
    // comentario que explica por qué se quitó.
    expect(PUSH).not.toMatch(/return\s+"Tienes una nueva notificación"/);
  });
});

describe("el texto del aviso por vencer", () => {
  const p = (extra: Record<string, unknown> = {}) => ({
    listing_title: "Depa en Miraflores",
    horas_transcurridas: 120,
    horas_restantes: 20,
    ...extra,
  });

  it("dice primero cuánto queda, después cuánto lleva y al final qué hacer", () => {
    // El orden importa: en la notificación de un móvil se leen las primeras
    // palabras y poco más.
    expect(cuerpoDeNotificacion("listing_expiring", p())).toBe(
      "«Depa en Miraflores» vence en 20 horas. Lleva 5 días publicado. Cuando venza, vuelve a publicarlo desde Mis avisos.",
    );
  });

  it("NO invita a actuar antes de que venza, y eso es deliberado", () => {
    // Desde que "Renovar" está oculto (2026-09-02), la única forma de volver a
    // anunciar es "Republicar", que crea un aviso NUEVO. Un texto que dijera
    // "renuévalo ahora" llevaría al anunciante a publicar el mismo aviso dos
    // veces a la vez y pagar dos planes.
    const t = cuerpoDeNotificacion("listing_expiring", p());
    expect(t).toContain("Cuando venza");
    expect(t).not.toMatch(/Renuévalo|Renuévalo ahora/i);
  });

  it("las horas se dicen en palabras, no en cifras sueltas", () => {
    expect(cuerpoDeNotificacion("listing_expiring", p({ horas_restantes: 1 })))
      .toContain("vence en 1 hora.");
    expect(cuerpoDeNotificacion("listing_expiring", p({ horas_restantes: 30 })))
      .toContain("vence en 1 día y 6 horas.");
  });

  it("un aviso anterior a la 0133 se lee con los días que sí trae", () => {
    const viejo = { listing_title: "Auto", dias: 3 };
    expect(cuerpoDeNotificacion("listing_expiring", viejo))
      .toBe("«Auto» vence en 3 días. Cuando venza, vuelve a publicarlo desde Mis avisos.");
  });

  it("cero horas restantes NO se confunde con «no hay dato»", () => {
    // `Number(null)` y `Number("")` valen CERO. Comprobar solo que sea finito
    // dejaba pasar la ausencia de dato, y la alerta le decía "vence en menos de
    // una hora" a un aviso recién publicado.
    expect(cuerpoDeNotificacion("listing_expiring", p({ horas_restantes: 0 })))
      .toContain("vence en menos de una hora.");
    expect(cuerpoDeNotificacion("listing_expiring", { listing_title: "X", horas_restantes: null, dias: 2 }))
      .toContain("vence en 2 días.");
  });
});

describe("los tipos que antes caían en el genérico", () => {
  // Estos seis existían en la campana y en ningún otro canal: por correo y por
  // push llegaban como "Tienes una notificación nueva".
  const CASOS: Array<[string, Record<string, unknown>, string]> = [
    ["complaint_new", { resumen: "Reclamo R-0012 de Ana Pérez" }, "R-0012"],
    ["moderation_warning", { reason: "Fotos repetidas" }, "Fotos repetidas"],
    ["invoice_voided", { number: "B001-45", credits: 30 }, "B001-45"],
    ["manual_payment_approved", { purpose: "publish", published: true }, "ya está publicado"],
    ["manual_payment_rejected", { motivo: "El voucher no coincide" }, "no coincide"],
    ["account_suspended", { reason: "Denuncias repetidas" }, "suspendida"],
  ];

  it.each(CASOS)("%s dice de qué va", (tipo, payload, esperado) => {
    const texto = cuerpoDeNotificacion(tipo, payload);
    expect(texto).toContain(esperado);
    expect(texto).not.toBe("Notificación");
  });

  it("un tipo desconocido no dice «Tienes una notificación» a secas", () => {
    // Ese texto no informa de nada y enseña al usuario a descartarlas sin leer.
    expect(cuerpoDeNotificacion("tipo_que_no_existe", { body: "Algo pasó" }))
      .toBe("Algo pasó");
  });
});

describe("el reclamo y la postulación llevan a la rama del panel de quien mira", () => {
  it("un admin va a /dashboard/admin", () => {
    expect(rutaDeNotificacion("complaint_new", {}, "admin")).toBe("/dashboard/admin/reclamaciones");
  });

  it("un superadmin a la suya", () => {
    expect(rutaDeNotificacion("career_new", {}, "superadmin")).toBe("/dashboard/superadmin/postulaciones");
  });

  it("y a quien no es del equipo no se le ofrece un destino que no puede abrir", () => {
    expect(rutaDeNotificacion("complaint_new", {}, "anunciante")).toBe("");
  });
});

describe("el correo y el push saben a QUIÉN le escriben", () => {
  /**
   * Los dos componían el enlace dando por hecho un usuario normal: el correo con
   * el rol clavado a "anunciante" y el push sin pedir los roles salvo para tres
   * tipos. A una cuenta del equipo eso le mandaba un enlace a un panel de
   * usuario, que `RequireRole` le niega — o sea, a "Acceso denegado".
   *
   * Se comprueba sobre el código porque son Deno y no se pueden ejecutar aquí.
   */
  it("el correo pide el rol del destinatario y no lo da por hecho", () => {
    expect(CORREO).toContain("user_roles");
    expect(CORREO).not.toContain('rutaDeNotificacion(type, p, "anunciante")');
  });

  it("y ya no manda al personal a /dashboard/admin a mano", () => {
    // Era un apaño de cuando no se sabía el rol: un superadmin acababa en la
    // rama de admin. Ahora `rutaDeNotificacion` resuelve la suya.
    expect(CORREO).not.toContain("`/dashboard/admin/${type === \"complaint_new\"");
  });

  it("el push pide los roles SIEMPRE, no solo para tres tipos", () => {
    // Con la lista de tipos, un `listing_expiring` a una cuenta del equipo se
    // resolvía como si fuera un usuario normal.
    expect(PUSH).not.toMatch(/\["new_message", "complaint_new", "career_new"\]\.includes/);
    expect(PUSH).toContain("user_roles");
  });


  it("y usan la MISMA prioridad de roles que la aplicación", () => {
    // Si divergieran, el enlace del correo llevaría a una rama del panel
    // distinta de la que abre la campana para la misma persona.
    const AUTH = leer("src/lib/auth.ts");
    const orden = '"superadmin", "admin", "moderador", "soporte", "anunciante", "buscador"';
    expect(AUTH).toContain(orden);
    expect(CORREO).toContain(orden);
    expect(PUSH).toContain(orden);
  });
  it("y los dos cuentan a moderador y soporte como personal", () => {
    // Faltaban en las listas de prioridad y caían en "buscador".
    for (const fuente of [CORREO, PUSH]) {
      expect(fuente).toContain('"moderador"');
      expect(fuente).toContain('"soporte"');
    }
  });
});
