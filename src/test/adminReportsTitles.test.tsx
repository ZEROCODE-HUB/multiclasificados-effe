import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// Polyfills para Radix (Tabs/Select) y Recharts en jsdom.
beforeEach(prepararDom);

// --- Mocks de la capa de datos ---
vi.mock("@/lib/admin", () => ({
  // El selector de período de las series lo consume al renderizar; sin él en el
  // mock, el componente revienta antes de pintar ningún título.
  GROWTH_RANGES: [
    { value: "7d", label: "Esta semana" },
    { value: "30d", label: "Últimos 30 días" },
    { value: "6m", label: "Últimos 6 meses" },
    { value: "12m", label: "Últimos 12 meses" },
    { value: "all", label: "Histórico" },
  ],
  fetchCategoryDistribution: vi.fn().mockResolvedValue([]),
  fetchCategoryRevenue: vi.fn().mockResolvedValue([]),
  fetchRegionDistribution: vi.fn().mockResolvedValue([]),
  fetchClaimsSummary: vi.fn().mockResolvedValue({ recibidos: 0, pendientes: 0, solucionados: 0, trend: [] }),
  fetchGrowthSeries: vi.fn().mockResolvedValue([]),
  fetchAdminCreditTransactions: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  CREDIT_TX_PAGE_SIZE: 20,
  SALDOS_PAGE_SIZE: 20,
  fetchSaldosUsuarios: async () => ({ data: [], total: 0 }),
  getMyPermissions: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/hooks/useCategories", () => ({ useCategories: () => [] }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/exportReport", () => ({ exportRows: vi.fn() }));

import AdminReports from "@/pages/admin/AdminReports";

describe("AdminReports — títulos de gráficos sin 'gratuitos'", () => {
  // `findByText` espera a que se resuelvan los fetch* asíncronos (dentro de act),
  // así no quedan advertencias de "update not wrapped in act(...)".
  it("muestra 'Avisos por categoría' y 'Avisos por región'", async () => {
    render(<AdminReports role="superadmin" />);
    expect(await screen.findByText("Avisos por categoría")).toBeTruthy();
    expect(await screen.findByText("Avisos por región")).toBeTruthy();
  });

  it("no muestra ningún título con la palabra 'gratuitos'", async () => {
    render(<AdminReports role="superadmin" />);
    await screen.findByText("Avisos por categoría"); // espera el render estable
    expect(screen.queryByText(/gratuit/i)).toBeNull();
  });
});
