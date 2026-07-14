import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Dispositivo compartido: tras cerrar sesión / registrarse, los campos de acceso
// deben quedar limpios para el siguiente usuario, y el navegador no debe poder
// autocompletar la contraseña guardada de otra persona (campos en solo-lectura
// hasta el primer foco).

const signUpSpy = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/auth", () => ({
  signInWithPassword: vi.fn(),
  signUpWithPassword: (...a: unknown[]) => signUpSpy(...a),
  signInWithGoogle: vi.fn(),
  INVALID_CREDENTIALS_MSG: "Correo o contraseña incorrectos.",
  landingPath: () => "/",
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useSession", () => ({ useSession: () => null }));
vi.mock("@hcaptcha/react-hcaptcha", () => ({ default: () => null }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import AuthPage from "@/pages/AuthPage";

const renderPage = () =>
  render(<MemoryRouter initialEntries={["/auth"]}><AuthPage /></MemoryRouter>);

beforeEach(() => vi.clearAllMocks());

describe("AuthPage — campos limpios en dispositivo compartido", () => {
  it("la contraseña de login arranca en solo-lectura (bloquea el autocompletado) y se libera al enfocar", () => {
    renderPage();
    const pwd = screen.getByPlaceholderText("••••••••") as HTMLInputElement;
    expect(pwd).toHaveAttribute("readonly");
    // Al enfocar cualquier campo del formulario, se libera para escribir.
    fireEvent.focus(pwd);
    expect(pwd).not.toHaveAttribute("readonly");
  });

  it("enfocar el correo libera TAMBIÉN la contraseña (el nuevo usuario puede escribir en todo)", () => {
    renderPage();
    const emailInput = screen.getByPlaceholderText("tu@correo.com") as HTMLInputElement;
    const pwd = screen.getByPlaceholderText("••••••••") as HTMLInputElement;
    expect(emailInput).toHaveAttribute("readonly");
    expect(pwd).toHaveAttribute("readonly");
    // Basta enfocar un campo: el formulario entero se desbloquea.
    fireEvent.focus(emailInput);
    expect(emailInput).not.toHaveAttribute("readonly");
    expect(pwd).not.toHaveAttribute("readonly");
    // Y ya se puede escribir con normalidad.
    fireEvent.change(pwd, { target: { value: "clave1234" } });
    expect(pwd.value).toBe("clave1234");
  });

  it("los campos de contraseña de REGISTRO también arrancan en solo-lectura", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /registrarse/i }));
    expect(screen.getByPlaceholderText("Mínimo 8 caracteres")).toHaveAttribute("readonly");
    expect(screen.getByPlaceholderText("Repite tu contraseña")).toHaveAttribute("readonly");
  });

  it("tras cerrar sesión y volver a /auth, los campos quedan limpios y bloqueados para el nuevo usuario", () => {
    // Usuario A escribe sus credenciales…
    renderPage();
    const pwdA = screen.getByPlaceholderText("••••••••") as HTMLInputElement;
    fireEvent.focus(pwdA);
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "userA@correo.com" } });
    fireEvent.change(pwdA, { target: { value: "claveA123" } });
    expect(pwdA.value).toBe("claveA123");

    // …cierra sesión: la app desmonta /auth y navega fuera.
    cleanup();

    // Usuario B abre de nuevo la pantalla de acceso (nuevo montaje).
    renderPage();
    const emailB = screen.getByPlaceholderText("tu@correo.com") as HTMLInputElement;
    const pwdB = screen.getByPlaceholderText("••••••••") as HTMLInputElement;
    expect(emailB.value).toBe("");
    expect(pwdB.value).toBe("");
    // Y siguen protegidos contra el autocompletado hasta que B los enfoque.
    expect(emailB).toHaveAttribute("readonly");
    expect(pwdB).toHaveAttribute("readonly");
  });

  it("tras registrarse, el formulario de registro queda vacío para el siguiente", async () => {
    renderPage();

    // Ir a "Registrarse" y llenar el formulario.
    fireEvent.click(screen.getByRole("button", { name: /registrarse/i }));
    const regEmail = () => screen.getByPlaceholderText("tu@correo.com") as HTMLInputElement;
    const regPwd = () => screen.getByPlaceholderText("Mínimo 8 caracteres") as HTMLInputElement;
    const regPwd2 = () => screen.getByPlaceholderText("Repite tu contraseña") as HTMLInputElement;

    fireEvent.change(regEmail(), { target: { value: "nuevo@correo.com" } });
    fireEvent.change(regPwd(), { target: { value: "clave1234" } });
    fireEvent.change(regPwd2(), { target: { value: "clave1234" } });
    fireEvent.click(screen.getByRole("checkbox"));

    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    // Registro OK → vuelve a "Iniciar sesión" (aparece el campo de contraseña de login).
    await waitFor(() => expect(signUpSpy).toHaveBeenCalled());
    await screen.findByPlaceholderText("••••••••");

    // Volver a "Registrarse": los campos deben estar vacíos, sin la contraseña previa.
    fireEvent.click(screen.getByRole("button", { name: /registrarse/i }));
    expect(regPwd().value).toBe("");
    expect(regPwd2().value).toBe("");
    expect(regEmail().value).toBe("");
  });
});
