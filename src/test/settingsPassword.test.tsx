import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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

const fetchMyProfile = vi.fn().mockResolvedValue({ id: "u1", full_name: "Ana García", phone: "", company_name: "", company_ruc: "", avatar_url: "" });
vi.mock("@/lib/auth", () => ({
  fetchMyProfile: (...a: unknown[]) => fetchMyProfile(...a),
  updateMyProfile: vi.fn().mockResolvedValue(undefined),
  uploadMyAvatar: vi.fn(),
}));

const getUser = vi.fn().mockResolvedValue({ data: { user: { email: "ana@correo.com" } } });
const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
const updateUser = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: {
    getUser: (...a: unknown[]) => getUser(...a),
    signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
    updateUser: (...a: unknown[]) => updateUser(...a),
  } },
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import SettingsPage from "@/pages/shared/SettingsPage";

async function gotoSeguridad() {
  render(<SettingsPage role="anunciante" />);
  const tab = await screen.findByRole("tab", { name: "Seguridad" });
  fireEvent.mouseDown(tab); fireEvent.focus(tab); fireEvent.click(tab);
  return await screen.findByLabelText("Contraseña actual");
}
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { email: "ana@correo.com" } } });
  signInWithPassword.mockResolvedValue({ error: null });
  updateUser.mockResolvedValue({ error: null });
});

describe("SettingsPage — cambiar contraseña (panel usuario)", () => {
  it("verifica la actual y actualiza la nueva", async () => {
    await gotoSeguridad();
    fill("Contraseña actual", "ClaveVieja123");
    fill("Nueva contraseña", "ClaveNueva456");
    fill("Confirmar contraseña", "ClaveNueva456");
    fireEvent.click(screen.getByRole("button", { name: /Actualizar contraseña/i }));

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({ email: "ana@correo.com", password: "ClaveVieja123" }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: "ClaveNueva456" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Contraseña actualizada" })));
  });

  it("si la contraseña actual es incorrecta, NO actualiza", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    await gotoSeguridad();
    fill("Contraseña actual", "malaClave");
    fill("Nueva contraseña", "ClaveNueva456");
    fill("Confirmar contraseña", "ClaveNueva456");
    fireEvent.click(screen.getByRole("button", { name: /Actualizar contraseña/i }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Contraseña actual incorrecta" })));
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rechaza si la nueva y la confirmación no coinciden", async () => {
    await gotoSeguridad();
    fill("Contraseña actual", "ClaveVieja123");
    fill("Nueva contraseña", "ClaveNueva456");
    fill("Confirmar contraseña", "otraCosa789");
    fireEvent.click(screen.getByRole("button", { name: /Actualizar contraseña/i }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/no coinciden/i) })));
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("el ojito muestra/oculta la contraseña", async () => {
    const curInput = await gotoSeguridad();
    expect(curInput.getAttribute("type")).toBe("password");
    // Primer botón "Mostrar contraseña" = el del campo actual.
    fireEvent.click(screen.getAllByLabelText("Mostrar contraseña")[0]);
    expect(curInput.getAttribute("type")).toBe("text");
    fireEvent.click(screen.getAllByLabelText("Ocultar contraseña")[0]);
    expect(curInput.getAttribute("type")).toBe("password");
  });

  it("rechaza contraseñas de menos de 8 caracteres", async () => {
    await gotoSeguridad();
    fill("Contraseña actual", "ClaveVieja123");
    fill("Nueva contraseña", "corta");
    fill("Confirmar contraseña", "corta");
    fireEvent.click(screen.getByRole("button", { name: /Actualizar contraseña/i }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/muy corta/i) })));
    expect(updateUser).not.toHaveBeenCalled();
  });
});
