import { describe, it, expect } from "vitest";
import { pageSizeParaColumnas } from "@/lib/paginacion";

/**
 * Que ninguna página del buscador acabe con una fila rota.
 *
 * El tamaño de página estaba clavado en 20 y las columnas cambian con el ancho
 * (1, 2, 3, 5 o 6 según la pantalla). En un monitor ancho eso daba 3 filas de 6
 * y 2 avisos sueltos: cuatro huecos al final de la página, que es justo lo que
 * se ve como "espacio en blanco" y parece un fallo de maquetación.
 */

const COLUMNAS_DEL_BUSCADOR = [1, 2, 3, 5, 6];

describe("tamaño de página según las columnas", () => {
  it.each(COLUMNAS_DEL_BUSCADOR)("con %i columnas, la página cuadra exacta", (cols) => {
    expect(pageSizeParaColumnas(20, cols) % cols).toBe(0);
    expect(pageSizeParaColumnas(10, cols) % cols).toBe(0);
  });

  it("el caso de la captura: 6 columnas dan 3 filas llenas, no 3 y media", () => {
    expect(pageSizeParaColumnas(20, 6)).toBe(18);
  });

  it("se queda cerca del objetivo, no se dispara", () => {
    for (const cols of COLUMNAS_DEL_BUSCADOR) {
      const n = pageSizeParaColumnas(20, cols);
      expect(n).toBeGreaterThanOrEqual(20 - cols);
      expect(n).toBeLessThanOrEqual(20 + cols);
    }
  });

  it("cuando el objetivo ya es múltiplo, no lo cambia", () => {
    expect(pageSizeParaColumnas(20, 5)).toBe(20);
    expect(pageSizeParaColumnas(20, 2)).toBe(20);
    expect(pageSizeParaColumnas(20, 1)).toBe(20);
    expect(pageSizeParaColumnas(10, 1)).toBe(10);
    expect(pageSizeParaColumnas(10, 2)).toBe(10);
  });

  it("nunca deja una página vacía, ni con más columnas que avisos", () => {
    // Una rejilla de 12 columnas con objetivo 10 tiene que dar una fila entera,
    // no cero avisos: con 0 la paginación no avanzaría nunca.
    expect(pageSizeParaColumnas(10, 12)).toBe(12);
    expect(pageSizeParaColumnas(1, 6)).toBe(6);
  });

  it("aguanta un número de columnas absurdo sin romperse", () => {
    expect(pageSizeParaColumnas(20, 0)).toBe(20);
    expect(pageSizeParaColumnas(20, -3)).toBe(20);
    expect(pageSizeParaColumnas(20, 2.7)).toBe(20); // 2 columnas
  });
});
