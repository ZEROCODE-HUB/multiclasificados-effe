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

// Las categorías reales de la plataforma vienen de la BD; aquí basta con tres.
vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => [
    { id: "inmuebles", name: "Inmuebles", icon: () => null, conditionEnabled: false, imageUrl: null },
    { id: "vehiculos", name: "Vehículos", icon: () => null, conditionEnabled: true, imageUrl: null },
    { id: "empleos", name: "Empleos", icon: () => null, conditionEnabled: false, imageUrl: null },
  ],
}));

import AdminCommunications from "@/pages/admin/AdminCommunications";

/** Abre la pestaña Masivo. Radix Tabs cambia en mousedown/focus, no en click. */
const abrirMasivo = async () => {
  const tab = screen.getByRole("tab", { name: /Masivo/i });
  fireEvent.mouseDown(tab);
  fireEvent.focus(tab);
  fireEvent.click(tab);
  await screen.findByPlaceholderText("Título de la campaña");
};

/** Marca la casilla de una categoría por su nombre. */
const marcarCategoria = (nombre: string) =>
  fireEvent.click(screen.getByRole("checkbox", { name: nombre }));

/** El último filtro con el que se pidió el conteo. */
const ultimoFiltro = () => fetchAudienceCount.mock.calls.at(-1)![1];

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
    // Conteo de audiencia: de entrada, todos los usuarios y sin filtros.
    await waitFor(() => expect(fetchAudienceCount).toHaveBeenCalled());
    expect(fetchAudienceCount.mock.calls[0][0]).toBe("buscador");
    expect(ultimoFiltro()).toMatchObject({ categories: [], onlyActive: false, copyStaff: false });
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

  it("envío masivo llama a broadcastMessage con la audiencia y el filtro", async () => {
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");
    await abrirMasivo();

    fireEvent.change(screen.getByPlaceholderText("Título de la campaña"), { target: { value: "Campaña" } });
    fireEvent.change(screen.getByPlaceholderText(/Mensaje masivo/i), { target: { value: "Contenido masivo" } });
    // El botón está apagado hasta que se sabe a cuántos va: enviar a ciegas es
    // justo lo que no debe poder hacerse.
    await waitFor(() => expect(screen.getByRole("button", { name: /Enviar a/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Enviar a/i }));

    // Por defecto: todos los usuarios reales, sin filtro de categoría.
    await waitFor(() =>
      expect(broadcastMessage).toHaveBeenCalledWith(
        "buscador", "Campaña", "Contenido masivo", false,
        expect.objectContaining({ categories: [], onlyActive: false, copyStaff: false }),
      ),
    );
  });

  it("la copia al equipo interno solo se habilita si se envía por correo", async () => {
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");
    await abrirMasivo();

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

  it("el contador del masivo suma al equipo interno cuando se activa la copia", async () => {
    // El conteo lo resuelve la BD con el mismo filtro que el envío; aquí se
    // simula que con la copia hay 13 destinatarios más.
    fetchAudienceCount.mockImplementation((_a: string, f: { copyStaff?: boolean }) =>
      Promise.resolve(f?.copyStaff ? 72 : 59));
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");
    await abrirMasivo();

    // Sin copia: solo la base.
    expect(await screen.findByRole("button", { name: /Enviar a 59/i })).toBeTruthy();

    // Activar correo y luego la copia → el contador incluye al staff.
    const checks = screen.getAllByRole("checkbox");
    fireEvent.click(checks[0]); // correo
    fireEvent.click(checks[1]); // copia al equipo interno
    await waitFor(() => expect(screen.getByRole("button", { name: /Enviar a 72/i })).toBeTruthy());
  });
});

/**
 * Segmentar el masivo por categoría.
 *
 * Lo que se juega aquí es a quién le llega un correo. Un filtro que se ve
 * aplicado pero no viaja a la base de datos manda la campaña a TODA la
 * plataforma, y eso no se puede deshacer.
 */
describe("AdminCommunications — a quién va el masivo", () => {
  it("de entrada va a todos los usuarios, sin pedir categorías", async () => {
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");
    await abrirMasivo();

    expect(screen.getByLabelText("Todos los usuarios")).toBeChecked();
    // Las categorías ni aparecen mientras no se pidan.
    expect(screen.queryByRole("checkbox", { name: "Inmuebles" })).toBeNull();
  });

  it("al elegir por categoría, el filtro viaja a la consulta", async () => {
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");
    await abrirMasivo();

    fireEvent.click(screen.getByLabelText(/Quienes publicaron/i));
    marcarCategoria("Inmuebles");

    await waitFor(() => expect(ultimoFiltro()).toMatchObject({ categories: ["inmuebles"] }));
  });

  it("se pueden marcar varias categorías a la vez", async () => {
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");
    await abrirMasivo();

    fireEvent.click(screen.getByLabelText(/Quienes publicaron/i));
    marcarCategoria("Inmuebles");
    marcarCategoria("Vehículos");

    await waitFor(() => expect(ultimoFiltro().categories).toEqual(["inmuebles", "vehiculos"]));
  });

  it("desmarcar una categoría la quita del filtro", async () => {
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");
    await abrirMasivo();

    fireEvent.click(screen.getByLabelText(/Quienes publicaron/i));
    marcarCategoria("Inmuebles");
    marcarCategoria("Vehículos");
    await waitFor(() => expect(ultimoFiltro().categories).toHaveLength(2));

    marcarCategoria("Inmuebles");
    await waitFor(() => expect(ultimoFiltro().categories).toEqual(["vehiculos"]));
  });

  it("por defecto solo los anunciantes con aviso vigente", async () => {
    // Es la opción prudente: escribirle a quien tiene algo publicado ahora.
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");
    await abrirMasivo();

    fireEvent.click(screen.getByLabelText(/Quienes publicaron/i));
    marcarCategoria("Empleos");

    await waitFor(() => expect(ultimoFiltro()).toMatchObject({ onlyActive: true }));
  });

  it("se puede ampliar a todos los que publicaron ahí alguna vez", async () => {
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");
    await abrirMasivo();

    fireEvent.click(screen.getByLabelText(/Quienes publicaron/i));
    marcarCategoria("Empleos");
    fireEvent.click(screen.getByLabelText(/alguna vez/i));

    await waitFor(() => expect(ultimoFiltro()).toMatchObject({ onlyActive: false }));
  });

  it("volver a «todos los usuarios» limpia el filtro de categoría", async () => {
    // Si las categorías marcadas siguieran contando al volver atrás, la campaña
    // saldría segmentada sin que se vea ningún filtro en pantalla.
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");
    await abrirMasivo();

    fireEvent.click(screen.getByLabelText(/Quienes publicaron/i));
    marcarCategoria("Inmuebles");
    await waitFor(() => expect(ultimoFiltro().categories).toEqual(["inmuebles"]));

    fireEvent.click(screen.getByLabelText("Todos los usuarios"));
    await waitFor(() => expect(ultimoFiltro()).toMatchObject({ categories: [], onlyActive: false }));
  });

  it("sin ninguna categoría marcada no deja enviar", async () => {
    // "Por categoría" sin categorías no es una audiencia vacía: es una pregunta
    // a medias. Enviar aquí habría ido a toda la plataforma.
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");
    await abrirMasivo();

    fireEvent.change(screen.getByPlaceholderText("Título de la campaña"), { target: { value: "Campaña" } });
    fireEvent.change(screen.getByPlaceholderText(/Mensaje masivo/i), { target: { value: "Contenido" } });
    fireEvent.click(screen.getByLabelText(/Quienes publicaron/i));

    await waitFor(() => expect(screen.getByRole("button", { name: /Enviar a/i })).toBeDisabled());
    expect(screen.getByText(/Marca al menos una categoría/i)).toBeTruthy();
    expect(broadcastMessage).not.toHaveBeenCalled();
  });

  it("el envío usa exactamente el filtro que se ve en pantalla", async () => {
    render(<AdminCommunications role="superadmin" />);
    await screen.findByText("Centro de mensajes");
    await abrirMasivo();

    fireEvent.click(screen.getByLabelText(/Quienes publicaron/i));
    marcarCategoria("Vehículos");
    fireEvent.click(screen.getByLabelText(/alguna vez/i));
    fireEvent.change(screen.getByPlaceholderText("Título de la campaña"), { target: { value: "Campaña" } });
    fireEvent.change(screen.getByPlaceholderText(/Mensaje masivo/i), { target: { value: "Contenido" } });

    await waitFor(() => expect(screen.getByRole("button", { name: /Enviar a 1.234/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Enviar a/i }));

    await waitFor(() =>
      expect(broadcastMessage).toHaveBeenCalledWith(
        "buscador", "Campaña", "Contenido", false,
        expect.objectContaining({ categories: ["vehiculos"], onlyActive: false }),
      ),
    );
  });
});
