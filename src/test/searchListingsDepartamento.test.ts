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

  it("ya no se manda nada de la búsqueda por distancia", async () => {
    // Si estos parámetros reaparecieran, el servidor los ignoraría en silencio
    // y el filtro dejaría de funcionar sin que nadie se entere.
    await searchListings({ department: "04", q: "camioneta" });
    expect(state.rpcArgs).not.toHaveProperty("p_lat");
    expect(state.rpcArgs).not.toHaveProperty("p_lng");
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
