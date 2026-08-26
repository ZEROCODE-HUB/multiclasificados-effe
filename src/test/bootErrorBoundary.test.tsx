import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "web" } }));

import { BootErrorBoundary } from "@/components/BootErrorBoundary";

function Bomba(): JSX.Element {
  throw new Error("explota-en-render");
}

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // React y el boundary logean el error a consola; lo silenciamos en el test.
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe("BootErrorBoundary", () => {
  it("captura una excepción de render y muestra la pantalla de diagnóstico", () => {
    render(
      <BootErrorBoundary>
        <Bomba />
      </BootErrorBoundary>,
    );
    expect(screen.getByText("No se pudo iniciar la app")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ver detalles/i }));
    expect(screen.getByText(/explota-en-render/)).toBeTruthy();
  });

  it("deja pasar a los hijos cuando no hay error", () => {
    render(
      <BootErrorBoundary>
        <div>contenido-ok</div>
      </BootErrorBoundary>,
    );
    expect(screen.getByText("contenido-ok")).toBeTruthy();
  });
});
