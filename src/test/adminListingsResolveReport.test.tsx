import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// Deshabilitar un aviso denunciado no cerraba la denuncia en la BD: el
// "Resuelto" que se veía era un estado derivado del aviso, así que volvía a
// "pendiente" al rehabilitarlo (IT3-020). Aquí se fija el contrato nuevo.

beforeEach(() => {
  prepararDom();
  if (!window.matchMedia) {
    (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    });
  }
});

const LISTING = "22222222-2222-4222-8222-222222222222";
const REPORT = "33333333-3333-4333-8333-333333333333";

const reporte = (status: string) => ({
  id: REPORT,
  target_type: "listing", reason: "Posible estafa o fraude", category: null, status,
  action_taken: null, reporter: "Ana", reported: "Luis",
  reporter_id: null, reported_id: null,
  listing_id: LISTING, listing_title: "Casa", assigned_to: null, assignee: null,
  created_at: "2026-07-07T16:05:48Z",
});

const setListingStatus = vi.fn();
const resolveReport = vi.fn();
const fetchReports = vi.fn();

vi.mock("@/lib/admin", () => ({
  fetchAdminListings: async () => ({ data: [], real: true }),
  fetchReports: (...a: unknown[]) => fetchReports(...a),
  setListingStatus: (...a: unknown[]) => setListingStatus(...a),
  resolveReport: (...a: unknown[]) => resolveReport(...a),
  fetchAdminListing: async () => null,
}));
vi.mock("@/lib/pricing", () => ({
  disableListing: async () => {},
  loadDisabled: () => ({}),
  formatPrecioAviso: (p: number, c: string) =>
    p > 0 ? `${c === "USD" ? "US$" : "S/"} ${p.toFixed(2)}` : "Precio a convenir",
}));
vi.mock("@/lib/listings", () => ({ fetchListingImages: async () => [] }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: () => {}, useToast: () => ({ toast: () => {} }) }));

import AdminListings from "@/pages/admin/AdminListings";

const abrirReportados = async () => {
  render(<AdminListings role="superadmin" />);
  // Los Tabs de Radix cambian con mousedown, no con click.
  fireEvent.mouseDown(await screen.findByRole("tab", { name: /Reportados/ }));
  await screen.findByText("Avisos reportados");
};

const deshabilitar = async (motivo: string) => {
  fireEvent.click(await screen.findByRole("button", { name: /Deshabilitar$/ }));
  fireEvent.change(await screen.findByPlaceholderText(/contenido engañoso/i), { target: { value: motivo } });
  fireEvent.click(screen.getByRole("button", { name: /Deshabilitar y notificar/ }));
};

beforeEach(() => {
  vi.clearAllMocks();
  setListingStatus.mockResolvedValue(undefined);
  resolveReport.mockResolvedValue(undefined);
});

describe("Reportados — deshabilitar cierra la denuncia", () => {
  it("baja el aviso Y marca la denuncia como resuelta, y recarga la lista", async () => {
    // 1ª carga: abierta. Tras resolver, la BD ya la devuelve resuelta.
    fetchReports
      .mockResolvedValueOnce({ data: [reporte("open")], real: true })
      .mockResolvedValue({ data: [reporte("resolved")], real: true });

    await abrirReportados();
    await deshabilitar("Contenido engañoso");

    await waitFor(() => expect(setListingStatus).toHaveBeenCalledWith(LISTING, "rejected", "Contenido engañoso"));
    expect(resolveReport).toHaveBeenCalledWith(REPORT, "remove", "Contenido engañoso");
    // Se relee: si no, el badge seguiría diciendo "Pendiente".
    await waitFor(() => expect(fetchReports.mock.calls.length).toBeGreaterThan(1));
    expect(await screen.findByText("Resuelto")).toBeTruthy();
  });

  it("si la denuncia no se puede cerrar, el aviso queda deshabilitado igualmente", async () => {
    fetchReports.mockResolvedValue({ data: [reporte("open")], real: true });
    resolveReport.mockRejectedValue(new Error("no autorizado"));

    await abrirReportados();
    await deshabilitar("Contenido engañoso");

    await waitFor(() => expect(setListingStatus).toHaveBeenCalled());
    expect(resolveReport).toHaveBeenCalled();
  });

  it("una denuncia ya resuelta no vuelve a ofrecer el botón de deshabilitar", async () => {
    fetchReports.mockResolvedValue({ data: [reporte("resolved")], real: true });

    await abrirReportados();

    expect(await screen.findByText("Resuelto")).toBeTruthy();
    // Rehabilitar el aviso no debe reabrirla: sin botón, no hay vuelta atrás
    // accidental desde esta pestaña.
    expect(screen.queryByRole("button", { name: /Deshabilitar$/ })).toBeNull();
    expect(resolveReport).not.toHaveBeenCalled();
  });
});
