import { describe, it, expect, vi, beforeEach } from "vitest";

// Captura los args del RPC y controla los datos devueltos.
const state: { args: Record<string, unknown> | null; data: unknown[] } = { args: null, data: [] };

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: async (_fn: string, args: Record<string, unknown>) => {
      state.args = args;
      return { data: state.data, error: null };
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}));

import { fetchAdminCreditTransactions, CREDIT_TX_PAGE_SIZE } from "@/lib/admin";

beforeEach(() => { state.args = null; state.data = []; });

describe("fetchAdminCreditTransactions (EFFE-054)", () => {
  it("envía search/from/to y calcula el offset por página", async () => {
    await fetchAdminCreditTransactions({ search: "ana", from: "2026-07-01", to: "2026-07-31", page: 3 });
    expect(state.args).toMatchObject({
      p_search: "ana", p_from: "2026-07-01", p_to: "2026-07-31",
      p_limit: CREDIT_TX_PAGE_SIZE, p_offset: (3 - 1) * CREDIT_TX_PAGE_SIZE,
    });
  });

  it("valores vacíos viajan como null y offset 0", async () => {
    await fetchAdminCreditTransactions({});
    expect(state.args).toMatchObject({ p_search: null, p_from: null, p_to: null, p_offset: 0 });
  });

  it("mapea filas y lee total_count de la primera fila", async () => {
    state.data = [{
      id: "t1", user_id: "u1", full_name: "Ana", email: "a@x.com",
      type: "purchase", credits: "100", description: "Compra", listing_title: null,
      created_at: "2026-07-20T10:00:00Z", total_count: "42",
    }];
    const res = await fetchAdminCreditTransactions({});
    expect(res.total).toBe(42);
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({ id: "t1", full_name: "Ana", credits: 100, type: "purchase" });
  });

  it("sin datos devuelve total 0", async () => {
    const res = await fetchAdminCreditTransactions({ page: 5 });
    expect(res).toEqual({ data: [], total: 0 });
  });
});
