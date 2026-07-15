import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// Herramienta de PRUEBA (superadmin): cambiar la fecha de publicación de un
// aviso para testear su caducidad. Solo debe verla el superadmin, y "Simular
// vencimiento" debe mandar una fecha que deje el aviso ya vencido.

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    class { observe() {} unobserve() {} disconnect() {} };
  if (!window.matchMedia) {
    (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    });
  }
});

const LISTING = "44444444-4444-4444-8444-444444444444";
const PUBLISHED = "2026-07-10T00:00:00Z";
const EXPIRES = "2026-07-17T00:00:00Z"; // duración 7 días
const DURATION_MS = new Date(EXPIRES).getTime() - new Date(PUBLISHED).getTime();

const ROW = {
  id: LISTING, title: "Aviso 7 días", category_id: "vehiculos", status: "active",
  featured: false, price: 100, currency: "PEN", advertiser: "Ceesarr", views: 0,
  created_at: PUBLISHED, published_at: PUBLISHED, expires_at: EXPIRES,
};

const fetchAdminListings = vi.fn();
const setListingPublishedAt = vi.fn();

vi.mock("@/lib/admin", () => ({
  fetchAdminListings: (...a: unknown[]) => fetchAdminListings(...a),
  fetchReports: async () => ({ data: [], real: true }),
  setListingStatus: async () => {},
  setListingPublishedAt: (...a: unknown[]) => setListingPublishedAt(...a),
  fetchAdminListing: async () => null,
}));
vi.mock("@/lib/pricing", () => ({ disableListing: async () => {}, loadDisabled: () => ({}) }));
vi.mock("@/lib/listings", () => ({ fetchListingImages: async () => [] }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: () => {}, useToast: () => ({ toast: () => {} }) }));

import AdminListings from "@/pages/admin/AdminListings";

beforeEach(() => {
  vi.clearAllMocks();
  fetchAdminListings.mockResolvedValue({ data: [ROW], real: true });
  setListingPublishedAt.mockResolvedValue(undefined);
});

describe("Gestión de avisos: cambiar fecha de publicación (prueba de caducidad)", () => {
  it("el superadmin ve el botón de cambiar fecha", async () => {
    render(<AdminListings role="superadmin" />);
    const btns = await screen.findAllByRole("button", { name: /Cambiar fecha/ });
    expect(btns.length).toBeGreaterThan(0);
  });

  it("el admin normal NO ve el botón (es solo herramienta de superadmin)", async () => {
    render(<AdminListings role="admin" />);
    // El aviso se pinta en la tabla (desktop) y en tarjetas (móvil): hay 2 nodos.
    await screen.findAllByText("Aviso 7 días");
    expect(screen.queryByRole("button", { name: /Cambiar fecha/ })).toBeNull();
  });

  it('"Simular vencimiento" envía una fecha que deja el aviso ya vencido', async () => {
    render(<AdminListings role="superadmin" />);
    const btns = await screen.findAllByRole("button", { name: /Cambiar fecha/ });
    fireEvent.click(btns[0]);

    const dialog = await screen.findByRole("dialog");
    // Preset que simula el vencimiento.
    fireEvent.click(within(dialog).getByRole("button", { name: /Simular vencimiento/ }));
    // El preview (fila "Estado resultante") debe anticipar el estado "Vencido".
    // Se acota a esa fila porque "Vencido" también aparece en la descripción.
    await waitFor(() => {
      const fila = within(dialog).getByText("Estado resultante:").closest("div");
      expect(fila).toHaveTextContent("Vencido");
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /Aplicar fecha/ }));

    await waitFor(() => expect(setListingPublishedAt).toHaveBeenCalledTimes(1));
    const [id, iso] = setListingPublishedAt.mock.calls[0] as [string, string];
    expect(id).toBe(LISTING);
    // Con la duración de 7 días, la vigencia resultante debe estar en el pasado.
    expect(new Date(iso).getTime() + DURATION_MS).toBeLessThan(Date.now());
  });
});
