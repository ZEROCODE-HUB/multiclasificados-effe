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
const fetchAdminUsers = vi.fn().mockResolvedValue({ data: [], real: true });
vi.mock("@/lib/admin", () => ({
  fetchAudienceCount: (...a: unknown[]) => fetchAudienceCount(...a),
  sendIndividualMessage: (...a: unknown[]) => sendIndividualMessage(...a),
  broadcastMessage: (...a: unknown[]) => broadcastMessage(...a),
  fetchCommStats: (...a: unknown[]) => fetchCommStats(...a),
  fetchAdminUsers: (...a: unknown[]) => fetchAdminUsers(...a),
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import AdminCommunications from "@/pages/admin/AdminCommunications";

const ANA = { id: "u-ana", full_name: "Ana García", email: "ana@correo.com", status: "active", verified: true, roles: "buscador", listings_count: 0, suspended_until: null, rating: 0, created_at: "2026-01-01" };

beforeEach(() => { vi.clearAllMocks(); fetchAudienceCount.mockResolvedValue(1234); fetchCommStats.mockResolvedValue({ today: 5, total: 42, recent: [] }); sendIndividualMessage.mockResolvedValue({ sent: 1, recipient: "Ana García" }); broadcastMessage.mockResolvedValue(1234); fetchAdminUsers.mockResolvedValue({ data: [ANA], real: true }); });

describe("AdminCommunications — envíos reales", () => {
  it("carga stats reales al montar y muestra el conteo de audiencia", async () => {
    render(<AdminCommunications role="superadmin" />);
    expect(await screen.findByText("Centro de mensajes")).toBeTruthy();
    // Stats reales de la tarjeta "Resumen de envíos".
    await waitFor(() => expect(fetchCommStats).toHaveBeenCalled());
    expect(await screen.findByText("42")).toBeTruthy(); // total histórico
    expect(screen.getByText("5")).toBeTruthy(); // enviadas hoy
    // Conteo de audiencia: ahora es fija ("buscador" = todos los usuarios).
    await waitFor(() => expect(fetchAudienceCount).toHaveBeenCalledWith("buscador"));
  });

  it("envío individual: busca, selecciona un usuario y envía con su id", async () => {
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");

    // Buscar por nombre/apellido/correo → dispara fetchAdminUsers (con debounce).
    fireEvent.change(screen.getByPlaceholderText(/nombre, apellido o correo/i), { target: { value: "ana" } });
    await waitFor(() => expect(fetchAdminUsers).toHaveBeenCalledWith({ search: "ana" }));

    // Seleccionar el resultado de la lista.
    fireEvent.click(await screen.findByText("ana@correo.com"));

    fireEvent.change(screen.getByPlaceholderText("Asunto del mensaje"), { target: { value: "Hola" } });
    fireEvent.change(screen.getByPlaceholderText(/Escribe el contenido/i), { target: { value: "Cuerpo del mensaje" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar mensaje/i }));

    // Se envía con el ID del usuario seleccionado, no con texto libre.
    await waitFor(() =>
      expect(sendIndividualMessage).toHaveBeenCalledWith("u-ana", "Hola", "Cuerpo del mensaje", false),
    );
  });

  it("bloquea el envío individual si no se ha seleccionado un destinatario", async () => {
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");
    fireEvent.click(screen.getByRole("button", { name: /Enviar mensaje/i }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(sendIndividualMessage).not.toHaveBeenCalled();
  });

  it("envío masivo llama a broadcastMessage con la audiencia fija y el flag de email/copia", async () => {
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

    // Sin selector: siempre "buscador" (= todos los usuarios reales).
    await waitFor(() =>
      expect(broadcastMessage).toHaveBeenCalledWith("buscador", "Campaña", "Contenido masivo", false, false),
    );
  });

  it("la copia al equipo interno solo se habilita si se envía por correo", async () => {
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");
    const masivoTab = screen.getByRole("tab", { name: /Masivo/i });
    fireEvent.mouseDown(masivoTab);
    fireEvent.focus(masivoTab);
    fireEvent.click(masivoTab);

    await screen.findByPlaceholderText("Título de la campaña");
    const checks = screen.getAllByRole("checkbox");
    // [0] = "enviar por correo", [1] = "copia al equipo interno".
    const copyStaff = checks[1];
    // Deshabilitado mientras el correo esté apagado.
    expect(copyStaff).toBeDisabled();
    // Al activar el correo, se habilita.
    fireEvent.click(checks[0]);
    await waitFor(() => expect(copyStaff).not.toBeDisabled());
    // Y al apagarlo de nuevo, vuelve a deshabilitarse.
    fireEvent.click(checks[0]);
    await waitFor(() => expect(copyStaff).toBeDisabled());
  });
});
