import { describe, it, expect, vi, beforeEach } from "vitest";

// Los KPIs/serie demo del dashboard admin solo deben verse en modo demo (sin
// sesión). Un staff logueado, si el RPC viene vacío o falla, ve ceros reales.

let rpcResult: { data: unknown; error: unknown } = { data: null, error: { message: "fail" } };
let user: unknown = null;

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: async () => rpcResult,
    auth: { getUser: async () => ({ data: { user } }) },
  },
}));

import { fetchAdminStats, fetchGrowthSeries } from "@/lib/admin";
import { adminKpis } from "@/data/adminMockData";

beforeEach(() => {
  rpcResult = { data: null, error: { message: "fail" } };
  user = null;
});

describe("Dashboard: KPIs demo solo sin sesión", () => {
  it("staff logueado + RPC caído → ceros REALES, no demo", async () => {
    user = { id: "u1" };
    const s = await fetchAdminStats();
    expect(s.real).toBe(true);
    expect(s.data.users).toBe(0);
    expect(s.data.revenue).toBe(0);
  });

  it("sin sesión (modo demo) → KPIs demo", async () => {
    user = null;
    const s = await fetchAdminStats();
    expect(s.real).toBe(false);
    expect(s.data.users).toBe(adminKpis.users);
  });

  it("staff logueado + RPC con datos → datos reales", async () => {
    user = { id: "u1" };
    rpcResult = {
      data: { users: 5, active_listings: 2, pending_listings: 0, sold_listings: 0, total_listings: 2, reports_open: 0, revenue: 10 },
      error: null,
    };
    const s = await fetchAdminStats();
    expect(s.real).toBe(true);
    expect(s.data.users).toBe(5);
  });

  it("serie de crecimiento: staff caído → vacía; sin sesión → demo", async () => {
    user = { id: "u1" };
    expect(await fetchGrowthSeries()).toEqual([]);
    user = null;
    expect((await fetchGrowthSeries()).length).toBeGreaterThan(0);
  });
});
