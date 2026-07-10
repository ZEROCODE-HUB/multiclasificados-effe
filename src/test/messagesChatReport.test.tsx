import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Polyfills para Radix (Dialog / Select) en jsdom.
beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
  if (!Element.prototype.scrollTo) (Element.prototype as any).scrollTo = () => {};
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

const { CONV } = vi.hoisted(() => ({
  CONV: {
    id: "conv-1", listing_id: "lst-1", buyer_id: "me", seller_id: "other",
    last_message: "Hola", last_message_at: "2026-07-09T10:00:00Z",
    listing_title: "Toyota Yaris 2019", listing_category: "vehiculos",
    counterpart_id: "other", counterpart_name: "Ana García", unread: 0,
  },
}));

vi.mock("@/lib/messaging", () => ({
  fetchConversations: vi.fn().mockResolvedValue([CONV]),
  fetchMessages: vi.fn().mockResolvedValue([]),
  sendMessage: vi.fn(),
  markDelivered: vi.fn(),
  markRead: vi.fn().mockResolvedValue(undefined),
  subscribeToMessages: vi.fn(() => null),
  subscribeToConversations: vi.fn(() => null),
  unsubscribe: vi.fn(),
  getCurrentUserId: vi.fn().mockResolvedValue("me"),
}));

const reportUser = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/reports", () => ({
  reportUser: (...a: unknown[]) => reportUser(...a),
  USER_REPORT_REASONS: ["Posible estafador", "Spam o mensajes no deseados"],
}));

vi.mock("@/lib/pricing", () => ({ loadSold: () => ({}), markSold: vi.fn() }));

// Captura las props con las que la página monta su layout: el arreglo del
// scroll en escritorio depende de que pida `fullHeight`.
const layoutProps: Record<string, unknown>[] = [];
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children, ...rest }: { children: React.ReactNode }) => {
    layoutProps.push(rest);
    return <div>{children}</div>;
  },
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import MessagesPage from "@/pages/shared/MessagesPage";

beforeEach(() => { reportUser.mockClear(); toast.mockClear(); layoutProps.length = 0; });

const renderChat = () =>
  render(
    <MemoryRouter initialEntries={["/dashboard/buscador/mensajes?c=conv-1"]}>
      <MessagesPage role="buscador" />
    </MemoryRouter>,
  );

describe("Chat del usuario — reportar al otro participante", () => {
  it("la conversación abierta ofrece un icono para reportar", async () => {
    renderChat();
    expect(await screen.findByRole("button", { name: /reportar a ana garcía/i })).toBeInTheDocument();
  });

  it("envía el reporte contra el ID del otro participante, no contra el aviso", async () => {
    renderChat();
    fireEvent.click(await screen.findByRole("button", { name: /reportar a ana garcía/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Reportar usuario");

    // Sin motivo elegido no se puede enviar.
    const enviar = screen.getByRole("button", { name: /enviar reporte/i });
    expect(enviar).toBeDisabled();

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Posible estafador"));

    fireEvent.change(screen.getByLabelText(/detalle/i), { target: { value: "Me pidió pagar por adelantado" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar reporte/i }));

    await waitFor(() =>
      expect(reportUser).toHaveBeenCalledWith("other", "Posible estafador", "Me pidió pagar por adelantado"),
    );
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Usuario reportado" })));
  });

  it("si el reporte falla, avisa y no cierra en silencio", async () => {
    reportUser.mockRejectedValueOnce(new Error("Debes iniciar sesión para reportar."));
    renderChat();
    fireEvent.click(await screen.findByRole("button", { name: /reportar a ana garcía/i }));
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Posible estafador"));
    fireEvent.click(screen.getByRole("button", { name: /enviar reporte/i }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "No se pudo reportar", variant: "destructive" })),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Chat en escritorio — la página no scrollea, el chat sí", () => {
  it("pide el layout a altura completa", async () => {
    renderChat();
    await screen.findByText("Toyota Yaris 2019");
    expect(layoutProps[0]).toMatchObject({ fullHeight: true });
  });

  it("el alto del chat lo cede el layout, no un número mágico", async () => {
    const { container } = renderChat();
    await screen.findByText("Toyota Yaris 2019");

    const grid = container.querySelector(".grid") as HTMLElement;
    // Un `100vh - Xrem` codificado a mano se desincroniza en cuanto cambia el
    // cromo de la página: fue justo lo que dejó el campo de escritura fuera de pantalla.
    expect(grid.className).not.toMatch(/lg:h-\[calc/);
    expect(grid.className).toContain("lg:flex-1");
    expect(grid.className).toContain("lg:min-h-0");
  });

  it("no repite el <h1> 'Mensajes' que ya pinta la cabecera del layout", async () => {
    renderChat();
    await screen.findByText("Toyota Yaris 2019");
    // El h3 de la lista de conversaciones (solo móvil) sigue ahí; el h1 duplicado no.
    expect(screen.queryByRole("heading", { level: 1, name: /mensajes/i })).not.toBeInTheDocument();
  });
});
