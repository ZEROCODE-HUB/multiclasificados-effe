import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// En el iPhone de TestFlight la app arrancaba pero no dejaba iniciar sesión ni
// mostraba avisos, y no decía nada: las variables del build tenían buena forma
// pero no servían. Esta puerta convierte ese silencio en una pantalla que
// explica qué falla, sin retrasar el arranque cuando todo está bien.

const checkSupabaseHealth = vi.fn();
vi.mock("@/lib/bootDiagnostics", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  checkSupabaseHealth: (...a: unknown[]) => checkSupabaseHealth(...a),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "ios", isNativePlatform: () => true } }));

import { ConnectionGate } from "@/components/ConnectionGate";

const App = () => <p>APP MONTADA</p>;

beforeEach(() => checkSupabaseHealth.mockReset());

describe("ConnectionGate", () => {
  it("con la conexión sana deja pasar a la app", async () => {
    checkSupabaseHealth.mockResolvedValue({ status: "ok" });
    render(<ConnectionGate><App /></ConnectionGate>);

    expect(screen.getByText("APP MONTADA")).toBeTruthy();
    // Y sigue ahí tras resolverse el chequeo (no debe parpadear a la pantalla de error).
    await waitFor(() => expect(checkSupabaseHealth).toHaveBeenCalled());
    expect(screen.getByText("APP MONTADA")).toBeTruthy();
  });

  it("no bloquea el arranque mientras comprueba", async () => {
    let resolver: (v: unknown) => void = () => {};
    checkSupabaseHealth.mockReturnValue(new Promise((r) => { resolver = r; }));
    render(<ConnectionGate><App /></ConnectionGate>);

    // La app se ve con el chequeo aún en vuelo.
    expect(screen.getByText("APP MONTADA")).toBeTruthy();
    resolver({ status: "ok" }); // se cierra para no dejar la promesa colgada
    await waitFor(() => expect(screen.getByText("APP MONTADA")).toBeTruthy());
  });

  it("clave rechazada → explica el motivo y muestra el mensaje del servidor", async () => {
    checkSupabaseHealth.mockResolvedValue({ status: "invalid-key", httpStatus: 401, detail: "Invalid API key" });
    render(<ConnectionGate><App /></ConnectionGate>);

    expect(await screen.findByText(/clave de conexión fue rechazada/i)).toBeTruthy();
    expect(screen.getByText(/Invalid API key/)).toBeTruthy();
    expect(screen.queryByText("APP MONTADA")).toBeNull();
  });

  it("sin internet lo dice así, sin culpar a la configuración", async () => {
    checkSupabaseHealth.mockResolvedValue({ status: "offline" });
    render(<ConnectionGate><App /></ConnectionGate>);

    expect(await screen.findByText(/Sin conexión a internet/i, undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeTruthy();
  });

  it("un fallo puntual del servidor no tumba la app: se reintenta antes de avisar", async () => {
    checkSupabaseHealth
      .mockResolvedValueOnce({ status: "server-error", httpStatus: 503 })
      .mockResolvedValue({ status: "ok" });
    render(<ConnectionGate><App /></ConnectionGate>);

    await waitFor(() => expect(checkSupabaseHealth).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(screen.getByText("APP MONTADA")).toBeTruthy();
  });

  it("URL que no es del proyecto → apunta a la variable del build", async () => {
    checkSupabaseHealth.mockResolvedValue({
      status: "unreachable", httpStatus: 404, detail: "La URL no corresponde a un proyecto de Supabase.",
    });
    render(<ConnectionGate><App /></ConnectionGate>);

    expect(await screen.findByText(/No se puede contactar con el servidor/i, undefined, { timeout: 5000 })).toBeTruthy();
    // Aparece en el checklist de variables y de nuevo en la explicación.
    expect(screen.getAllByText(/VITE_SUPABASE_URL/).length).toBeGreaterThan(0);
    expect(screen.getByText(/no corresponde a un proyecto de Supabase/i)).toBeTruthy();
  });
});
