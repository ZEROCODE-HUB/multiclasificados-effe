import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Polyfills para Radix (Dialog) y recharts en jsdom.
beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

// `vi.mock` se iza al tope del archivo: las constantes que usa su factory deben
// crearse con `vi.hoisted` para existir antes.
const { LISTING_ACTIVITY, USER_ACTIVITY } = vi.hoisted(() => ({
  LISTING_ACTIVITY: {
    who: "Ana García", action: "publicó el aviso", target: "Toyota Yaris 2019",
    at: "2026-07-01T15:30:00Z", time: "hace 2 h",
    entityType: "listing", entityId: "24d479cf-52ce-40f4-b634-886eae34a7df",
  },
  USER_ACTIVITY: {
    who: "admin@effe.com", action: "suspendió", target: "user 99",
    at: "2026-07-01T10:00:00Z", time: "hace 7 h",
    entityType: "user", entityId: "99",
  },
}));

vi.mock("@/lib/admin", () => ({
  fetchAdminStats: vi.fn().mockResolvedValue({ data: null }),
  fetchGrowthSeries: vi.fn().mockResolvedValue([]),
  fetchCategoryDistribution: vi.fn().mockResolvedValue([]),
  fetchAdminListings: vi.fn().mockResolvedValue({ data: [] }),
  fetchRecentActivity: vi.fn().mockResolvedValue({ data: [LISTING_ACTIVITY, USER_ACTIVITY], real: true }),
}));

// Si el dashboard intentara navegar, lo detectamos aquí.
const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, useNavigate: () => navigate };
});

import AdminDashboard from "@/pages/admin/AdminDashboard";

beforeEach(() => vi.clearAllMocks());

const verButtons = () => screen.getAllByRole("button", { name: /ver detalle de la actividad/i });

describe("AdminDashboard — Actividad reciente: 'Ver' muestra el detalle sin salir del panel admin", () => {
  it("al pulsar 'Ver' en la actividad de un aviso NO navega y abre el detalle", async () => {
    render(<AdminDashboard role="admin" />);
    await screen.findByText("Toyota Yaris 2019");

    fireEvent.click(verButtons()[0]);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Detalle de la actividad");
    // Nunca se sale del panel admin (ni a /aviso/:id ni al panel del usuario).
    expect(navigate).not.toHaveBeenCalled();
  });

  it("el detalle muestra responsable, acción, objetivo, tipo e identificador", async () => {
    render(<AdminDashboard role="admin" />);
    await screen.findByText("Toyota Yaris 2019");

    fireEvent.click(verButtons()[0]);
    const dialog = await screen.findByRole("dialog");

    expect(dialog).toHaveTextContent("Ana García");
    expect(dialog).toHaveTextContent("publicó el aviso");
    expect(dialog).toHaveTextContent("Toyota Yaris 2019");
    expect(dialog).toHaveTextContent("Aviso"); // entityType traducido
    expect(dialog).toHaveTextContent("24d479cf-52ce-40f4-b634-886eae34a7df");
    expect(dialog).toHaveTextContent("hace 2 h");
  });

  it("una actividad de tipo 'user' tampoco navega al panel del usuario", async () => {
    render(<AdminDashboard role="admin" />);
    await screen.findByText("user 99");

    fireEvent.click(verButtons()[1]);
    const dialog = await screen.findByRole("dialog");

    expect(dialog).toHaveTextContent("admin@effe.com");
    expect(dialog).toHaveTextContent("Usuario"); // etiqueta del tipo
    expect(navigate).not.toHaveBeenCalled();
  });

  it("se cierra con el botón Cerrar", async () => {
    render(<AdminDashboard role="admin" />);
    await screen.findByText("Toyota Yaris 2019");

    fireEvent.click(verButtons()[0]);
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: /cerrar/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(navigate).not.toHaveBeenCalled();
  });
});
