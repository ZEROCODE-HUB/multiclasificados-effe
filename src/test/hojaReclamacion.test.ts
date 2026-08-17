// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  AVISO_LEGAL,
  PROVEEDOR,
  correoAcuseAlConsumidor,
  correoAvisoInterno,
  fechaHoraLima,
  nombreDelArchivo,
  renderHojaReclamacionPDF,
  tablaDeLaHoja,
  type DatosHoja,
} from "../../supabase/functions/_shared/hoja-reclamacion.ts";
import { envolver, toBase64 } from "../../supabase/functions/_shared/pdf-basico.ts";

// El acuse de recibo del Libro de Reclamaciones. Lo que se prueba aquí es lo
// que la norma exige y antes no ocurría: que al consumidor le llegue una copia
// de su hoja con la fecha y hora del registro. Se importa el módulo REAL de la
// Edge Function para que no puedan divergir.

const hoja: DatosHoja = {
  code: 42,
  kind: "reclamo",
  fullName: "MARÍA ÑAÑEZ DE LA CRUZ",
  docType: "DNI",
  docNumber: "44443333",
  email: "maria@ejemplo.com",
  phone: "957531755",
  address: "Av. Larco 123, Trujillo",
  goodType: "servicio",
  amount: "S/ 50.00",
  description: "Pagué un aviso destacado y no apareció en la portada.",
  request: "Que se publique el aviso o me devuelvan el importe.",
  createdAt: new Date("2026-08-17T15:37:58Z"), // 10:37:58 en Lima
};

const texto = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

describe("fecha y hora del registro", () => {
  it("se expresa en hora de Perú, no en la del servidor", () => {
    // 15:37 UTC son las 10:37 en Lima. Si esto se rompiera, la constancia
    // legal diría una hora que no es.
    expect(fechaHoraLima(hoja.createdAt)).toContain("10:37:58");
    expect(fechaHoraLima(hoja.createdAt)).toContain("17/08/2026");
  });
});

describe("PDF de la Hoja de Reclamación", () => {
  const pdf = renderHojaReclamacionPDF(hoja);
  const s = texto(pdf);

  it("es un PDF bien formado", () => {
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(s).toContain("/Type /Catalog");
    expect(s).toContain("xref");
  });

  it("lleva el número de hoja y la hora del registro", () => {
    expect(s).toContain("42");
    expect(s).toContain("17/08/2026 10:37:58");
  });

  it("identifica al proveedor con su RUC", () => {
    expect(s).toContain(PROVEEDOR.razonSocial);
    expect(s).toContain(PROVEEDOR.ruc);
  });

  it("incluye lo que el consumidor escribió", () => {
    expect(s).toContain("Pagué un aviso destacado"); // la é va como byte WinAnsi crudo
    expect(s).toContain("devuelvan el importe");
  });

  it("advierte que reclamar no cierra la puerta a INDECOPI", () => {
    // El aviso va troceado en líneas dentro del PDF; se comprueba por su parte
    // más característica.
    expect(s).toContain("INDECOPI");
    expect(AVISO_LEGAL).toContain("ni es requisito previo");
  });

  it("los desplazamientos del xref apuntan a los objetos de verdad", () => {
    // Un xref corrido deja el archivo ilegible en algunos visores aunque otros
    // lo reparen solos, así que se comprueba byte a byte.
    const inicio = s.indexOf("xref\n");
    // Se salta la cabecera ("xref", "0 N") y la entrada 0, que siempre es libre.
    const lineas = s.slice(inicio).split("\n").slice(3);
    for (let i = 0; i < 3; i++) {
      const off = Number(lineas[i].slice(0, 10));
      expect(s.slice(off, off + 8)).toMatch(new RegExp(`^${i + 1} 0 obj`));
    }
  });

  it("un relato larguísimo se reparte en varias páginas en vez de salirse del papel", () => {
    const largo = renderHojaReclamacionPDF({
      ...hoja,
      description: "Detalle del problema. ".repeat(300),
      request: "Solicito la devolución completa. ".repeat(100),
    });
    const t = texto(largo);
    const paginas = Number(t.match(/\/Count (\d+)/)?.[1] ?? 0);
    expect(paginas).toBeGreaterThan(1);
    expect(t).toContain("continuación");
    // Y sigue siendo un PDF válido, con tantas páginas como dice el /Count.
    expect(t.match(/\/Type \/Page[^s]/g)?.length).toBe(paginas);
  });

  it("pesa poco: viaja adjunto en un correo", () => {
    expect(toBase64(pdf).length).toBeLessThan(200_000);
  });
});

describe("correo al consumidor (el acuse obligatorio)", () => {
  const pdf = toBase64(renderHojaReclamacionPDF(hoja));
  const correo = correoAcuseAlConsumidor(hoja, {
    from: "Libro de Reclamaciones <reclamos@coleffe.com>",
    replyTo: "avisos@coleffe.com",
    adjuntoBase64: pdf,
  });

  it("va al correo que dejó el consumidor, y solo a él", () => {
    expect(correo.to).toEqual(["maria@ejemplo.com"]);
  });

  it("responde a un buzón que existe, no al remitente", () => {
    // `reclamos@coleffe.com` firma el correo pero no es un buzón real: si el
    // consumidor contesta, tiene que llegarle a alguien.
    expect(correo.reply_to).toBe("avisos@coleffe.com");
  });

  it("adjunta la copia de la hoja en PDF", () => {
    expect(correo.attachments?.[0].filename).toBe("Hoja-de-Reclamacion-42.pdf");
    expect(correo.attachments?.[0].content).toBe(pdf);
  });

  it("deja constancia de la fecha y hora en el propio cuerpo", () => {
    expect(correo.html).toContain("17/08/2026 10:37:58");
    expect(correo.html).toContain("hora de Perú");
  });

  it("el asunto identifica la hoja", () => {
    expect(correo.subject).toContain("42");
    expect(correo.subject.toLowerCase()).toContain("hoja de reclamación");
  });

  it("repite la hoja completa dentro del correo, no solo en el adjunto", () => {
    for (const trozo of ["MARÍA", "44443333", "Pagué un aviso destacado", "devuelvan el importe"]) {
      expect(correo.html).toContain(trozo);
    }
  });

  it("sin adjunto sigue siendo un correo enviable con la hoja dentro", () => {
    const sinPdf = correoAcuseAlConsumidor(hoja, {
      from: "x@y.com",
      replyTo: "avisos@coleffe.com",
    });
    expect(sinPdf.attachments).toBeUndefined();
    expect(sinPdf.html).toContain("Pagué un aviso destacado");
  });
});

describe("correo interno", () => {
  const correo = correoAvisoInterno(hoja, {
    from: "Libro de Reclamaciones <reclamos@coleffe.com>",
    to: ["avisos@coleffe.com"],
  });

  it("va al buzón de la empresa y contesta al consumidor", () => {
    expect(correo.to).toEqual(["avisos@coleffe.com"]);
    expect(correo.reply_to).toBe("maria@ejemplo.com");
  });

  it("dice cuándo se registró, que es de cuando corre el plazo", () => {
    expect(correo.html).toContain("17/08/2026 10:37:58");
    expect(correo.html).toContain("15 días hábiles");
  });
});

describe("la hoja en HTML", () => {
  it("escapa lo que escriba el consumidor", () => {
    const html = tablaDeLaHoja({ ...hoja, description: "<script>alert(1)</script>" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("no deja campos opcionales en blanco", () => {
    const html = tablaDeLaHoja({ ...hoja, phone: null, address: "", amount: null });
    expect(html.match(/—/g)?.length).toBe(3);
  });
});

describe("envolver texto", () => {
  it("respeta los saltos de línea que escribió la persona", () => {
    expect(envolver("uno\ndos", 400, 10)).toEqual(["uno", "dos"]);
  });

  it("trocea una palabra más larga que la línea en vez de desbordarla", () => {
    const lineas = envolver("a".repeat(300), 100, 10);
    expect(lineas.length).toBeGreaterThan(1);
    expect(lineas.every((l) => l.length <= 20)).toBe(true);
  });
});

describe("nombre del archivo adjunto", () => {
  it("no lleva acentos ni espacios: viaja por correo", () => {
    expect(nombreDelArchivo(7)).toBe("Hoja-de-Reclamacion-7.pdf");
  });
});
