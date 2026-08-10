// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  renderComprobantePDF,
  toBase64,
  type DatosComprobante,
} from "../../supabase/functions/_shared/comprobante-pdf.ts";

// El PDF que se adjunta al correo del comprador. Se importa el módulo REAL de
// la Edge Function (mismo patrón que izipayHmac.test.ts) para que no puedan
// divergir.

const base: DatosComprobante = {
  numero: "B001-000123",
  tipo: "boleta",
  fecha: new Date("2026-08-10T15:30:00Z"),
  clienteNombre: "JUAN PÉREZ ÑOPO",
  clienteDocTipo: "dni",
  clienteDocNumero: "44443333",
  detalle: "Compra de saldo: 2 avisos · 7 días",
  subtotal: 100,
  igv: 18,
  total: 118,
  moneda: "PEN",
  emisorNombre: "eFFe Multiclasificados",
  emisorRuc: "20123456789",
};

const texto = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

describe("PDF del comprobante", () => {
  it("genera un PDF válido y bien cerrado", () => {
    const pdf = renderComprobantePDF(base);
    const s = texto(pdf);
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    // La tabla de referencias cruzadas es lo que hace que un lector lo abra.
    expect(s).toContain("xref");
    expect(s).toContain("startxref");
    expect(pdf.byteLength).toBeGreaterThan(800);
  });

  it("lleva el número, el cliente y los importes", () => {
    const s = texto(renderComprobantePDF(base));
    expect(s).toContain("B001-000123");
    expect(s).toContain("44443333");
    expect(s).toContain("118.00");
    expect(s).toContain("18.00");
  });

  it("distingue boleta de factura en el título", () => {
    expect(texto(renderComprobantePDF(base))).toContain("BOLETA DE VENTA");
    expect(texto(renderComprobantePDF({ ...base, tipo: "factura" }))).toContain("FACTURA");
  });

  it("dice claramente si NO es un documento tributario", () => {
    // Mientras la emisión no esté activa, el comprobante es interno y el PDF
    // tiene que decirlo: no puede parecer una boleta declarada.
    const s = texto(renderComprobantePDF(base));
    expect(s).toContain("No constituye documento tributario");
  });

  it("cuando está declarado ante SUNAT, lo dice y muestra su código", () => {
    const s = texto(renderComprobantePDF({ ...base, sunat: { aceptado: true, hash: "AeOqQVd8" } }));
    expect(s).toContain("declarado ante SUNAT");
    expect(s).toContain("AeOqQVd8");
    expect(s).not.toContain("No constituye documento tributario");
  });

  it("las tildes y la eñe no rompen el archivo", () => {
    // El PDF va en WinAnsi: un carácter fuera de rango corrompería el literal.
    const s = texto(renderComprobantePDF({ ...base, clienteNombre: "MUÑOZ ÁVILA S.A.C." }));
    // 0xd1 = Ñ y 0xc1 = Á en WinAnsi, que es como deben quedar en el archivo.
    expect(s).toContain("MU\xd1OZ \xc1VILA");
  });

  it("los paréntesis del nombre no rompen el archivo", () => {
    // Un '(' sin escapar cierra el literal de texto y corrompe el PDF.
    const pdf = renderComprobantePDF({ ...base, clienteNombre: "EMPRESA (PERÚ) S.A." });
    const s = texto(pdf);
    expect(s).toContain("EMPRESA \\(PER\xda\\) S.A.");
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("aguanta un comprobante sin datos de cliente", () => {
    const pdf = renderComprobantePDF({
      ...base, clienteNombre: "", clienteDocTipo: null, clienteDocNumero: null, emisorRuc: null,
    });
    expect(texto(pdf).trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("la fecha sale en hora de Perú, no en la del servidor", () => {
    // 15:30 UTC son las 10:30 en Lima. Si saliera la hora del servidor, el
    // comprobante mostraría una fecha que no es la de la operación.
    expect(texto(renderComprobantePDF(base))).toContain("10:30");
  });
});

describe("base64 del adjunto", () => {
  it("codifica correctamente", () => {
    expect(toBase64(new Uint8Array([104, 111, 108, 97]))).toBe("aG9sYQ==");
  });

  it("aguanta un PDF grande sin desbordar la pila", () => {
    // Pasar cientos de miles de bytes de golpe a String.fromCharCode revienta:
    // hay un tope de argumentos por llamada. Por eso se codifica por trozos.
    const grande = new Uint8Array(300_000).fill(65);
    const b64 = toBase64(grande);
    expect(b64.length).toBeGreaterThan(390_000);
    expect(b64.startsWith("QUFB")).toBe(true);
  });
});
