import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { prepararDom } from "./domPolyfills";

/**
 * PULSAR UNA NOTIFICACIÓN DE MENSAJE ESTANDO YA EN MENSAJES.
 *
 * Es el caso más probable de todos —el aviso de "mensaje nuevo" llega mientras
 * estás leyendo mensajes— y era el único que no funcionaba.
 *
 * La conversación abierta se guardaba en un estado inicializado con
 * `useState(params.get("c"))`, o sea que el parámetro solo se leía AL MONTAR. Al
 * pulsar la campana, React Router cambiaba la URL pero no remontaba la pantalla:
 * el estado seguía en el chat anterior y no pasaba absolutamente nada. El
 * usuario pulsaba, veía que la URL cambiaba y el chat no.
 *
 * Ahora la conversación abierta se DERIVA de la URL, que además ya era la fuente
 * de verdad de abrir y cerrar un chat.
 */

beforeEach(() => {
  prepararDom();
  if (!Element.prototype.scrollTo) {
    (Element.prototype as Element & { scrollTo: () => void }).scrollTo = () => {};
  }
});

const { CONVS } = vi.hoisted(() => ({
  CONVS: [
    {
      id: "conv-1", listing_id: "lst-1", buyer_id: "me", seller_id: "other-1",
      last_message: "Hola", last_message_at: "2026-09-01T10:00:00Z",
      listing_title: "Toyota Yaris 2019", listing_category: "vehiculos",
      counterpart_id: "other-1", counterpart_name: "Ana García", unread: 0,
    },
    {
      id: "conv-2", listing_id: "lst-2", buyer_id: "me", seller_id: "other-2",
      last_message: "¿Sigue disponible?", last_message_at: "2026-09-02T10:00:00Z",
      listing_title: "Depa en Miraflores", listing_category: "inmuebles",
      counterpart_id: "other-2", counterpart_name: "Luis Pérez", unread: 1,
    },
  ],
}));

const fetchMessages = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/messaging", () => ({
  fetchConversations: vi.fn().mockResolvedValue(CONVS),
  fetchMessages: (...a: unknown[]) => fetchMessages(...a),
  sendMessage: vi.fn(),
  markDelivered: vi.fn(),
  markRead: vi.fn().mockResolvedValue(undefined),
  subscribeToMessages: vi.fn(() => null),
  subscribeToConversations: vi.fn(() => null),
  unsubscribe: vi.fn(),
  getCurrentUserId: vi.fn().mockResolvedValue("me"),
}));

vi.mock("@/lib/reports", () => ({
  reportUser: vi.fn(), USER_REPORT_REASONS: ["Spam"],
}));
vi.mock("@/lib/pricing", () => ({ loadSold: () => ({}), markSold: vi.fn(), unmarkSold: vi.fn() }));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import MessagesPage from "@/pages/shared/MessagesPage";

/** Hace de campana: navega a otra conversación SIN remontar la pantalla. */
function CampanaFalsa() {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate("/dashboard/buscador/mensajes?c=conv-2")}>
      NOTIFICACION_CONV_2
    </button>
  );
}

const abrir = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <CampanaFalsa />
      <Routes>
        <Route path="/dashboard/buscador/mensajes" element={<MessagesPage role="buscador" />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => fetchMessages.mockClear());

describe("llegar con ?c= desde la campana", () => {
  it("abre la conversación que dice la URL", async () => {
    abrir("/dashboard/buscador/mensajes?c=conv-1");
    await waitFor(() => expect(fetchMessages).toHaveBeenCalledWith("conv-1"));
  });

  it("y si ya estabas dentro, CAMBIA a la conversación de la notificación", async () => {
    // Este es el fallo. La ruta no cambia —sigue siendo /mensajes—, así que la
    // pantalla no se remonta: solo cambia `?c=`. Antes eso no hacía nada.
    abrir("/dashboard/buscador/mensajes?c=conv-1");
    await waitFor(() => expect(fetchMessages).toHaveBeenCalledWith("conv-1"));

    fireEvent.click(screen.getByText("NOTIFICACION_CONV_2"));

    await waitFor(() => expect(fetchMessages).toHaveBeenCalledWith("conv-2"));
  });

  it("sin ?c= no se abre ninguna: se ve la lista", async () => {
    abrir("/dashboard/buscador/mensajes");
    await screen.findByText("Ana García");
    expect(fetchMessages).not.toHaveBeenCalled();
  });
});

describe("abrir y cerrar a mano sigue funcionando", () => {
  it("elegir una conversación de la lista la abre", async () => {
    abrir("/dashboard/buscador/mensajes");
    fireEvent.click(await screen.findByText("Luis Pérez"));
    await waitFor(() => expect(fetchMessages).toHaveBeenCalledWith("conv-2"));
  });
});
