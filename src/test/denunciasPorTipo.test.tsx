import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

/**
 * La pestaña «Denuncias» de Reportes, separada por tipo (0139).
 *
 * Se llamaba «Reclamos» y contaba `reports` entera. Dos problemas:
 *
 *  1. La palabra. «Reclamos» era el Libro de Reclamaciones de Indecopi, que es
 *     otra tabla (`complaints`) y otra pantalla. Aquí son denuncias.
 *  2. La cifra. Un «Recibidas: 42» no dice si el problema es lo que se publica o
 *     cómo se comporta la gente, y cada mitad la modera una pantalla distinta.
 *
 * Y la parte defensiva: si la 0139 no está aplicada, la respuesta no trae el
 * desglose. La pantalla tiene que enseñar el total y callar lo que no sabe, no
 * pintar ceros — un cero dice «no hay denuncias de ese tipo», que es mentira.
 */

const RESUMEN = {
  recibidos: 42, pendientes: 32, solucionados: 10,
  avisos: { recibidos: 21, pendientes: 13, solucionados: 8 },
  usuarios: { recibidos: 21, pendientes: 19, solucionados: 2 },
  trend: [{ mes: "Ago", recibidos: 5, solucionados: 2 }],
};

let resumen: Record<string, unknown> = RESUMEN;
const exportRows = vi.fn();

vi.mock("@/lib/admin", () => ({
  fetchCategoryDistribution: async () => [],
  fetchCategoryRevenue: async () => [],
  fetchRegionDistribution: async () => [],
  fetchClaimsSummary: async () => resumen,
  fetchGrowthSeries: async () => [],
  fetchAdminCreditTransactions: async () => ({ rows: [], total: 0 }),
  fetchSaldosUsuarios: async () => ({ rows: [], total: 0 }),
  nombreDeTipo: (t: string) => t,
  SALDOS_PAGE_SIZE: 20,
  CREDIT_TX_PAGE_SIZE: 20,
  GROWTH_RANGES: [{ value: "6m", label: "6 meses" }],
}));
vi.mock("@/lib/exportReport", () => ({ exportRows: (...a: unknown[]) => exportRows(...a) }));
vi.mock("@/hooks/useCategories", () => ({ useCategories: () => [] }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: () => {}, useToast: () => ({ toast: () => {} }) }));
// Los gráficos no aportan nada a lo que se comprueba aquí y montan un
// ResponsiveContainer que en jsdom no tiene tamaño.
vi.mock("recharts", () => {
  const Nada = () => null;
  return {
    BarChart: Nada, Bar: Nada, XAxis: Nada, YAxis: Nada, CartesianGrid: Nada,
    Tooltip: Nada, ResponsiveContainer: Nada, Legend: Nada,
    PieChart: Nada, Pie: Nada, Cell: Nada,
  };
});
vi.mock("@/lib/pricing", () => ({
  formatCredits: (v: number) => String(v),
  formatSoles: (v: number) => `S/ ${v}`,
}));

import AdminReports from "@/pages/admin/AdminReports";

beforeEach(() => {
  prepararDom();
  vi.clearAllMocks();
  resumen = RESUMEN;
});

const abrirDenuncias = async () => {
  render(<AdminReports role="superadmin" />);
  fireEvent.mouseDown(await screen.findByRole("tab", { name: "Denuncias" }));
  return screen.findByText("Sobre avisos");
};

/** La tarjeta de un tipo, por su título. */
const tarjeta = (titulo: string) =>
  screen.getByText(titulo).closest("div.p-4") as HTMLElement;

describe("la pestaña ya no se llama «Reclamos»", () => {
  it("se llama «Denuncias», que es lo que cuenta", async () => {
    // «Reclamos» era el Libro de Reclamaciones, que es otra tabla y otra
    // pantalla. Había cuatro sitios del panel usando esa palabra.
    render(<AdminReports role="superadmin" />);
    expect(await screen.findByRole("tab", { name: "Denuncias" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Reclamos" })).toBeNull();
  });
});

describe("el desglose por tipo", () => {
  it("enseña las de avisos y las de usuarios por separado", async () => {
    await abrirDenuncias();

    const avisos = tarjeta("Sobre avisos");
    expect(avisos).toHaveTextContent("21");
    expect(avisos).toHaveTextContent("13");
    expect(avisos).toHaveTextContent("8");

    const usuarios = tarjeta("Sobre usuarios");
    expect(usuarios).toHaveTextContent("19");
    expect(usuarios).toHaveTextContent("2");
  });

  it("dice dónde se modera cada tipo", async () => {
    // Es la mitad del valor de separarlas: la cifra sin el «y ahora qué» no
    // lleva a ningún sitio.
    await abrirDenuncias();
    expect(tarjeta("Sobre avisos")).toHaveTextContent("Gestión de avisos → Reportados");
    expect(tarjeta("Sobre usuarios")).toHaveTextContent("Usuarios reportados");
  });

  it("el total sigue arriba, que es lo que había antes", async () => {
    await abrirDenuncias();
    // Las tres cifras grandes del encabezado. Están fuera de las dos tarjetas
    // del desglose, así que se buscan por su valor.
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("32")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    // Y la etiqueta sale tres veces: el total y los dos tipos.
    expect(screen.getAllByText("Recibidas")).toHaveLength(3);
  });
});

describe("si la 0139 todavía no está aplicada", () => {
  it("no inventa ceros: esconde el desglose y deja el total", async () => {
    // Un cero diría «no hay denuncias de avisos», que es distinto de «no lo
    // sabemos porque la migración no está».
    resumen = { recibidos: 42, pendientes: 32, solucionados: 10, trend: [] };
    render(<AdminReports role="superadmin" />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Denuncias" }));

    await screen.findByText("Recibidas");
    expect(screen.queryByText("Sobre avisos")).toBeNull();
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});

describe("el Excel", () => {
  it("saca una fila por tipo, más el total", async () => {
    await abrirDenuncias();
    fireEvent.click(screen.getAllByRole("button", { name: /Excel/i })[0]);

    await waitFor(() => expect(exportRows).toHaveBeenCalled());
    // exportRows(formato, fichero, titulo, filas): las filas son el CUARTO.
    const [, , , filas] = exportRows.mock.calls[0] as [unknown, unknown, unknown, Record<string, unknown>[]];
    const porTipo = Object.fromEntries(filas.filter((f) => f.Tipo).map((f) => [f.Tipo, f]));
    expect(porTipo["Avisos"]).toMatchObject({ Recibidas: 21, Pendientes: 13, Resueltas: 8 });
    expect(porTipo["Usuarios"]).toMatchObject({ Recibidas: 21, Pendientes: 19, Resueltas: 2 });
    expect(porTipo["Total"]).toMatchObject({ Recibidas: 42, Pendientes: 32, Resueltas: 10 });
  });

  it("sin desglose escribe «—», no 0", async () => {
    resumen = { recibidos: 42, pendientes: 32, solucionados: 10, trend: [] };
    render(<AdminReports role="superadmin" />);
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Denuncias" }));
    await screen.findByText("Recibidas");

    fireEvent.click(screen.getAllByRole("button", { name: /Excel/i })[0]);

    await waitFor(() => expect(exportRows).toHaveBeenCalled());
    // exportRows(formato, fichero, titulo, filas): las filas son el CUARTO.
    const [, , , filas] = exportRows.mock.calls[0] as [unknown, unknown, unknown, Record<string, unknown>[]];
    const avisos = filas.find((f) => f.Tipo === "Avisos")!;
    expect(avisos.Recibidas).toBe("—");
  });
});
