import { describe, it, expect } from "vitest";
import { expiryInfo } from "@/lib/listings";

// Contador de "Mis avisos": cuántos días (u horas/minutos) le quedan a un aviso
// antes de caducar, y con qué color avisarlo.
const NOW = new Date("2026-07-10T12:00:00Z").getTime();
const enHoras = (h: number) => new Date(NOW + h * 3600_000).toISOString();
const enDias = (d: number) => enHoras(d * 24);

describe("expiryInfo — el texto de lo que queda", () => {
  it("muestra los días restantes cuando falta más de un día", () => {
    expect(expiryInfo(enDias(90), 90, NOW)?.text).toBe("Vence en 90 días");
    expect(expiryInfo(enDias(7), 30, NOW)?.text).toBe("Vence en 7 días");
  });

  it("cambia a horas y a minutos en el último tramo", () => {
    expect(expiryInfo(enHoras(5), 3, NOW)?.text).toBe("Vence en 5 horas");
    expect(expiryInfo(enHoras(1), 3, NOW)?.text).toBe("Vence en 1 hora");
    expect(expiryInfo(new Date(NOW + 30 * 60_000).toISOString(), 3, NOW)?.text)
      .toBe("Vence en 30 minutos");
    expect(expiryInfo(new Date(NOW + 60_000).toISOString(), 3, NOW)?.text)
      .toBe("Vence en 1 minuto");
  });

  it("un aviso ya vencido dice 'Vencido'", () => {
    expect(expiryInfo(enHoras(-1), 3, NOW)).toEqual({ text: "Vencido", tone: "urgent" });
  });

  it("sin fecha o con fecha inválida no muestra nada", () => {
    expect(expiryInfo(null, 3, NOW)).toBeNull();
    expect(expiryInfo("no-es-fecha", 3, NOW)).toBeNull();
  });
});

/**
 * EL COLOR SE MIDE CONTRA EL TIEMPO CONTRATADO, NO CONTRA UN NÚMERO DE DÍAS.
 *
 * Lo reportó el cliente: publicó un aviso de un plan de 3 días y "a los 20
 * segundos de colocarlo emitió una alerta que ya está por vencer". No falló
 * nada: el umbral era absoluto —menos de 7 días, avisa— así que un plan de 3
 * días NACÍA en advertencia, en naranja y con el botón de renovar al lado.
 *
 * Su propuesta —avisar al 85 % del tiempo contratado— vale para cualquier plan.
 */
describe("el aviso salta al 85 % del plan, no antes", () => {
  const tono = (dias: number, restanHoras: number) =>
    expiryInfo(enHoras(restanHoras), dias, NOW)?.tone;

  it("un plan de 3 días recién publicado NO avisa (era el fallo)", () => {
    // 72 h contratadas, 72 h por delante: no se ha consumido nada.
    expect(tono(3, 72)).toBe("normal");
    // Y sigue callado a mitad del plan.
    expect(tono(3, 36)).toBe("normal");
  });

  it("y avisa cuando le quedan unas 11 horas, que es su 85 %", () => {
    expect(tono(3, 12)).toBe("normal");   // 83 % consumido: todavía no
    expect(tono(3, 10)).toBe("warning");  // 86 %: ya sí
  });

  it("un plan de 30 días avisa a los 25 días y medio, no a los 7", () => {
    // Con el criterio viejo este aviso llevaba tres semanas en verde y saltaba
    // a naranja el día 23; ahora es una proporción del plan.
    expect(tono(30, 24 * 6)).toBe("normal");   // quedan 6 días → 80 %
    expect(tono(30, 24 * 4)).toBe("warning");  // quedan 4 días → 86 %
  });

  it("el último 5 % se pinta en rojo", () => {
    expect(tono(30, 24 * 2)).toBe("warning");  // quedan 2 de 30 → 93 %: aún no
    expect(tono(30, 24)).toBe("urgent");       // queda 1 día de 30 → 96 %
    expect(tono(3, 2)).toBe("urgent");         // quedan 2 h de 72 → 97 %
  });

  it("un plan corto NO se pinta de rojo solo por estar en su último día", () => {
    // Es la otra mitad del malentendido. A un aviso de 3 días le queda menos de
    // un día durante su último tercio, y con el criterio viejo eso bastaba para
    // pintarlo de rojo aunque le quedara todavía un 30 % del plan.
    expect(tono(3, 20)).toBe("normal");
  });
});

describe("sin saber lo que se contrató, se mantiene el criterio de siempre", () => {
  // Los avisos anteriores a la 0041 no guardan `plan_duration_days`. Callarse
  // sería peor que avisar de más: un vencimiento real pasaría desapercibido.
  it("menos de 7 días avisa; menos de 1 día urge", () => {
    expect(expiryInfo(enDias(7), null, NOW)?.tone).toBe("normal");
    expect(expiryInfo(enDias(6), null, NOW)?.tone).toBe("warning");
    expect(expiryInfo(enHoras(5), undefined, NOW)?.tone).toBe("urgent");
  });

  it("una duración absurda tampoco cuela", () => {
    expect(expiryInfo(enDias(6), 0, NOW)?.tone).toBe("warning");
    expect(expiryInfo(enDias(6), Number.NaN, NOW)?.tone).toBe("warning");
  });
});
