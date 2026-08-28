import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { enPalabras, tiempoDelAviso } from "@/lib/duracion";
import { notificationText } from "@/lib/notifications";

/**
 * "En las alertas y correos colocamos el tiempo transcurrido y lo que le queda."
 *
 * Es la segunda mitad de lo que pidió el cliente. La primera —no avisar antes
 * del 85 %— vive en la migración 0133; esta es la frase que ve el anunciante.
 *
 * En HORAS y no en días a propósito: a un aviso de 3 días le quedan "0 días"
 * durante sus últimas veintitrés horas, que es justo cuando el dato importa.
 */

describe("las horas, en palabras", () => {
  it("por debajo de un día, en horas", () => {
    expect(enPalabras(1)).toBe("1 hora");
    expect(enPalabras(10)).toBe("10 horas");
    expect(enPalabras(23)).toBe("23 horas");
  });

  it("a partir de un día, en días y horas", () => {
    expect(enPalabras(24)).toBe("1 día");
    expect(enPalabras(25)).toBe("1 día y 1 hora");
    expect(enPalabras(62)).toBe("2 días y 14 horas");
    expect(enPalabras(72)).toBe("3 días");
  });

  it("el último tramo no se redondea a cero", () => {
    // "0 horas" sonaría a que ya venció; y vencido tiene su propio texto.
    expect(enPalabras(0)).toBe("menos de una hora");
  });
});

describe("la frase completa", () => {
  it("dice cuánto lleva y cuánto le queda", () => {
    expect(tiempoDelAviso(62, 10)).toBe("Lleva 2 días y 14 horas publicado y le quedan 10 horas.");
  });

  it("concuerda en singular", () => {
    expect(tiempoDelAviso(71, 1)).toBe("Lleva 2 días y 23 horas publicado y le queda 1 hora.");
  });

  it("sin las cifras no escribe una frase a medias", () => {
    // Los avisos guardados antes de la 0133 no las traen: quien la use se queda
    // con su texto de siempre en vez de soltar un "Lleva undefined publicado".
    expect(tiempoDelAviso(undefined, undefined)).toBe("");
    expect(tiempoDelAviso(62, null)).toBe("");
    expect(tiempoDelAviso("no", "va")).toBe("");
  });
});

describe("la notificación que le llega al anunciante", () => {
  const aviso = (payload: Record<string, unknown>) =>
    notificationText({ type: "listing_expiring", payload } as never);

  it("lleva las dos cifras", () => {
    const t = aviso({ listing_title: "Postres en Huanchaco", horas_transcurridas: 62, horas_restantes: 10 });
    expect(t).toContain("Postres en Huanchaco");
    expect(t).toContain("Lleva 2 días y 14 horas publicado");
    expect(t).toContain("le quedan 10 horas");
  });

  it("un aviso viejo, con solo `dias`, se sigue leyendo", () => {
    const t = aviso({ listing_title: "Casa", dias: 3 });
    expect(t).toContain("vence en 3 días");
  });

  it("y sin nada de eso, tampoco se rompe", () => {
    expect(aviso({ listing_title: "Casa" })).toContain("está por vencer");
  });
});

/**
 * EL CORREO USA UNA COPIA, NO UN IMPORT.
 *
 * `send-email` corre en Deno dentro de Supabase y no ve el código del front, así
 * que la función está escrita dos veces. Es la clase de duplicado que se separa
 * en silencio: alguien afina el texto en un lado y el correo se queda con el
 * viejo durante meses sin que nadie lo note.
 */
describe("el correo dice lo mismo que la notificación", () => {
  const edge = fs.readFileSync(
    path.resolve(__dirname, "../../supabase/functions/send-email/index.ts"), "utf8");
  const front = fs.readFileSync(
    path.resolve(__dirname, "../lib/duracion.ts"), "utf8");

  const cuerpoDe = (fuente: string, nombre: string) => {
    const desde = fuente.indexOf(`function ${nombre}(`);
    expect(desde).toBeGreaterThan(-1);
    const abre = fuente.indexOf("{", desde);
    let nivel = 0;
    for (let i = abre; i < fuente.length; i++) {
      if (fuente[i] === "{") nivel++;
      else if (fuente[i] === "}" && --nivel === 0) {
        return fuente.slice(abre + 1, i).replace(/\s+/g, " ").trim();
      }
    }
    throw new Error(`no se encontró el cuerpo de ${nombre}`);
  };

  it("`enPalabras` es la misma función en los dos sitios", () => {
    // El front acepta null/undefined y el correo ya recibe un número, así que
    // solo se comparan las líneas que deciden el TEXTO.
    const soloElTexto = (cuerpo: string) =>
      cuerpo.slice(cuerpo.indexOf("if (h < 1)"));
    expect(soloElTexto(cuerpoDe(edge, "enPalabras")))
      .toBe(soloElTexto(cuerpoDe(front, "enPalabras")));
  });

  it("y `tiempoDelAviso`, también", () => {
    expect(cuerpoDe(edge, "tiempoDelAviso")).toBe(cuerpoDe(front, "tiempoDelAviso"));
  });
});
