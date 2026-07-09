import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

// Arrastra una tarjeta de categoría de verdad (por el sensor de teclado de
// dnd-kit, que recorre el mismo camino que el ratón: dragStart → dragOver →
// dragEnd) y comprueba que el nuevo orden se persiste.

const CATS = [
  { id: "inmuebles", name: "Inmuebles", icon: "Home", sort_order: 1, active: true, count: 3 },
  { id: "vehiculos", name: "Vehículos", icon: "Car", sort_order: 2, active: true, count: 1 },
  { id: "empleos", name: "Empleos", icon: "Briefcase", sort_order: 3, active: true, count: 0 },
];

const reorderCategories = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/admin", () => ({
  fetchCategories: () => Promise.resolve({ data: CATS.map((c) => ({ ...c })), real: true }),
  reorderCategories: (ids: string[]) => reorderCategories(ids),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  fetchSettings: () => Promise.resolve([]),
  setSetting: vi.fn(),
  fetchAllInvoices: () => Promise.resolve({ data: [], real: true }),
}));

const invalidateCategories = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/categories", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/categories")>()),
  invalidateCategories: () => invalidateCategories(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (a: unknown) => toast(a) }));

import AdminCommercial from "@/pages/admin/AdminCommercial";

// En jsdom todo mide 0×0. dnd-kit necesita rectángulos reales para decidir
// sobre qué tarjeta estás soltando: las alineamos en una fila de 200px.
function layOutCards(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>("div.border.p-4").forEach((el, i) => {
    el.getBoundingClientRect = () =>
      ({ x: i * 200, y: 0, left: i * 200, top: 0, right: (i + 1) * 200,
         bottom: 150, width: 200, height: 150, toJSON: () => ({}) }) as DOMRect;
  });
}

// El sensor de teclado engancha su listener después del "lift", así que hay que
// dejar correr el event loop entre tecla y tecla.
const press = (el: HTMLElement, code: string) =>
  act(async () => {
    fireEvent.keyDown(el, { key: code === "Space" ? " " : code, code });
    await new Promise((r) => setTimeout(r, 20));
  });

/** Levanta la tarjeta, la mueve `steps` posiciones a la derecha y la suelta. */
async function dragRight(handle: HTMLElement, steps: number) {
  handle.focus();
  await press(handle, "Space");
  for (let i = 0; i < steps; i++) await press(handle, "ArrowRight");
  await press(handle, "Space");
}

const visibleOrder = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("p.font-semibold.text-sm")).map((p) => p.textContent);

beforeEach(() => {
  reorderCategories.mockClear();
  reorderCategories.mockResolvedValue(undefined);
  invalidateCategories.mockClear();
  toast.mockClear();
  globalThis.ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

describe("AdminCommercial — reordenar categorías arrastrando", () => {
  it("mueve la tarjeta una posición y persiste el nuevo orden", async () => {
    const { container } = render(<AdminCommercial role="superadmin" />);
    await screen.findByText("Inmuebles");
    layOutCards(container);

    await dragRight(screen.getByLabelText("Reordenar Inmuebles"), 1);

    await waitFor(() => expect(reorderCategories).toHaveBeenCalledTimes(1));
    expect(reorderCategories).toHaveBeenCalledWith(["vehiculos", "inmuebles", "empleos"]);
    expect(visibleOrder(container)).toEqual(["Vehículos", "Inmuebles", "Empleos"]);

    // El resto de la plataforma tiene que enterarse del cambio.
    await waitFor(() => expect(invalidateCategories).toHaveBeenCalled());
  });

  it("arrastrar al final guarda el orden completo", async () => {
    const { container } = render(<AdminCommercial role="superadmin" />);
    await screen.findByText("Inmuebles");
    layOutCards(container);

    await dragRight(screen.getByLabelText("Reordenar Inmuebles"), 2);

    await waitFor(() => expect(reorderCategories).toHaveBeenCalledTimes(1));
    expect(reorderCategories).toHaveBeenCalledWith(["vehiculos", "empleos", "inmuebles"]);
  });

  it("si la BD rechaza el cambio, la tarjeta vuelve a su sitio", async () => {
    reorderCategories.mockRejectedValueOnce(new Error("permiso denegado"));
    const { container } = render(<AdminCommercial role="superadmin" />);
    await screen.findByText("Inmuebles");
    layOutCards(container);

    await dragRight(screen.getByLabelText("Reordenar Inmuebles"), 1);

    await waitFor(() => expect(reorderCategories).toHaveBeenCalled());
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "No se pudo guardar el orden" }),
      );
    });
    expect(visibleOrder(container)).toEqual(["Inmuebles", "Vehículos", "Empleos"]);
  });
});
