import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Plataforma controlada (evita depender del entorno real de Capacitor).
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "ios" } }));

import { BootError } from "@/components/BootError";

beforeEach(() => {
  (window as unknown as { __EFFE_BOOTED__?: boolean }).__EFFE_BOOTED__ = false;
});

describe("BootError", () => {
  it("variant=config: lista las env requeridas y muestra versión, plataforma y botón", async () => {
    render(<BootError variant="config" />);

    expect(screen.getByText("No se pudo iniciar la app")).toBeTruthy();
    // Checklist de env requeridas (en tests import.meta.env.VITE_* es undefined
    // → ambas aparecen como faltantes).
    expect(screen.getByText("VITE_SUPABASE_URL")).toBeTruthy();
    expect(screen.getByText("VITE_SUPABASE_ANON_KEY")).toBeTruthy();
    // Versión actual y plataforma.
    expect(screen.getByText(/v3\.8/)).toBeTruthy();
    expect(screen.getByText("ios")).toBeTruthy();
    // Botón de reintento.
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeTruthy();
  });

  it("marca window.__EFFE_BOOTED__ para silenciar el watchdog", () => {
    render(<BootError variant="config" />);
    expect((window as unknown as { __EFFE_BOOTED__?: boolean }).__EFFE_BOOTED__).toBe(true);
  });

  it("variant=crash: muestra el mensaje del error", () => {
    render(<BootError variant="crash" error={new Error("boom-de-arranque")} />);
    expect(screen.getByText(/boom-de-arranque/)).toBeTruthy();
  });
});
