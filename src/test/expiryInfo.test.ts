import { describe, it, expect } from "vitest";
import { expiryInfo } from "@/lib/listings";

// Contador de "Mis avisos": cuántos días (u horas/minutos) le quedan a un aviso
// antes de caducar, y con qué color avisarlo.
const NOW = new Date("2026-07-10T12:00:00Z").getTime();
const enHoras = (h: number) => new Date(NOW + h * 3600_000).toISOString();
const enDias = (d: number) => enHoras(d * 24);

describe("expiryInfo — contador de vencimiento", () => {
  it("muestra los días restantes cuando falta más de un día", () => {
    expect(expiryInfo(enDias(90), NOW)).toEqual({ text: "Vence en 90 días", tone: "normal" });
    expect(expiryInfo(enDias(7), NOW)).toEqual({ text: "Vence en 7 días", tone: "normal" });
  });

  it("marca 'atención' cuando quedan entre 1 y 6 días", () => {
    expect(expiryInfo(enDias(6), NOW)).toEqual({ text: "Vence en 6 días", tone: "warning" });
    expect(expiryInfo(enDias(1), NOW)).toEqual({ text: "Vence en 1 día", tone: "warning" });
  });

  it("marca 'urgente' y cambia a horas/minutos en el último día", () => {
    expect(expiryInfo(enHoras(5), NOW)).toEqual({ text: "Vence en 5 horas", tone: "urgent" });
    expect(expiryInfo(enHoras(1), NOW)).toEqual({ text: "Vence en 1 hora", tone: "urgent" });
    expect(expiryInfo(new Date(NOW + 30 * 60_000).toISOString(), NOW))
      .toEqual({ text: "Vence en 30 minutos", tone: "urgent" });
    expect(expiryInfo(new Date(NOW + 60_000).toISOString(), NOW))
      .toEqual({ text: "Vence en 1 minuto", tone: "urgent" });
  });

  it("un aviso ya vencido dice 'Vencido'", () => {
    expect(expiryInfo(enHoras(-1), NOW)).toEqual({ text: "Vencido", tone: "urgent" });
  });

  it("sin fecha o con fecha inválida no muestra nada", () => {
    expect(expiryInfo(null, NOW)).toBeNull();
    expect(expiryInfo("no-es-fecha", NOW)).toBeNull();
  });
});
