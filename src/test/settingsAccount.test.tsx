import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Configuración: enlace a la política de privacidad y borrado de cuenta.

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

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
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const deleteMyAccount = vi.fn();
vi.mock("@/lib/account", () => ({ deleteMyAccount: () => deleteMyAccount() }));

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

beforeEach(() => { deleteMyAccount.mockReset().mockResolvedValue(undefined); navigate.mockReset(); });

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
