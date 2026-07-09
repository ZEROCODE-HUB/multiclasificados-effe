import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * "Variables del sistema" mostraba cosas que no le tocan:
 *   - El precio del aviso destacado ya se configura en Tarifas y descuentos >
 *     Precios de adicionales. Tenerlo en dos sitios era pedir que se
 *     descuadraran.
 *   - Las pasarelas Stripe y Culqi no son variables del sistema.
 *
 * Se quedan la comisión, el límite de publicaciones gratis y el mantenimiento.
 */

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    class { observe() {} unobserve() {} disconnect() {} };
  if (!window.matchMedia) {
    (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    });
  }
});

const setSetting = vi.fn();

vi.mock("@/lib/admin", () => ({
  fetchSettings: async () => [],
  setSetting: (...a: unknown[]) => setSetting(...a),
  fetchAllInvoices: async () => ({ data: [], real: true }),
  fetchCategories: async () => ({ data: [], real: true }),
  createCategory: async () => {},
  updateCategory: async () => {},
  deleteCategory: async () => {},
  reorderCategories: async () => {},
}));
vi.mock("@/lib/categories", () => ({
  CATEGORY_ICON_NAMES: [], iconFor: () => () => null, invalidateCategories: async () => {},
}));
vi.mock("@/hooks/use-toast", () => ({ toast: () => {}, useToast: () => ({ toast: () => {} }) }));

import AdminCommercial from "@/pages/admin/AdminCommercial";

const abrirSistema = async () => {
  render(<AdminCommercial role="superadmin" />);
  // Los Tabs de Radix cambian con mousedown, no con click.
  fireEvent.mouseDown(await screen.findByRole("tab", { name: /Sistema/i }));
  await screen.findByText("Variables del sistema");
};

beforeEach(() => vi.clearAllMocks());

describe("Variables del sistema: lo que ya no está", () => {
  it("no muestra el precio de aviso destacado: vive en Precios de adicionales", async () => {
    await abrirSistema();
    expect(screen.queryByText(/Precio de aviso destacado/i)).toBeNull();
  });

  it("no muestra las pasarelas de pago", async () => {
    await abrirSistema();
    expect(screen.queryByText(/Stripe/i)).toBeNull();
    expect(screen.queryByText(/Culqi/i)).toBeNull();
  });

  it("al guardar no escribe los ajustes eliminados", async () => {
    await abrirSistema();
    fireEvent.click(screen.getByRole("button", { name: /Guardar configuración/i }));

    await waitFor(() => expect(setSetting).toHaveBeenCalled());
    const claves = setSetting.mock.calls.map((c) => c[0]);
    expect(claves).not.toContain("featured_price");
    expect(claves).not.toContain("gateway_stripe");
    expect(claves).not.toContain("gateway_culqi");
  });
});

describe("Variables del sistema: lo que se queda", () => {
  it("mantiene comisión, límite de publicaciones gratis y mantenimiento", async () => {
    await abrirSistema();

    expect(screen.getByText(/Comisión por transacción/i)).toBeInTheDocument();
    expect(screen.getByText(/Límite de publicaciones gratis/i)).toBeInTheDocument();
    expect(screen.getByText("Modo mantenimiento")).toBeInTheDocument();
  });

  it("el interruptor de mantenimiento se guarda de verdad", async () => {
    await abrirSistema();

    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: /Guardar configuración/i }));

    await waitFor(() =>
      expect(setSetting).toHaveBeenCalledWith("maintenance_mode", true, "Modo mantenimiento"),
    );
  });

  it("avisa de que el staff no queda fuera al activarlo", async () => {
    await abrirSistema();
    expect(screen.getByText(/El personal del panel sigue entrando/i)).toBeInTheDocument();
  });
});
