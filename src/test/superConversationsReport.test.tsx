import { describe, it, expect, vi, beforeEach } from "vitest";
/**
 * "Usuarios reportados" — denuncias contra PERSONAS.
 *
 * Hasta el 1-sep-2026 esta pantalla enseñaba también las denuncias de avisos,
 * que salían igualmente en Gestión de avisos → Reportados con acciones
 * distintas. Se repartieron: los avisos allí, las personas aquí. Lo que cubría
 * el bloque "el moderador ve el aviso denunciado" vive ahora en
 * `adminListingsReported.test.tsx`.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { AdminReport } from "@/lib/admin";
import { prepararDom } from "./domPolyfills";

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
  target_type: "user", reason: "Posible estafador", category: "Posible estafador", status: "open",
  action_taken: null, reporter: "Ana", reported: "Luis",
  reporter_id: "44444444-4444-4444-8444-444444444444",
  reported_id: "55555555-5555-4555-8555-555555555555",
  listing_id: null, listing_title: null, assigned_to: null, assignee: null,
  created_at: "2026-07-01T00:00:00Z",
};

// Una denuncia de AVISO, para comprobar que aquí no entra.
const DE_AVISO: AdminReport = {
  ...base,
  id: "77777777-7777-4777-8777-777777777777",
  target_type: "listing", reason: "Precio incorrecto", category: "Precio incorrecto",
  reporter: "Carmen", reported: "Marta",
  listing_id: LISTING, listing_title: "Camioneta 4x4",
};

const conReportes = (...rs: AdminReport[]) => {
  fetchReports.mockResolvedValue({ data: rs, real: true });
};

const conReporte = (r: Partial<AdminReport>) => conReportes({ ...base, ...r });

/** Renderiza y abre la denuncia de la lista. */
const abrirDenuncia = async () => {
  render(<SuperConversations role="superadmin" />);
  const fila = await screen.findByRole("button", { name: /Ana → Luis/ });
  fireEvent.click(fila);
  await screen.findByText("Detalle del reporte");
};

beforeEach(() => {
  prepararDom();
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: MOD } } });
  assignReport.mockResolvedValue(undefined);
  resolveReport.mockResolvedValue(undefined);
  conReporte({});
});

describe("aquí solo se moderan personas", () => {
  it("una denuncia de aviso no aparece en esta pantalla", async () => {
    // Salía en las dos, con acciones distintas y nada que dijera cuál era la
    // buena. Los avisos se moderan en Gestión de avisos → Reportados.
    conReportes(base, DE_AVISO);
    render(<SuperConversations role="superadmin" />);

    expect(await screen.findByRole("button", { name: /Ana → Luis/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Carmen → Marta/ })).toBeNull();
  });

  it("y ya no ofrece ver el aviso, que aquí no venía a cuento", async () => {
    await abrirDenuncia();
    expect(screen.queryByRole("button", { name: /Ver aviso/ })).toBeNull();
  });

  it("el contador dice lo que queda por mirar, no el histórico", async () => {
    conReportes(
      base,
      { ...base, id: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1", status: "reviewing" },
      { ...base, id: "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2", status: "resolved" },
    );
    render(<SuperConversations role="superadmin" />);
    expect(await screen.findByText("2 sin cerrar")).toBeInTheDocument();
  });
});

describe("filtrar por estado", () => {
  const TRES = [
    { ...base, reporter: "Ana" },
    { ...base, id: "bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1", reporter: "Berta", status: "reviewing" },
    { ...base, id: "bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2", reporter: "Carla", status: "resolved" },
  ];

  const elegir = async (opcion: string) => {
    // El Select de Radix se abre con click en el trigger, no con keyDown.
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: opcion }));
  };

  it("se puede quedar solo con las abiertas", async () => {
    // Antes no había filtro: la lista mezclaba resueltas y abiertas y solo se
    // podía buscar por texto.
    conReportes(...TRES);
    render(<SuperConversations role="superadmin" />);
    await screen.findByRole("button", { name: /Ana →/ });

    await elegir("Abierto");

    expect(screen.getByRole("button", { name: /Ana →/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Berta →/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Carla →/ })).toBeNull();
  });

  it("y con las resueltas, para consultar lo ya hecho", async () => {
    conReportes(...TRES);
    render(<SuperConversations role="superadmin" />);
    await screen.findByRole("button", { name: /Ana →/ });

    await elegir("Resuelto");

    expect(screen.getByRole("button", { name: /Carla →/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ana →/ })).toBeNull();
  });

  it("si el filtro deja la lista vacía, lo dice sin fingir que no hay nada", async () => {
    conReportes(base);
    render(<SuperConversations role="superadmin" />);
    await screen.findByRole("button", { name: /Ana →/ });

    await elegir("Resuelto");

    expect(screen.getByText("Ninguno con ese estado.")).toBeInTheDocument();
    expect(screen.queryByText("No hay usuarios reportados.")).toBeNull();
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
