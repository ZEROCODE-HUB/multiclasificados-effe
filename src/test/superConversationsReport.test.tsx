import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { AdminReport } from "@/lib/admin";

// --- Mocks de la capa de datos ---
const fetchReports = vi.fn();
const assignReport = vi.fn();
const resolveReport = vi.fn();
const fetchAdminListing = vi.fn();

vi.mock("@/lib/admin", () => ({
  fetchReports: (...a: unknown[]) => fetchReports(...a),
  assignReport: (...a: unknown[]) => assignReport(...a),
  resolveReport: (...a: unknown[]) => resolveReport(...a),
  fetchAdminListing: (...a: unknown[]) => fetchAdminListing(...a),
  fetchConversationBetween: async () => [],
}));

const getUser = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: () => getUser() } } }));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a), useToast: () => ({ toast }) }));

import SuperConversations from "@/pages/superadmin/SuperConversations";

const MOD = "11111111-1111-4111-8111-111111111111";
const LISTING = "22222222-2222-4222-8222-222222222222";

const base: AdminReport = {
  id: "33333333-3333-4333-8333-333333333333",
  target_type: "listing", reason: "Posible estafa", category: null, status: "open",
  action_taken: null, reporter: "Ana", reported: "Luis",
  reporter_id: "44444444-4444-4444-8444-444444444444",
  reported_id: "55555555-5555-4555-8555-555555555555",
  listing_id: LISTING, listing_title: "Camioneta 4x4", assigned_to: null, assignee: null,
  created_at: "2026-07-01T00:00:00Z",
};

const conReporte = (r: Partial<AdminReport>) => {
  fetchReports.mockResolvedValue({ data: [{ ...base, ...r }], real: true });
};

/** Renderiza y abre la denuncia de la lista. */
const abrirDenuncia = async () => {
  render(<SuperConversations role="superadmin" />);
  const fila = await screen.findByRole("button", { name: /Ana → Luis/ });
  fireEvent.click(fila);
  await screen.findByText("Detalle de la denuncia");
};

const AVISO = {
  id: LISTING, title: "Casa", description: "Bonita casa en la sierra", price: 120000, currency: "PEN",
  condition: "Usado", category_id: "inmuebles", subcategory_id: null, location: "Áncash",
  status: "rejected", featured: false, urgent: false, views: 42,
  rejection_reason: "Removido por moderación", published_at: "2026-07-01T00:00:00Z",
  created_at: "2026-07-01T00:00:00Z", advertiser: "Oscar Mijael Pérez García",
  advertiser_id: "66666666-6666-4666-8666-666666666666", images: ["https://cdn/1.jpg"],
};

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: MOD } } });
  assignReport.mockResolvedValue(undefined);
  resolveReport.mockResolvedValue(undefined);
  fetchAdminListing.mockResolvedValue(AVISO);
  conReporte({});
});

const verAviso = () => fireEvent.click(screen.getByRole("button", { name: /Ver aviso/ }));

describe("denuncia sobre un aviso: el moderador ve el contenido reportado", () => {
  it("muestra la información del aviso sin sacar al moderador de la denuncia", async () => {
    await abrirDenuncia();
    verAviso();

    // Se pide el aviso denunciado, no otro.
    await waitFor(() => expect(fetchAdminListing).toHaveBeenCalledWith(LISTING));

    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("Bonita casa en la sierra");
    expect(dialogo).toHaveTextContent("Oscar Mijael Pérez García");
    expect(dialogo).toHaveTextContent("S/ 120,000.00");
    expect(dialogo).toHaveTextContent("42"); // vistas

    // La denuncia sigue detrás: no se navegó a ningún sitio.
    expect(screen.getByText("Detalle de la denuncia")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ver aviso/ })).toBeNull();
  });

  it("un aviso deshabilitado se ve igual, con su motivo de rechazo", async () => {
    await abrirDenuncia();
    verAviso();

    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("Rechazado");
    expect(dialogo).toHaveTextContent("Removido por moderación");
  });

  it("si el aviso ya no existe, lo dice en vez de quedarse cargando", async () => {
    fetchAdminListing.mockResolvedValue(null);
    await abrirDenuncia();
    verAviso();

    expect(await screen.findByText(/No se pudo cargar el aviso/)).toBeInTheDocument();
  });

  it("si el backend falla, tampoco se queda colgado", async () => {
    fetchAdminListing.mockRejectedValue(new Error("no autorizado"));
    await abrirDenuncia();
    verAviso();

    expect(await screen.findByText(/No se pudo cargar el aviso/)).toBeInTheDocument();
  });

  it("si la denuncia es sobre un usuario no hay aviso que ver", async () => {
    conReporte({ target_type: "user", listing_id: null, listing_title: null });
    await abrirDenuncia();

    expect(screen.queryByRole("button", { name: /Ver aviso/ })).toBeNull();
  });

  it("no ofrece el botón si el aviso no viene identificado", async () => {
    conReporte({ target_type: "listing", listing_id: null });
    await abrirDenuncia();

    expect(screen.queryByRole("button", { name: /Ver aviso/ })).toBeNull();
  });
});

describe('"Marcar en revisión" no se puede pulsar dos veces', () => {
  it("una denuncia ya en revisión deja el botón deshabilitado", async () => {
    conReporte({ status: "reviewing" });
    await abrirDenuncia();

    const btn = screen.getByRole("button", { name: "En revisión" });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(assignReport).not.toHaveBeenCalled();
  });

  it("una denuncia resuelta tampoco se puede marcar en revisión", async () => {
    conReporte({ status: "resolved", action_taken: "warn" });
    await abrirDenuncia();

    expect(screen.getByRole("button", { name: "Marcar en revisión" })).toBeDisabled();
  });

  it("el doble toque mientras la petición está en vuelo asigna una sola vez", async () => {
    let liberar!: () => void;
    assignReport.mockImplementation(() => new Promise<void>((r) => { liberar = () => r(); }));
    await abrirDenuncia();

    const btn = screen.getByRole("button", { name: "Marcar en revisión" });
    fireEvent.click(btn);
    fireEvent.click(btn); // el usuario impaciente
    fireEvent.click(btn);

    expect(assignReport).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(btn).toBeDisabled());

    liberar();
    await waitFor(() => expect(fetchReports).toHaveBeenCalledTimes(2)); // recarga tras resolver
  });

  it("asigna la denuncia al moderador con sesión, nunca al usuario denunciado", async () => {
    await abrirDenuncia();
    fireEvent.click(screen.getByRole("button", { name: "Marcar en revisión" }));

    await waitFor(() => expect(assignReport).toHaveBeenCalledWith(base.id, MOD));
  });

  it("sin sesión no asigna nada: antes la denuncia acababa asignada al denunciado", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await abrirDenuncia();

    fireEvent.click(screen.getByRole("button", { name: "Marcar en revisión" }));

    expect(assignReport).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });
});

describe('"Advertir usuario" llega al backend', () => {
  it("resuelve la denuncia con la acción warn, que es la que dispara la notificación", async () => {
    await abrirDenuncia();
    fireEvent.click(screen.getByRole("button", { name: "Advertir usuario" }));

    await waitFor(() => expect(resolveReport).toHaveBeenCalledWith(base.id, "warn", expect.any(String)));
  });

  it("si el backend falla, avisa y no canta éxito", async () => {
    resolveReport.mockRejectedValue(new Error("no autorizado"));
    await abrirDenuncia();
    fireEvent.click(screen.getByRole("button", { name: "Advertir usuario" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "No se pudo completar", variant: "destructive" })),
    );
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Usuario advertido" }));
  });
});
