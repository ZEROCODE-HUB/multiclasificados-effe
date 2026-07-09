import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { AdminReport } from "@/lib/admin";

// --- Mocks de la capa de datos ---
const fetchReports = vi.fn();
const assignReport = vi.fn();
const resolveReport = vi.fn();

vi.mock("@/lib/admin", () => ({
  fetchReports: (...a: unknown[]) => fetchReports(...a),
  assignReport: (...a: unknown[]) => assignReport(...a),
  resolveReport: (...a: unknown[]) => resolveReport(...a),
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

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: MOD } } });
  assignReport.mockResolvedValue(undefined);
  resolveReport.mockResolvedValue(undefined);
  conReporte({});
});

describe('denuncia sobre un aviso: acceso al contenido reportado', () => {
  it('ofrece "Ver aviso" apuntando al aviso denunciado, en otra pestaña', async () => {
    await abrirDenuncia();

    const link = screen.getByRole("link", { name: /Ver aviso/ });
    expect(link).toHaveAttribute("href", `/aviso/${LISTING}`);
    expect(link).toHaveAttribute("target", "_blank");
    // Sin esto la pestaña nueva podría manipular la del panel.
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it('si la denuncia es sobre un usuario no hay aviso que ver', async () => {
    conReporte({ target_type: "user", listing_id: null, listing_title: null });
    await abrirDenuncia();

    expect(screen.queryByRole("link", { name: /Ver aviso/ })).toBeNull();
  });

  it('no ofrece el enlace si el aviso no viene identificado', async () => {
    conReporte({ target_type: "listing", listing_id: null });
    await abrirDenuncia();

    expect(screen.queryByRole("link", { name: /Ver aviso/ })).toBeNull();
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
