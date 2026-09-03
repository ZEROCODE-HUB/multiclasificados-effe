import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { prepararDom } from "./domPolyfills";

// Configuración: enlace a la política de privacidad y borrado de cuenta.

beforeEach(prepararDom);

vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("@capacitor/keyboard", () => ({ Keyboard: {} }));
vi.mock("@/lib/auth", () => ({
  fetchMyProfile: vi.fn().mockResolvedValue({ id: "u1", full_name: "Ana García", phone: "", company_name: "", company_ruc: "", avatar_url: "" }),
  updateMyProfile: vi.fn(), uploadMyAvatar: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: vi.fn() } } }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

const deleteMyAccount = vi.fn();
const miCuentaTieneRastro = vi.fn();
vi.mock("@/lib/account", () => ({
  deleteMyAccount: () => deleteMyAccount(),
  miCuentaTieneRastro: () => miCuentaTieneRastro(),
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, useNavigate: () => navigate };
});

import SettingsPage from "@/pages/shared/SettingsPage";

const renderPage = async () => {
  render(<MemoryRouter><SettingsPage role="buscador" /></MemoryRouter>);
  await screen.findByText("Zona de peligro");
};

beforeEach(() => {
  deleteMyAccount.mockReset().mockResolvedValue("eliminado");
  miCuentaTieneRastro.mockReset().mockResolvedValue(false);
  navigate.mockReset();
  toast.mockReset();
});

describe("SettingsPage — privacidad y borrar cuenta", () => {
  it("abre la política de privacidad", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Política de privacidad y Términos"));
    await waitFor(() => expect(screen.getByText("Términos y Condiciones y Política de Privacidad")).toBeInTheDocument());
  });

  it("el borrado exige escribir ELIMINAR antes de confirmar", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Eliminar mi cuenta/i }));

    const confirmBtn = await screen.findByRole("button", { name: /Eliminar definitivamente/i });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/palabra de confirmación/i), { target: { value: "ELIMINAR" } });
    expect(confirmBtn).toBeEnabled();

    fireEvent.click(confirmBtn);
    await waitFor(() => expect(deleteMyAccount).toHaveBeenCalled());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/", { replace: true }));
  });

  it("con la palabra equivocada no borra", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Eliminar mi cuenta/i }));
    fireEvent.change(screen.getByLabelText(/palabra de confirmación/i), { target: { value: "borrar" } });
    expect(screen.getByRole("button", { name: /Eliminar definitivamente/i })).toBeDisabled();
    expect(deleteMyAccount).not.toHaveBeenCalled();
  });
});

/**
 * LO QUE REPORTÓ EL CLIENTE: "con el rol de usuario final he ELIMINADO una
 * cuenta, y al parecer lo hizo totalmente... tenía avisos activos, vencidos y un
 * historial que no se debe perder".
 *
 * La regla de la 0127 —a quien ya contrató no se le borra— vivía SOLO en el
 * botón del panel. Esta pantalla seguía llamando al borrado a secas de la 0053.
 *
 * Quien decide sigue siendo la base; lo que se fija aquí es que la pantalla
 * DIGA LA VERDAD, antes y después. Prometer "se eliminarán todos tus datos" y
 * conservar las boletas es peor que no prometer nada.
 */
describe("SettingsPage — cerrar cuenta con historial comercial", () => {
  it("avisa ANTES de confirmar de que las boletas se conservan", async () => {
    miCuentaTieneRastro.mockResolvedValue(true);
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Eliminar mi cuenta/i }));

    await screen.findByText(/ya están declaradas ante SUNAT/i);
    // Y no la promesa de borrado total, que para esta cuenta es falsa.
    expect(screen.queryByText(/todos tus datos/i)).toBeNull();
  });

  it("el botón habla de cerrar, no de eliminar", async () => {
    miCuentaTieneRastro.mockResolvedValue(true);
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Eliminar mi cuenta/i }));
    await screen.findByRole("button", { name: /Cerrar definitivamente/i });
  });

  it("y el aviso final dice que se cerró, no que se borró", async () => {
    miCuentaTieneRastro.mockResolvedValue(true);
    deleteMyAccount.mockResolvedValue("desactivado");
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Eliminar mi cuenta/i }));

    const confirmar = await screen.findByRole("button", { name: /Cerrar definitivamente/i });
    fireEvent.change(screen.getByLabelText(/palabra de confirmación/i), { target: { value: "ELIMINAR" } });
    fireEvent.click(confirmar);

    await waitFor(() => expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Cuenta cerrada" }),
    ));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/", { replace: true }));
  });

  it("sin historial sigue diciendo que se elimina", async () => {
    // La otra mitad: a quien nunca contrató SÍ se le borra, y hay que decírselo.
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Eliminar mi cuenta/i }));
    await screen.findByText(/Se eliminarán tu cuenta y todos tus datos/i);

    fireEvent.change(screen.getByLabelText(/palabra de confirmación/i), { target: { value: "ELIMINAR" } });
    fireEvent.click(screen.getByRole("button", { name: /Eliminar definitivamente/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Cuenta eliminada" }),
    ));
  });

  it("si no se puede saber, no promete ninguna de las dos cosas", async () => {
    // `miCuentaTieneRastro` devuelve null cuando la consulta falla. Adivinar
    // aquí es justo lo que hay que evitar: la base decide igual.
    miCuentaTieneRastro.mockResolvedValue(null);
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Eliminar mi cuenta/i }));

    await screen.findByText(/Esta acción es/i);
    expect(screen.queryByText(/todos tus datos/i)).toBeNull();
    expect(screen.queryByText(/SUNAT/i)).toBeNull();
  });
});
