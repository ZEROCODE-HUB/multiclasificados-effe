import { describe, it, expect } from "vitest";
import { urgentTimeLeft } from "@/lib/listings";

// Contador del adicional "Urgente": horas que le quedan al aviso. `short` va en
// la insignia de la tarjeta (enfocado en horas); `long` en el detalle.

const NOW = new Date("2026-07-14T12:00:00Z").getTime();
const inHours = (h: number) => new Date(NOW + h * 3600_000).toISOString();
const inMinutes = (m: number) => new Date(NOW + m * 60_000).toISOString();

describe("urgentTimeLeft", () => {
  it("sin fecha de vencimiento devuelve null", () => {
    expect(urgentTimeLeft(null, NOW)).toBeNull();
  });

  it("cuenta las horas restantes (insignia enfocada en horas)", () => {
    expect(urgentTimeLeft(inHours(47), NOW)?.short).toBe("47h");
    expect(urgentTimeLeft(inHours(5), NOW)?.short).toBe("5h");
  });

  it("en la última hora muestra minutos", () => {
    expect(urgentTimeLeft(inMinutes(45), NOW)?.short).toBe("45m");
  });

  it("el detalle desglosa días, horas y minutos", () => {
    // 2 días, 3 horas y 30 minutos.
    const exp = new Date(NOW + (2 * 24 + 3) * 3600_000 + 30 * 60_000).toISOString();
    expect(urgentTimeLeft(exp, NOW)?.long).toBe("2d 3h 30m");
  });

  it("ya vencido: expired=true y 0h", () => {
    const r = urgentTimeLeft(inHours(-1), NOW);
    expect(r?.expired).toBe(true);
    expect(r?.short).toBe("0h");
  });

  it("fecha inválida devuelve null", () => {
    expect(urgentTimeLeft("no-es-fecha", NOW)).toBeNull();
  });
});
