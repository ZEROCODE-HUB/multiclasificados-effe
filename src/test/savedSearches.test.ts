import { describe, it, expect, vi, beforeEach } from "vitest";

// Estado mutable que controla el mock de supabase por test.
const state: { existing: unknown[]; inserted: Record<string, unknown> | null } = {
  existing: [],
  inserted: null,
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({
      // fetchSavedSearches: .select(...).order(...)
      select: () => ({
        order: async () => ({ data: state.existing, error: null }),
      }),
      // createSavedSearch: .insert(row).select(...).single()
      insert: (row: Record<string, unknown>) => {
        state.inserted = row;
        return { select: () => ({ single: async () => ({ data: { id: "new", ...row }, error: null }) }) };
      },
    }),
  },
}));

import { createSavedSearch, filtersKey, DUPLICATE_SEARCH_MSG } from "@/lib/savedSearches";

beforeEach(() => {
  state.existing = [];
  state.inserted = null;
});

describe("filtersKey — identidad de filtros (ignora orden/mayúsculas/espacios)", () => {
  it("mismo q/categoría/precio con distinto sort → misma clave", () => {
    const a = filtersKey({ q: "casa", category: "inmuebles", priceMin: 100, priceMax: 500, sort: "recent" });
    const b = filtersKey({ q: "casa", category: "inmuebles", priceMin: 100, priceMax: 500, sort: "price_asc" });
    expect(a).toBe(b);
  });
  it("normaliza mayúsculas y espacios del texto", () => {
    expect(filtersKey({ q: "  Casa  " })).toBe(filtersKey({ q: "casa" }));
  });
  it("precio distinto → clave distinta", () => {
    expect(filtersKey({ q: "casa", priceMax: 500 })).not.toBe(filtersKey({ q: "casa", priceMax: 900 }));
  });
  it("categoría distinta → clave distinta", () => {
    expect(filtersKey({ category: "inmuebles" })).not.toBe(filtersKey({ category: "vehiculos" }));
  });
});

describe("createSavedSearch — no permite duplicados con los mismos filtros", () => {
  it("bloquea y avisa si ya existe una con los mismos filtros (aunque cambie el sort)", async () => {
    state.existing = [
      { id: "1", name: "X", criteria: { q: "casa", category: "inmuebles", priceMax: 500, sort: "recent" },
        alert_enabled: true, created_at: "", last_run_at: null, last_notified_at: null },
    ];
    await expect(
      createSavedSearch({ q: "casa", category: "inmuebles", priceMax: 500, sort: "price_asc" }, "Otra"),
    ).rejects.toThrow(DUPLICATE_SEARCH_MSG);
    expect(state.inserted).toBeNull(); // no insertó nada
  });

  it("permite guardar si los filtros son distintos", async () => {
    state.existing = [
      { id: "1", name: "X", criteria: { q: "casa", priceMax: 500 },
        alert_enabled: true, created_at: "", last_run_at: null, last_notified_at: null },
    ];
    const res = await createSavedSearch({ q: "auto", category: "vehiculos" }, "Autos");
    expect(res).toBeTruthy();
    expect(state.inserted).toMatchObject({ criteria: { q: "auto", category: "vehiculos" } });
  });

  it("permite la primera búsqueda cuando no hay ninguna guardada", async () => {
    state.existing = [];
    const res = await createSavedSearch({ q: "casa" }, "Casa");
    expect(res).toBeTruthy();
    expect(state.inserted).not.toBeNull();
  });
});
