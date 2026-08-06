import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Quien pulsaba un aviso sin sesión llegaba al login sin ninguna explicación, y
// "Explorar avisos" lo devolvía al buscador… donde volvía a pulsar un aviso y
// otra vez al login (IT3-012). También se fija aquí que el campo de contraseña
// tenga tope de caracteres y hueco para el icono del ojo (IT3-015).

vi.mock("@/lib/auth", () => ({
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  signInWithGoogle: vi.fn(),
  INVALID_CREDENTIALS_MSG: "Correo o contraseña incorrectos.",
  landingPath: () => "/",
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useSession", () => ({ useSession: () => null, clearSession: vi.fn() }));
vi.mock("@hcaptcha/react-hcaptcha", () => ({ default: () => null }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import AuthPage from "@/pages/AuthPage";

const AVISO_MSG = /necesitas una cuenta/i;

const renderAt = (entries: string[], index = entries.length - 1) =>
  render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/buscar" element={<p>PANTALLA BUSCAR</p>} />
        <Route path="/favoritos" element={<p>PANTALLA ANTERIOR</p>} />
        <Route path="/" element={<p>PANTALLA INICIO</p>} />
      </Routes>
    </MemoryRouter>,
  );

// El componente mira el índice del historial del navegador para saber si hay
// algo detrás; MemoryRouter no lo toca, así que se simula aquí.
const conHistorial = (idx: number) =>
  window.history.replaceState({ ...(window.history.state ?? {}), idx }, "");

beforeEach(() => {
  vi.clearAllMocks();
  conHistorial(0);
});

describe("AuthPage — llegada desde un aviso", () => {
  it("explica por qué se pide la cuenta", () => {
    renderAt(["/auth?redirect=/aviso/abc"]);
    expect(screen.getByText(AVISO_MSG)).toBeTruthy();
  });

  it("en el login normal NO muestra ese mensaje", () => {
    renderAt(["/auth"]);
    expect(screen.queryByText(AVISO_MSG)).toBeNull();
  });

  it("un redirect externo no dispara el mensaje", () => {
    renderAt(["/auth?redirect=https://evil.example/aviso/abc"]);
    expect(screen.queryByText(AVISO_MSG)).toBeNull();
  });

  it('"Explorar avisos" vuelve atrás en vez de repetir el ciclo', async () => {
    conHistorial(1); // hay una pantalla detrás
    renderAt(["/favoritos", "/auth?redirect=/aviso/abc"], 1);
    fireEvent.click(screen.getByRole("button", { name: /Explorar avisos/i }));
    // Vuelve a donde estaba, no al buscador: es lo que rompe el ciclo.
    await waitFor(() => expect(screen.getByText("PANTALLA ANTERIOR")).toBeTruthy());
  });

  it("si se llegó directo al login (sin historial), lleva al buscador", async () => {
    renderAt(["/auth?redirect=/aviso/abc"]);
    fireEvent.click(screen.getByRole("button", { name: /Explorar avisos/i }));
    await waitFor(() => expect(screen.getByText("PANTALLA BUSCAR")).toBeTruthy());
  });

  it("sin venir de un aviso, sigue llevando al buscador aunque haya historial", async () => {
    conHistorial(1);
    renderAt(["/favoritos", "/auth"], 1);
    fireEvent.click(screen.getByRole("button", { name: /Explorar avisos/i }));
    await waitFor(() => expect(screen.getByText("PANTALLA BUSCAR")).toBeTruthy());
  });
});

// MOB-11: en la app no hay barra de navegador, y salir del login dependía del
// gesto de deslizar desde el borde izquierdo — invisible, y ausente en Android.
describe("AuthPage — botón de volver", () => {
  it("está visible en la pantalla de acceso", () => {
    renderAt(["/auth"]);
    expect(screen.getByRole("button", { name: /volver/i })).toBeTruthy();
  });

  it("retrocede a la pantalla anterior", async () => {
    conHistorial(1);
    renderAt(["/favoritos", "/auth"], 1);
    fireEvent.click(screen.getByRole("button", { name: /volver/i }));
    await waitFor(() => expect(screen.getByText("PANTALLA ANTERIOR")).toBeTruthy());
  });

  it("si el login fue la primera pantalla, lleva al inicio en vez de salir de la app", async () => {
    conHistorial(0);
    renderAt(["/auth"]);
    fireEvent.click(screen.getByRole("button", { name: /volver/i }));
    await waitFor(() => expect(screen.getByText("PANTALLA INICIO")).toBeTruthy());
  });
});

describe("AuthPage — campo de contraseña", () => {
  it("el login limita la longitud, deja hueco al ojo y frena el autorrelleno", () => {
    renderAt(["/auth"]);
    const pwd = screen.getByPlaceholderText("••••••••");
    expect(pwd).toHaveAttribute("maxlength", "72");
    // "off" y no "current-password": el equipo puede ser compartido y no debe
    // ofrecerse la contraseña guardada de otra persona (ver authPageCleanFields).
    expect(pwd).toHaveAttribute("autocomplete", "off");
    expect(pwd.className).toContain("pr-10");
  });

  it("el registro puede mostrar y ocultar AMBAS contraseñas", () => {
    renderAt(["/auth"]);
    fireEvent.click(screen.getByRole("button", { name: /registrarse/i }));
    const pwd = screen.getByPlaceholderText("Mínimo 8 caracteres");
    const confirm = screen.getByPlaceholderText("Repite tu contraseña");
    expect(pwd).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: /Mostrar contraseñas/i }));
    expect(pwd).toHaveAttribute("type", "text");
    expect(confirm).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: /Ocultar contraseñas/i }));
    expect(pwd).toHaveAttribute("type", "password");
    expect(confirm).toHaveAttribute("type", "password");
  });
});
