import { describe, it, expect, vi, beforeEach } from "vitest";

// La ficha "Publicado por" del detalle mostraba "0 avisos" y "Nuevo" fijos:
// eran literales del JSX (IT3-013). Ahora salen del RPC advertiser_public_stats,
// única vía posible para la fecha de alta (profiles no es legible por terceros).

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { fetchAdvertiserStats } from "@/lib/reviews";

const OWNER = "155ae6a4-38a5-44cd-8e2f-425a0e87ca00";

beforeEach(() => rpc.mockReset());

describe("fetchAdvertiserStats", () => {
  it("pide el RPC con el dueño y traduce la fila", async () => {
    rpc.mockResolvedValue({ data: [{ active_listings: 18, member_since: "2024-03-05T10:00:00Z" }], error: null });

    const stats = await fetchAdvertiserStats(OWNER);

    expect(rpc).toHaveBeenCalledWith("advertiser_public_stats", { p_owner: OWNER });
    expect(stats).toEqual({ activeListings: 18, memberSince: "2024-03-05T10:00:00Z" });
  });

  it("acepta también la fila suelta (no envuelta en array)", async () => {
    rpc.mockResolvedValue({ data: { active_listings: 2, member_since: null }, error: null });
    expect(await fetchAdvertiserStats(OWNER)).toEqual({ activeListings: 2, memberSince: null });
  });

  it("devuelve null si el RPC falla: la tarjeta muestra '—', nunca un 0 inventado", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    expect(await fetchAdvertiserStats(OWNER)).toBeNull();
  });

  it("devuelve null si no hay filas", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchAdvertiserStats(OWNER)).toBeNull();
  });
});
