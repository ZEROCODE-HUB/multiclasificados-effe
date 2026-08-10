import { describe, it, expect, vi, beforeEach } from "vitest";

// Captura los argumentos con que searchListings llama al RPC search_listings.
//
// La ubicación se filtra por DEPARTAMENTO: exacto y predecible. Sustituyó a la
// búsqueda por cercanía (centro + radio en kilómetros), que obligaba al usuario
// a adivinar una cifra y escondía avisos por estar un poco más lejos.

const state: { rpcArgs: Record<string, unknown> | null } = { rpcArgs: null };

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: async (_fn: string, args: Record<string, unknown>) => {
      state.rpcArgs = args;
      return { data: [], error: null };
    },
  },
}));

import { searchListings } from "@/lib/listings";

beforeEach(() => { state.rpcArgs = null; });

describe("searchListings — filtro por departamento", () => {
  it("sin departamento busca en todo el país", async () => {
    await searchListings({ q: "casa", sort: "price_asc" });
    expect(state.rpcArgs).toMatchObject({ p_department: null, p_sort: "price_asc" });
  });

  it("con departamento lo manda tal cual al servidor", async () => {
    await searchListings({ department: "15" });
    expect(state.rpcArgs).toMatchObject({ p_department: "15" });
  });

  it("una cadena vacía cuenta como 'todo el país', no como filtro", async () => {
    await searchListings({ department: "" });
    expect(state.rpcArgs).toMatchObject({ p_department: null });
  });

  it("nunca se manda un radio: la distancia no puede esconder avisos", async () => {
    await searchListings({ department: "04", q: "camioneta", lat: -16.4, lng: -71.5 });
    expect(state.rpcArgs).not.toHaveProperty("p_radius_km");
  });

  it("convive con el resto de filtros sin pisarlos", async () => {
    await searchListings({
      q: "casa", category: "inmuebles", priceMin: 100, priceMax: 900,
      currency: "PEN", department: "13", sort: "views",
    });
    expect(state.rpcArgs).toMatchObject({
      p_query: "casa", p_category: "inmuebles",
      p_price_min: 100, p_price_max: 900,
      p_currency: "PEN", p_department: "13", p_sort: "views",
    });
  });
});

describe("searchListings — ordenar por cercanía (opción del usuario)", () => {
  it("sin ubicación no manda punto alguno", async () => {
    await searchListings({ department: "15" });
    expect(state.rpcArgs).toMatchObject({ p_lat: null, p_lng: null });
  });

  it("con ubicación concedida la manda para ORDENAR, sin dejar de filtrar por departamento", async () => {
    await searchListings({ department: "15", lat: -12.05, lng: -77.04, sort: "distance" });
    expect(state.rpcArgs).toMatchObject({
      p_department: "15", p_lat: -12.05, p_lng: -77.04, p_sort: "distance",
    });
  });

  it("la ubicación NO sustituye al filtro: sin departamento se sigue viendo todo el país", async () => {
    // Es la diferencia con el diseño anterior: la distancia solo reordena.
    await searchListings({ lat: -12.05, lng: -77.04, sort: "distance" });
    expect(state.rpcArgs).toMatchObject({ p_department: null, p_sort: "distance" });
  });
});
