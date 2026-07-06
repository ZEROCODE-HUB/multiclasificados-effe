import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Polyfills para Radix (Tabs/Select) en jsdom.
beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

// --- Mocks de la capa de datos ---
const fetchAudienceCount = vi.fn().mockResolvedValue(1234);
const sendIndividualMessage = vi.fn().mockResolvedValue({ sent: 1, recipient: "Ana García" });
const broadcastMessage = vi.fn().mockResolvedValue(1234);
const fetchCommStats = vi.fn().mockResolvedValue({ today: 5, total: 42, recent: [] });
vi.mock("@/lib/admin", () => ({
  fetchAudienceCount: (...a: unknown[]) => fetchAudienceCount(...a),
  sendIndividualMessage: (...a: unknown[]) => sendIndividualMessage(...a),
  broadcastMessage: (...a: unknown[]) => broadcastMessage(...a),
  fetchCommStats: (...a: unknown[]) => fetchCommStats(...a),
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import AdminCommunications from "@/pages/admin/AdminCommunications";

beforeEach(() => { vi.clearAllMocks(); fetchAudienceCount.mockResolvedValue(1234); fetchCommStats.mockResolvedValue({ today: 5, total: 42, recent: [] }); sendIndividualMessage.mockResolvedValue({ sent: 1, recipient: "Ana García" }); broadcastMessage.mockResolvedValue(1234); });

describe("AdminCommunications — envíos reales", () => {
  it("carga stats reales al montar y muestra el conteo de audiencia", async () => {
    render(<AdminCommunications role="superadmin" />);
    expect(await screen.findByText("Centro de mensajes")).toBeTruthy();
    // Stats reales de la tarjeta "Resumen de envíos".
    await waitFor(() => expect(fetchCommStats).toHaveBeenCalled());
    expect(await screen.findByText("42")).toBeTruthy(); // total histórico
    expect(screen.getByText("5")).toBeTruthy(); // enviadas hoy
    // Conteo de audiencia (audiencia por defecto "all").
    await waitFor(() => expect(fetchAudienceCount).toHaveBeenCalledWith("all"));
  });

  it("envío individual llama a sendIndividualMessage con los datos correctos", async () => {
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");

    fireEvent.change(screen.getByPlaceholderText(/destinatario/i), { target: { value: "ana@correo.com" } });
    fireEvent.change(screen.getByPlaceholderText("Asunto del mensaje"), { target: { value: "Hola" } });
    fireEvent.change(screen.getByPlaceholderText(/Escribe el contenido/i), { target: { value: "Cuerpo del mensaje" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar mensaje/i }));

    await waitFor(() =>
      expect(sendIndividualMessage).toHaveBeenCalledWith("ana@correo.com", "Hola", "Cuerpo del mensaje", false),
    );
  });

  it("bloquea el envío individual si falta el destinatario", async () => {
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");
    fireEvent.click(screen.getByRole("button", { name: /Enviar mensaje/i }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(sendIndividualMessage).not.toHaveBeenCalled();
  });

  it("envío masivo llama a broadcastMessage con la audiencia y el flag de email/copia", async () => {
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");
    // Radix Tabs selecciona en mousedown/focus (no en click) — jsdom.
    const masivoTab = screen.getByRole("tab", { name: /Masivo/i });
    fireEvent.mouseDown(masivoTab);
    fireEvent.focus(masivoTab);
    fireEvent.click(masivoTab);

    fireEvent.change(await screen.findByPlaceholderText("Título de la campaña"), { target: { value: "Campaña" } });
    fireEvent.change(screen.getByPlaceholderText(/Mensaje masivo/i), { target: { value: "Contenido masivo" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar a/i }));

    await waitFor(() =>
      expect(broadcastMessage).toHaveBeenCalledWith("all", "Campaña", "Contenido masivo", false, false),
    );
  });
});
