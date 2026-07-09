import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// El interruptor "Modo mantenimiento" guardaba el valor y nadie lo leía: la app
// nunca se bloqueaba. Estos tests fijan el contrato del bloqueo.

const fetchMaintenanceMode = vi.fn();
vi.mock("@/lib/maintenance", () => ({ fetchMaintenanceMode: () => fetchMaintenanceMode() }));

const session = vi.fn();
vi.mock("@/hooks/useSession", async (orig) => {
  const real = await orig<typeof import("@/hooks/useSession")>();
  return { ...real, useSession: () => session() };
});

import { MaintenanceGate } from "@/components/MaintenanceGate";

const APP = "contenido de la plataforma";
const MENSAJE = /La aplicación está en mantenimiento/;

const montar = (ruta = "/") =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <MaintenanceGate><p>{APP}</p></MaintenanceGate>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  session.mockReturnValue(null);
  fetchMaintenanceMode.mockResolvedValue(false);
});

describe("modo mantenimiento apagado", () => {
  it("la plataforma se ve con normalidad", async () => {
    montar();
    expect(await screen.findByText(APP)).toBeInTheDocument();
    expect(screen.queryByText(MENSAJE)).toBeNull();
  });
});

describe("modo mantenimiento encendido", () => {
  beforeEach(() => fetchMaintenanceMode.mockResolvedValue(true));

  it("un visitante sin sesión ve la pantalla informativa, no la app", async () => {
    montar();

    expect(await screen.findByText(MENSAJE)).toBeInTheDocument();
    expect(screen.queryByText(APP)).toBeNull();
  });

  it("bloquea también al usuario con sesión normal", async () => {
    session.mockReturnValue({ role: "buscador", name: "Ana", initials: "A" });
    montar("/buscar");

    expect(await screen.findByText(MENSAJE)).toBeInTheDocument();
    expect(screen.queryByText(APP)).toBeNull();
  });

  it("bloquea el detalle de un aviso y el login de usuario", async () => {
    montar("/aviso/abc");
    expect(await screen.findByText(MENSAJE)).toBeInTheDocument();

    montar("/auth");
    expect((await screen.findAllByText(MENSAJE)).length).toBeGreaterThan(0);
    expect(screen.queryByText(APP)).toBeNull();
  });

  it("el admin entra igual: si no, no habría forma de apagar el interruptor", async () => {
    session.mockReturnValue({ role: "admin", name: "Beymar", initials: "B" });
    montar("/admin");

    expect(await screen.findByText(APP)).toBeInTheDocument();
    expect(screen.queryByText(MENSAJE)).toBeNull();
  });

  it("el superadmin también entra", async () => {
    session.mockReturnValue({ role: "superadmin", name: "Oscar", initials: "O" });
    montar("/admin");

    expect(await screen.findByText(APP)).toBeInTheDocument();
  });

  it("/auth/staff sigue accesible sin sesión: el admin necesita poder iniciarla", async () => {
    montar("/auth/staff");

    expect(await screen.findByText(APP)).toBeInTheDocument();
    expect(screen.queryByText(MENSAJE)).toBeNull();
  });

  it("/auth/callback sigue accesible: es el retorno del login", async () => {
    montar("/auth/callback");

    expect(await screen.findByText(APP)).toBeInTheDocument();
  });
});

describe("mientras se comprueba", () => {
  it("no enseña la app antes de saber si está bloqueada", () => {
    // Promesa que no se resuelve: el estado de comprobación se queda fijo.
    fetchMaintenanceMode.mockReturnValue(new Promise(() => {}));
    montar();

    expect(screen.queryByText(APP)).toBeNull();
    expect(screen.queryByText(MENSAJE)).toBeNull();
  });
});
