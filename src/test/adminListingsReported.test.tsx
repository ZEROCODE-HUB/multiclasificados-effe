import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// En la pestaña "Reportados" el moderador solo veía el título y el motivo, y ya
// tenía que decidir si deshabilitar el aviso. Sin verlo.

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    class { observe() {} unobserve() {} disconnect() {} };
  if (!window.matchMedia) {
    (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    });
  }
});

const LISTING = "22222222-2222-4222-8222-222222222222";

const REPORTE = {
  id: "33333333-3333-4333-8333-333333333333",
  target_type: "listing", reason: "Posible estafa o fraude", category: null, status: "open",
  action_taken: null, reporter: "Ana", reported: "Luis",
  reporter_id: null, reported_id: null,
  listing_id: LISTING, listing_title: "Casa", assigned_to: null, assignee: null,
  created_at: "2026-07-07T16:05:48Z",
};

const AVISO = {
  id: LISTING, title: "Casa", description: "Bonita casa en la sierra", price: 120000, currency: "PEN",
  condition: null, category_id: "inmuebles", subcategory_id: null, location: "Áncash",
  status: "active", featured: false, urgent: false, views: 42, rejection_reason: null,
  published_at: "2026-07-01T00:00:00Z", created_at: "2026-07-01T00:00:00Z",
  advertiser: "Oscar Mijael Pérez García", advertiser_id: null, images: [],
};

const fetchAdminListing = vi.fn();

vi.mock("@/lib/admin", () => ({
  fetchAdminListings: async () => ({ data: [], real: true }),
  fetchReports: async () => ({ data: [REPORTE], real: true }),
  setListingStatus: async () => {},
  fetchAdminListing: (...a: unknown[]) => fetchAdminListing(...a),
}));
vi.mock("@/lib/pricing", () => ({ disableListing: async () => {}, loadDisabled: () => ({}) }));
vi.mock("@/lib/listings", () => ({ fetchListingImages: async () => [] }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: () => {}, useToast: () => ({ toast: () => {} }) }));

import AdminListings from "@/pages/admin/AdminListings";

const abrirReportados = async () => {
  render(<AdminListings role="superadmin" />);
  // El Tab de Radix cambia con mousedown, no con click: en jsdom un click suelto
  // no lo activa y el panel se queda sin montar.
  fireEvent.mouseDown(await screen.findByRole("tab", { name: /Reportados/ }));
  await screen.findByText("Avisos reportados");
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchAdminListing.mockResolvedValue(AVISO);
});

describe('pestaña "Reportados": ver el aviso antes de deshabilitarlo', () => {
  it('"Ver aviso" abre el contenido del aviso denunciado', async () => {
    await abrirReportados();

    fireEvent.click(screen.getByRole("button", { name: /Ver aviso/ }));

    await waitFor(() => expect(fetchAdminListing).toHaveBeenCalledWith(LISTING));
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("Bonita casa en la sierra");
    expect(dialogo).toHaveTextContent("Oscar Mijael Pérez García");
    expect(dialogo).toHaveTextContent("S/ 120,000.00");
  });

  it("el botón de deshabilitar sigue estando: ver no reemplaza a moderar", async () => {
    await abrirReportados();

    expect(screen.getByRole("button", { name: /Deshabilitar/ })).toBeInTheDocument();
  });

  it("si el aviso ya no existe, lo dice en vez de quedarse cargando", async () => {
    fetchAdminListing.mockResolvedValue(null);
    await abrirReportados();

    fireEvent.click(screen.getByRole("button", { name: /Ver aviso/ }));

    expect(await screen.findByText(/No se pudo cargar el aviso/)).toBeInTheDocument();
  });
});
