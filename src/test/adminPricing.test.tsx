import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

/**
 * El panel de tarifas, que es lo único que hay para configurar precios.
 *
 * Cobra especial importancia desde que el precio lo calcula el SERVIDOR
 * (migración 0091): la base de datos lee `pricing_settings`, así que lo que se
 * guarde ahí es literalmente lo que se le cobra al anunciante. Si el guardado
 * fallara y nadie se enterase, el panel enseñaría una tarifa y se cobraría otra.
 */

beforeEach(() => {
  (globalThis as never as { ResizeObserver: unknown }).ResizeObserver =
    class { observe() {} unobserve() {} disconnect() {} };
  localStorage.clear();
});

// --- Supabase: se captura lo que se escribe en pricing_settings ---
const upsert = vi.fn();
const FILA = {
  id: "row-1",
  base: 16.14,
  desc_por_aviso: 0.06,
  desc_cantidad: [0, 0, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06],
  saltos: { 15: 0.14, 30: 0.13, 60: 0.12, 90: 0.11 },
  // Tarifa DISTINTA de la del código, para poder demostrar que se pinta la de
  // la base de datos y no los valores por defecto.
  extras: { img100: 0, img500: 2, pdf100: 0, pdf500: 1, urgente: 2, destacado: 1, confidencial: 2.5 },
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
    from: (tabla: string) => {
      if (tabla === "pricing_settings") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: FILA }) }) }),
          upsert: (row: unknown) => {
            upsert(row);
            return { select: () => ({ single: () => upsert.mock.results.at(-1)?.value }) };
          },
        };
      }
      return { select: () => ({ order: () => Promise.resolve({ data: [] }) }) };
    },
  },
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a), useToast: () => ({ toast }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/useCategories", () => ({ useCategories: () => [] }));
vi.mock("@/lib/promotions", () => ({
  fetchPromotions: vi.fn().mockResolvedValue([]),
  upsertPromotion: vi.fn(),
  deletePromotion: vi.fn(),
}));

import AdminPricing from "@/pages/admin/AdminPricing";

/** Abre la pestaña de adicionales. Radix Tabs cambia en mousedown/focus, no en click. */
const abrirAdicionales = async () => {
  render(<AdminPricing role="admin" />);
  const tab = await screen.findByRole("tab", { name: /adicionales/i });
  fireEvent.mouseDown(tab);
  fireEvent.focus(tab);
  fireEvent.click(tab);
  await screen.findByRole("columnheader", { name: /precio por día/i });
};

/**
 * El campo editable de un adicional, buscado por su FILA.
 *
 * No vale buscar por valor: varios adicionales comparten precio (pdf500 y
 * destacado valen 1), y coger "el primero que valga 1" editaba el que no era —
 * la prueba pasaba sin comprobar nada. Y "Destacado" también aparece en la
 * tabla de previsualización, que no tiene campos: por eso se filtra por la fila
 * que sí contiene uno.
 */
const campoDe = (nombre: RegExp) => {
  const fila = screen
    .getAllByRole("row")
    .filter((r) => nombre.test(r.textContent ?? ""))
    .find((r) => within(r).queryByRole("spinbutton"));
  if (!fila) throw new Error(`No se encontró un campo editable para ${nombre}`);
  return within(fila).getByRole("spinbutton");
};

beforeEach(() => {
  upsert.mockReset().mockReturnValue(Promise.resolve({ data: { id: "row-1" }, error: null }));
  toast.mockClear();
});

describe("AdminPricing — la tarifa sigue siendo configurable", () => {
  it("pinta los precios que están en la base de datos, no los del código", async () => {
    await abrirAdicionales();
    // Confidencial vale 2.5 en la BD y 0 en DEFAULT_SETTINGS.
    await waitFor(() => {
      const valores = screen.getAllByRole("spinbutton").map((i) => (i as HTMLInputElement).value);
      expect(valores).toContain("2.5");
    });
  });

  it("dice que la tarifa es POR DÍA y no un pago único", async () => {
    await abrirAdicionales();
    expect(await screen.findByText(/tarifa diaria/i)).toBeTruthy();
    expect(screen.getByText(/precio por día/i)).toBeTruthy();
  });

  it("previsualiza lo que costará cada adicional en cada duración", async () => {
    await abrirAdicionales();
    // Destacado a S/ 1 el día × 30 días = S/ 30. Sin esta tabla es fácil dejar
    // un número creyendo que es el precio total del adicional.
    await waitFor(() => expect(screen.getByText(/lo que costará cada adicional/i)).toBeTruthy());
    expect(screen.getAllByText("S/ 30.00").length).toBeGreaterThan(0);
  });

  it("guardar manda la tarifa editada a la base de datos", async () => {
    await abrirAdicionales();
    fireEvent.change(campoDe(/^Destacado/), { target: { value: "3" } });

    fireEvent.click(screen.getAllByRole("button", { name: /guardar cambios/i })[0]);

    await waitFor(() => expect(upsert).toHaveBeenCalled());
    const enviado = upsert.mock.calls[0][0] as { extras: Record<string, number>; is_active: boolean };
    expect(enviado.extras.destacado).toBe(3);
    expect(enviado.is_active).toBe(true);
  });

  it("si la base de datos rechaza el guardado, el caché local NO se queda con la tarifa nueva", async () => {
    // Este es el fallo que motivó la prueba: se escribía primero en
    // localStorage y luego en la BD. Si la BD fallaba, el navegador seguía
    // enseñando la tarifa nueva mientras el servidor cobraba la vieja.
    upsert.mockReturnValue(Promise.resolve({ data: null, error: { message: "sin permiso" } }));

    await abrirAdicionales();
    fireEvent.change(campoDe(/^Destacado/), { target: { value: "99" } });
    fireEvent.click(screen.getAllByRole("button", { name: /guardar cambios/i })[0]);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Error al guardar" })));
    expect(localStorage.getItem("effe:pricing-settings") ?? "").not.toContain('"destacado":99');
  });
});
