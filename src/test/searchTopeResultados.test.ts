import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cuántos avisos pide el buscador de una vez.
 *
 * El buscador pagina en el navegador sobre la lista que recibe, así que el tope
 * que se manda al servidor NO es "cuántos se ven por página": es cuántos existen
 * para el usuario. Estaba clavado en 48, y con 89 avisos publicados el buscador
 * decía "48 avisos disponibles" y a los otros 41 no se llegaba ni paginando ni
 * de ninguna otra forma.
 */

// `vi.hoisted` porque `vi.mock` se sube al principio del fichero y si no el
// espía todavía no existiría cuando se construye el módulo simulado.
const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(async (_nombre: string, _args: Record<string, number>) => ({ data: [], error: null })),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

import { searchListings, TOPE_RESULTADOS, topeAlcanzado } from "@/lib/listings";

const ultimoLimite = () => rpc.mock.calls.at(-1)![1].p_limit;

beforeEach(() => rpc.mockClear());

describe("el tope de resultados del buscador", () => {
  it("por defecto pide muchos más de los que caben en una página", async () => {
    await searchListings({});
    expect(ultimoLimite()).toBe(TOPE_RESULTADOS);
  });

  it("con 89 avisos publicados los alcanza todos", async () => {
    // El número real de la plataforma el día que se detectó el fallo.
    await searchListings({ department: "15" });
    expect(ultimoLimite()).toBeGreaterThanOrEqual(89);
  });

  it("quien llama puede pedir menos (la portada solo necesita una fila)", async () => {
    await searchListings({ limit: 24 });
    expect(ultimoLimite()).toBe(24);
  });

  it("pero nadie puede saltarse el tope", async () => {
    await searchListings({ limit: 100_000 });
    expect(ultimoLimite()).toBe(TOPE_RESULTADOS);
  });
});

describe("avisar cuando la lista viene recortada", () => {
  it("no avisa mientras quepan todos", () => {
    expect(topeAlcanzado(0)).toBe(false);
    expect(topeAlcanzado(89)).toBe(false);
    expect(topeAlcanzado(TOPE_RESULTADOS - 1)).toBe(false);
  });

  it("avisa al tocar el tope, para no dar un total que sería mentira", () => {
    expect(topeAlcanzado(TOPE_RESULTADOS)).toBe(true);
  });
});
