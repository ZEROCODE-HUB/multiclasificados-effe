import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { prepararDom } from "./domPolyfills";

/**
 * En un aviso confidencial, al comprador se le muestra el CORREO del anunciante
 * en vez de su nombre: es la vía de contacto que eligió. Eso es a propósito.
 *
 * Lo que no era a propósito es que iOS lo convirtiera solo en un enlace: tocarlo
 * abría Gmail y sacaba a la persona de la aplicación en mitad de la
 * conversación. El correo se sigue viendo entero; lo que no puede haber es un
 * enlace, ni un texto que el detector de iOS reconozca de una pieza.
 */

beforeEach(() => {
  prepararDom();
  if (!Element.prototype.scrollTo) {
    (Element.prototype as Element & { scrollTo: () => void }).scrollTo = () => {};
  }
});

const { CONV } = vi.hoisted(() => ({
  CONV: {
    id: "conv-1", listing_id: "lst-1", buyer_id: "me", seller_id: "other",
    last_message: "Hola", last_message_at: "2026-08-17T10:00:00Z",
    listing_title: "hyundai tucson 2020", listing_category: "vehiculos",
    counterpart_id: "other",
    counterpart_name: "andres.gz.mr@gmail.com",
    counterpart_is_email: true,
    unread: 0,
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
vi.mock("@/lib/reports", () => ({ reportUser: vi.fn(), USER_REPORT_REASONS: ["Spam"] }));
vi.mock("@/lib/pricing", () => ({ loadSold: () => ({}), markSold: vi.fn(), unmarkSold: vi.fn() }));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import MessagesPage from "@/pages/shared/MessagesPage";

const montar = () => render(<MemoryRouter><MessagesPage /></MemoryRouter>);

describe("el correo del anunciante en un aviso confidencial", () => {
  it("se ve entero", async () => {
    const { container } = montar();
    await waitFor(() =>
      expect(container.textContent).toContain("andres.gz.mr@gmail.com"),
    );
  });

  it("no es un enlace: tocarlo no abre el correo", async () => {
    const { container } = montar();
    await waitFor(() => expect(container.textContent).toContain("andres.gz.mr@gmail.com"));

    for (const a of Array.from(container.querySelectorAll("a"))) {
      expect(a.getAttribute("href") ?? "").not.toMatch(/^mailto:/i);
      expect(a.textContent ?? "").not.toContain("@gmail.com");
    }
  });

  it("no queda escrito de una pieza, que es lo que busca el detector de iOS", async () => {
    const { container } = montar();
    await waitFor(() => expect(container.textContent).toContain("andres.gz.mr@gmail.com"));

    // Ningún nodo de texto contiene el correo completo: va partido en varios.
    const recorrer = (n: Node): string[] =>
      n.nodeType === Node.TEXT_NODE
        ? [n.textContent ?? ""]
        : Array.from(n.childNodes).flatMap(recorrer);

    for (const trozo of recorrer(container)) {
      expect(trozo).not.toContain("andres.gz.mr@gmail.com");
    }
  });

  it("un nombre normal se sigue mostrando de una pieza", async () => {
    const { fetchConversations } = await import("@/lib/messaging");
    (fetchConversations as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...CONV, counterpart_name: "Ana García", counterpart_is_email: false },
    ]);
    montar();
    // Si se hubiera partido, getByText no lo encontraría.
    expect(await screen.findAllByText("Ana García")).not.toHaveLength(0);
  });
});
