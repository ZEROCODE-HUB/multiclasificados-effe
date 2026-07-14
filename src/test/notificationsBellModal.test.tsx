import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Al hacer clic en una notificación:
//  - si lleva a otra pantalla (mensaje → chat) → redirige (ya existía).
//  - si es informativa (mensaje del equipo, advertencia…) → abre un MODAL con
//    su contenido, sin sacar al usuario de donde está.

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
  vi.clearAllMocks();
});

// vi.mock se iza al tope; NOTIFS/markRead deben existir antes vía vi.hoisted.
const { NOTIFS, markRead } = vi.hoisted(() => ({
  NOTIFS: [
    { id: "n1", type: "admin_message", title: "Aviso del equipo", payload: { body: "Mantenimiento el domingo" }, read_at: null, created_at: new Date().toISOString() },
    { id: "n2", type: "new_message", title: "Nuevo mensaje", payload: { conversation_id: "c9", preview: "Hola" }, read_at: null, created_at: new Date().toISOString() },
  ],
  markRead: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual, // notificationText / notificationLink REALES
    fetchNotifications: vi.fn().mockResolvedValue(NOTIFS),
    fetchUnreadNotifications: vi.fn().mockResolvedValue(2),
    markNotificationRead: (...a: unknown[]) => markRead(...a),
    markAllNotificationsRead: vi.fn(),
    subscribeToNotifications: vi.fn(() => null),
    unsubscribeNotifications: vi.fn(),
    getMyUserId: vi.fn().mockResolvedValue("u1"),
  };
});

// El menú Radix (portal + pointer events) no abre de forma fiable en jsdom;
// lo renderizamos inline para poder clicar las notificaciones directamente.
// El MODAL de detalle sigue siendo el Dialog real (lo que queremos verificar).
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ supabase: true, role: "buscador", name: "Ana", initials: "A" }),
}));

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

import { NotificationsBell } from "@/components/NotificationsBell";

const openBell = async () => {
  render(<NotificationsBell />);
  // La lista se renderiza inline (menú mockeado); esperamos a que cargue.
  await screen.findByText("Aviso del equipo");
};

describe("NotificationsBell — modal vs. redirección", () => {
  it("una notificación informativa (mensaje del equipo) abre un MODAL y NO redirige", async () => {
    await openBell();

    fireEvent.click(screen.getByText("Aviso del equipo"));

    // El contenido completo aparece en el modal.
    await waitFor(() => expect(screen.getByText("Mantenimiento el domingo")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /entendido/i })).toBeInTheDocument();
    // No se navegó a ninguna pantalla.
    expect(navigate).not.toHaveBeenCalled();
    // Se marcó como leída.
    expect(markRead).toHaveBeenCalledWith("n1");
  });

  it("una notificación de mensaje redirige al chat y NO abre modal", async () => {
    await openBell();

    fireEvent.click(screen.getByText("Nuevo mensaje"));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/dashboard/buscador/mensajes?c=c9"),
    );
    expect(screen.queryByRole("button", { name: /entendido/i })).not.toBeInTheDocument();
  });
});
