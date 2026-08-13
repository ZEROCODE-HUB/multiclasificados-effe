import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// QA reportó que los porcentajes de las tarjetas no se movían nunca: estaban
// escritos a mano ("+3.2%", "+8.4%", "+14.1%"). Este test fija que ahora salen
// de los datos, y que el color no miente cuando la cifra empeora.

beforeEach(prepararDom);

const { STATS } = vi.hoisted(() => ({
  STATS: {
    users: 105, users_prev: 100,                    // +5%
    active_listings: 151, active_listings_prev: 139, // +8.6%
    pending_listings: 0,
    sold_listings: 4, sold_listings_prev: 5,        // −20%
    total_listings: 200,
    reports_open: 29, reports_open_prev: 20,        // +45% … y eso es MALO
    revenue: 145.77, revenue_prev: 100,             // +45.8%
    window_days: 30,
  },
}));

const fetchAdminStats = vi.fn();
vi.mock("@/lib/admin", async (orig) => {
  // Las funciones de cálculo van REALES: lo que se prueba es justamente el
  // número que producen. Solo se sustituye la capa de datos.
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual,
    fetchAdminStats: (...a: unknown[]) => fetchAdminStats(...a),
    fetchGrowthSeries: vi.fn().mockResolvedValue([]),
    fetchCategoryDistribution: vi.fn().mockResolvedValue([]),
    fetchAdminListings: vi.fn().mockResolvedValue({ data: [] }),
    fetchRecentActivity: vi.fn().mockResolvedValue({ data: [], real: true }),
  };
});

vi.mock("react-router-dom", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, useNavigate: () => vi.fn() };
});

import AdminDashboard from "@/pages/admin/AdminDashboard";

beforeEach(() => {
  fetchAdminStats.mockReset().mockResolvedValue({ data: STATS, real: true });
});

// El porcentaje que acompaña a una tarjeta, con su clase de color.
const trendDe = async (label: string) => {
  const etiqueta = await screen.findByText(label);
  const fila = etiqueta.parentElement!;
  return fila.querySelector("span")!;
};

describe("AdminDashboard — la variación de los KPIs sale de los datos", () => {
  it("calcula el porcentaje de cada tarjeta en vez de enseñar uno fijo", async () => {
    render(<AdminDashboard role="superadmin" />);

    // 151 avisos hoy contra 139 hace 30 días.
    expect((await trendDe("Avisos publicados")).textContent).toBe("+8.6%");
    expect((await trendDe("Usuarios")).textContent).toBe("+5%");
    expect((await trendDe("Ingresos (S/)")).textContent).toBe("+45.8%");

    // Y los viejos literales no aparecen por ningún lado.
    for (const fijo of ["+3.2%", "+8.4%", "+14.1%"]) {
      expect(screen.queryByText(fijo), fijo).toBeNull();
    }
  });

  it("las tres tarjetas que estaban en blanco ahora también muestran variación", async () => {
    render(<AdminDashboard role="superadmin" />);
    for (const label of ["Vendidos", "No vendidos", "Reportados"]) {
      expect((await trendDe(label)).textContent, label).toMatch(/%$/);
    }
  });

  it("el color sigue al signo: una caída no se pinta de verde", async () => {
    render(<AdminDashboard role="superadmin" />);
    // Vendidos baja de 5 a 4.
    const vendidos = await trendDe("Vendidos");
    expect(vendidos.textContent).toBe("-20%");
    expect(vendidos.className).toContain("text-destructive");
  });

  it("más reportes abiertos NO es una buena noticia: color invertido", async () => {
    render(<AdminDashboard role="superadmin" />);
    const reportes = await trendDe("Reportados");
    expect(reportes.textContent).toBe("+45%");
    // Sube, pero se pinta en rojo.
    expect(reportes.className).toContain("text-destructive");
    // Contraste: usuarios también sube, y ahí sí es verde.
    expect((await trendDe("Usuarios")).className).toContain("text-success");
  });

  it("dice contra qué periodo compara", async () => {
    render(<AdminDashboard role="superadmin" />);
    expect(await screen.findByText(/variación compara con hace 30 días/i)).toBeTruthy();
  });

  it("sin datos previos no inventa un porcentaje", async () => {
    fetchAdminStats.mockResolvedValue({
      data: { ...STATS, users_prev: 0, active_listings_prev: 0, revenue_prev: 0 },
      real: true,
    });
    render(<AdminDashboard role="superadmin" />);
    // Desde cero no hay variación posible: se dice "nuevo", no "+∞%".
    expect((await trendDe("Usuarios")).textContent).toBe("nuevo");
    expect(screen.queryByText(/Infinity|NaN/)).toBeNull();
  });
});
