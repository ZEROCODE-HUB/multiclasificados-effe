import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Polyfills para Radix (Tabs/Select) y Recharts en jsdom.
beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

// --- Mocks de la capa de datos ---
vi.mock("@/lib/admin", () => ({
  fetchCategoryDistribution: vi.fn().mockResolvedValue([]),
  fetchCategoryRevenue: vi.fn().mockResolvedValue([]),
  fetchRegionDistribution: vi.fn().mockResolvedValue([]),
  fetchClaimsSummary: vi.fn().mockResolvedValue({ recibidos: 0, pendientes: 0, solucionados: 0, trend: [] }),
  fetchGrowthSeries: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/hooks/useCategories", () => ({ useCategories: () => [] }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/exportReport", () => ({ exportRows: vi.fn() }));

import AdminReports from "@/pages/admin/AdminReports";

describe("AdminReports — títulos de gráficos sin 'gratuitos'", () => {
  it("muestra 'Avisos por categoría' y 'Avisos por región'", () => {
    render(<AdminReports role="superadmin" />);
    expect(screen.getByText("Avisos por categoría")).toBeTruthy();
    expect(screen.getByText("Avisos por región")).toBeTruthy();
  });

  it("no muestra ningún título con la palabra 'gratuitos'", () => {
    render(<AdminReports role="superadmin" />);
    expect(screen.queryByText(/gratuit/i)).toBeNull();
  });
});
