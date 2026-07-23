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

  it("con lat/lng pero SIN radio: no activa la cercanía", async () => {
    await searchListings({ lat: -12.05, lng: -77.04, sort: "views" });
    expect(state.rpcArgs).toMatchObject({
      p_lat: null, p_lng: null, p_radius_km: null, p_sort: "views",
    });
  });
});
