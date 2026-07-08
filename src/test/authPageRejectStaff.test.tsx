import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const MSG = "Correo o contraseña incorrectos.";

// Login real mockeado: cada test decide si resuelve (permitido) o lanza (bloqueado).
const signInSpy = vi.fn();
vi.mock("@/lib/auth", () => ({
  signInWithPassword: (...a: unknown[]) => signInSpy(...a),
  signUpWithPassword: vi.fn(),
  signInWithGoogle: vi.fn(),
  INVALID_CREDENTIALS_MSG: "Correo o contraseña incorrectos.",
  landingPath: (s: { role?: string } | null, r?: string | null) =>
    r ? r : s && (s.role === "admin" || s.role === "superadmin") ? `/dashboard/${s.role}` : "/",
}));

// Nativo = true → showCaptcha es false en ambos logins, así probamos el flujo
// directo sin tener que resolver el captcha.
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) } }));

vi.mock("@/hooks/useSession", () => ({ useSession: () => null }));
vi.mock("@hcaptcha/react-hcaptcha", () => ({ default: () => null }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, useNavigate: () => navigate };
});

import AuthPage from "@/pages/AuthPage";

function renderLogin(requireCaptcha = false) {
  render(
    <MemoryRouter initialEntries={[requireCaptcha ? "/auth/staff" : "/auth"]}>
      <AuthPage requireCaptcha={requireCaptcha} />
    </MemoryRouter>,
  );
}

function submit(email: string, password: string) {
  fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: email } });
  const pwd = screen.getByPlaceholderText("••••••••");
  fireEvent.change(pwd, { target: { value: password } });
  fireEvent.keyDown(pwd, { key: "Enter" }); // dispara handleLogin sin ambigüedad de botones
}

beforeEach(() => vi.clearAllMocks());

describe("AuthPage — el admin no entra por el login de usuario", () => {
  it("LOGIN USUARIO: un admin es rechazado con mensaje genérico y NO se le redirige", async () => {
    signInSpy.mockRejectedValueOnce(new Error(MSG));
    renderLogin(false);

    submit("admin@correo.com", "claveadmin");

    await waitFor(() => expect(signInSpy).toHaveBeenCalled());
    // Se pasó rejectStaff:true por ser el login de usuario.
    expect(signInSpy).toHaveBeenCalledWith("admin@correo.com", "claveadmin", { rejectStaff: true });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(MSG));
    expect(navigate).not.toHaveBeenCalled(); // no entra a ningún panel
  });

  it("LOGIN USUARIO: un usuario normal entra y va al inicio", async () => {
    signInSpy.mockResolvedValueOnce({ role: "buscador", supabase: true });
    renderLogin(false);

    submit("user@correo.com", "clave1234");

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
    expect(signInSpy).toHaveBeenCalledWith("user@correo.com", "clave1234", { rejectStaff: true });
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("LOGIN STAFF: un admin SÍ entra y va a su panel (rejectStaff:false)", async () => {
    signInSpy.mockResolvedValueOnce({ role: "admin", supabase: true });
    renderLogin(true);

    submit("admin@correo.com", "claveadmin");

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard/admin"));
    expect(signInSpy).toHaveBeenCalledWith("admin@correo.com", "claveadmin", { rejectStaff: false });
  });
});
