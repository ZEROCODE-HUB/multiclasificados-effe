import { describe, it, expect } from "vitest";
import { CORREO_SOPORTE, enlaceDevolucionSaldo } from "@/lib/soporte";

describe("solicitud de devolución de saldo", () => {
  it("escribe al buzón que existe de verdad", () => {
    // `soporte@coleffe.com` no está creado en cPanel: un botón que escribe ahí
    // manda al usuario al vacío.
    expect(CORREO_SOPORTE).toBe("avisos@coleffe.com");
    expect(enlaceDevolucionSaldo()).toMatch(/^mailto:avisos@coleffe\.com\?/);
  });

  it("lleva el asunto y los datos que soporte necesita para no tener que preguntar", () => {
    const url = enlaceDevolucionSaldo({ nombre: "Ana Pérez", correo: "ana@correo.com", saldo: 1234.5 });
    const q = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    expect(q.get("subject")).toBe("Solicitud de devolución de saldo");
    const cuerpo = q.get("body") ?? "";
    expect(cuerpo).toContain("Ana Pérez");
    expect(cuerpo).toContain("ana@correo.com");
    expect(cuerpo).toContain("S/ 1234.50");
    expect(cuerpo).toContain("Motivo:");
    expect(cuerpo).toContain("CCI");
  });

  it("sin datos no rompe: deja huecos que la persona completa", () => {
    const q = new URLSearchParams(enlaceDevolucionSaldo().split("?")[1]);
    const cuerpo = q.get("body") ?? "";
    expect(cuerpo).toContain("(completar)");
    expect(cuerpo).toContain("S/ 0.00");
  });

  it("escapa tildes y saltos de línea", () => {
    const url = enlaceDevolucionSaldo({ nombre: "José Ñañez" });
    expect(url).not.toContain(" ");
    expect(url).not.toContain("\n");
    expect(decodeURIComponent(url)).toContain("José Ñañez");
  });
});
