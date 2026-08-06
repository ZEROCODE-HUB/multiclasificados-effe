import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Dispositivo compartido: tras cerrar sesión / registrarse, los campos de acceso
// deben quedar limpios para el siguiente usuario, y el navegador no debe poder
// autocompletar la contraseña guardada de otra persona.
//
// La protección es `autoComplete="off"` + el vaciado al montar. Antes había
// además un `readOnly` que se levantaba al primer foco; se retiró porque en iOS
// impedía que se abriera el teclado y dejaba el login inservible (MOB-10). Estos
// tests fijan que NO vuelva: el teclado de iOS se decide en el mismo gesto que
// da el foco, así que un campo readOnly en ese instante no lo despliega y
// quitar el atributo en el re-render posterior ya no lo recupera.

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
  it("los campos de login se pueden escribir desde el primer toque (nada de readOnly)", () => {
    renderPage();
    const emailInput = screen.getByPlaceholderText("tu@correo.com") as HTMLInputElement;
    const pwd = screen.getByPlaceholderText("••••••••") as HTMLInputElement;

    // MOB-10: readOnly en el instante del toque = sin teclado en iOS.
    expect(emailInput).not.toHaveAttribute("readonly");
    expect(pwd).not.toHaveAttribute("readonly");

    fireEvent.change(emailInput, { target: { value: "user@correo.com" } });
    fireEvent.change(pwd, { target: { value: "clave1234" } });
    expect(emailInput.value).toBe("user@correo.com");
    expect(pwd.value).toBe("clave1234");
  });

  it("los campos de REGISTRO tampoco son de solo-lectura", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /registrarse/i }));
    expect(screen.getByPlaceholderText("Mínimo 8 caracteres")).not.toHaveAttribute("readonly");
    expect(screen.getByPlaceholderText("Repite tu contraseña")).not.toHaveAttribute("readonly");
  });

  it("las credenciales de login piden al navegador no autocompletar", () => {
    renderPage();
    // Esta es la protección que queda para el equipo compartido, y a diferencia
    // de readOnly no interfiere con el teclado.
    expect(screen.getByPlaceholderText("tu@correo.com")).toHaveAttribute("autocomplete", "off");
    expect(screen.getByPlaceholderText("••••••••")).toHaveAttribute("autocomplete", "off");
  });

  it("tras cerrar sesión y volver a /auth, los campos quedan limpios para el nuevo usuario", () => {
    // Usuario A escribe sus credenciales…
    renderPage();
    const pwdA = screen.getByPlaceholderText("••••••••") as HTMLInputElement;
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "userA@correo.com" } });
    fireEvent.change(pwdA, { target: { value: "claveA123" } });
    expect(pwdA.value).toBe("claveA123");

    // …cierra sesión: la app desmonta /auth y navega fuera.
    cleanup();

    // Usuario B abre de nuevo la pantalla de acceso (nuevo montaje).
    renderPage();
    expect((screen.getByPlaceholderText("tu@correo.com") as HTMLInputElement).value).toBe("");
    expect((screen.getByPlaceholderText("••••••••") as HTMLInputElement).value).toBe("");
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
