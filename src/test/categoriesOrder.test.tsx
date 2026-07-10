import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// El orden que define el staff arrastrando las tarjetas vive en
// `categories.sort_order`. Estos tests fijan las dos mitades del contrato:
// que la BD manda sobre el orden que ve el usuario, y que arrastrar lo persiste.

// La BD devuelve las filas YA ordenadas por sort_order. Aquí las damos en un
// orden distinto al histórico hardcodeado para notar si algo lo ignora.
const DB_ROWS = [
  { id: "servicios", name: "Servicios", icon: "Wrench" },
  { id: "empleos", name: "Empleos", icon: "Briefcase" },
  { id: "inmuebles", name: "Inmuebles", icon: "Home" },
];

let selectResult: { data: unknown; error: unknown } = { data: DB_ROWS, error: null };
let updateError: unknown = null;
const updateCalls: Array<{ id: string; sort_order: number }> = [];

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => {
        // Cadena encadenable y "awaitable": .eq().order().order()
        const chain: Record<string, unknown> = {};
        chain.eq = () => chain;
        chain.order = () => chain;
        chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(selectResult).then(resolve, reject);
        return chain;
      },
      update: (patch: { sort_order: number }) => ({
        eq: (_col: string, id: string) => {
          updateCalls.push({ id, sort_order: patch.sort_order });
          return Promise.resolve({ error: updateError });
        },
      }),
    }),
  },
}));

// CategoryGrid pide los conteos por su cuenta; no es lo que probamos aquí.
vi.mock("@/lib/stats", () => ({ fetchCategoryCounts: () => Promise.resolve({}) }));

import { CategoryGrid } from "@/components/CategoryGrid";
import { reorderCategories } from "@/lib/admin";
import {
  loadCategories, getCategories, resetCategoriesCache, FALLBACK_CATEGORIES,
} from "@/lib/categories";

beforeEach(() => {
  resetCategoriesCache();
  localStorage.clear();
  updateCalls.length = 0;
  updateError = null;
  selectResult = { data: DB_ROWS, error: null };
});

describe("lib/categories — el orden lo manda la BD", () => {
  it("devuelve las categorías en el orden en que vienen de la BD", async () => {
    const cats = await loadCategories();
    expect(cats.map((c) => c.id)).toEqual(["servicios", "empleos", "inmuebles"]);
  });

  it("guarda el orden en el navegador para no parpadear al recargar", async () => {
    await loadCategories();
    resetCategoriesCache(); // simula una recarga de la página
    expect(getCategories().map((c) => c.id)).toEqual(["servicios", "empleos", "inmuebles"]);
  });

  it("si la consulta falla, conserva el set por defecto en vez de dejar la app sin categorías", async () => {
    selectResult = { data: null, error: new Error("sin red") };
    const cats = await loadCategories();
    expect(cats.map((c) => c.id)).toEqual(FALLBACK_CATEGORIES.map((c) => c.id));
  });

  it("una tabla vacía no borra las categorías que ya se estaban mostrando", async () => {
    selectResult = { data: [], error: null };
    const cats = await loadCategories();
    expect(cats.length).toBe(FALLBACK_CATEGORIES.length);
  });
});

describe("reorderCategories — persistencia del arrastre", () => {
  it("escribe sort_order 1..n siguiendo el orden en que quedaron las tarjetas", async () => {
    await reorderCategories(["empleos", "inmuebles", "servicios"]);
    expect(updateCalls).toEqual([
      { id: "empleos", sort_order: 1 },
      { id: "inmuebles", sort_order: 2 },
      { id: "servicios", sort_order: 3 },
    ]);
  });

  it("propaga el error si la BD rechaza el cambio (para poder revertir la tarjeta)", async () => {
    updateError = { message: "permiso denegado" };
    await expect(reorderCategories(["empleos", "inmuebles"])).rejects.toMatchObject({
      message: "permiso denegado",
    });
  });
});

describe("impacto global — la portada respeta el orden del panel", () => {
  it("CategoryGrid pinta las categorías en el orden guardado por el staff", async () => {
    render(<CategoryGrid />);
    await waitFor(() => {
      expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(DB_ROWS.length);
    });
    const names = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(["Servicios", "Empleos", "Inmuebles"]);
  });
});
