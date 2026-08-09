import { describe, it, expect, vi, beforeEach } from "vitest";

// Captura los argumentos con que searchListings llama al RPC search_listings.
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

describe("searchListings — búsqueda por cercanía (EFFE-033)", () => {
  it("sin centro: no envía lat/lng/radio y respeta el orden elegido", async () => {
    await searchListings({ q: "casa", sort: "price_asc" });
    expect(state.rpcArgs).toMatchObject({
      p_lat: null, p_lng: null, p_radius_km: null, p_sort: "price_asc",
    });
  });

  it("con centro + radio: envía p_lat/p_lng/p_radius_km y ordena por distancia", async () => {
    await searchListings({ lat: -12.05, lng: -77.04, radiusKm: 10, sort: "recent" });
    expect(state.rpcArgs).toMatchObject({
      p_lat: -12.05, p_lng: -77.04, p_radius_km: 10, p_sort: "distance",
    });
  });

  it("con lat/lng pero SIN radio: manda el punto igual, y no esconde nada", async () => {
    await searchListings({ lat: -12.05, lng: -77.04, sort: "views" });
    // El punto viaja siempre que se conozca: el servidor lo necesita para que
    // los avisos Urgente/Destacado encabecen solo si son de la zona de quien
    // busca (migración 0080). Sin radio, no se filtra ni se fuerza el orden.
    expect(state.rpcArgs).toMatchObject({
      p_lat: -12.05, p_lng: -77.04, p_radius_km: null, p_sort: "views",
    });
  });

  it("sin ubicación no manda punto alguno", async () => {
    await searchListings({ sort: "recent" });
    expect(state.rpcArgs).toMatchObject({ p_lat: null, p_lng: null, p_radius_km: null });
  });

  it("el usuario puede pedir el orden por cercanía sin acotar el radio", async () => {
    await searchListings({ lat: -12.05, lng: -77.04, sort: "distance" });
    expect(state.rpcArgs).toMatchObject({
      p_lat: -12.05, p_lng: -77.04, p_radius_km: null, p_sort: "distance",
    });
  });
});
