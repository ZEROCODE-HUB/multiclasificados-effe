import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { UpdateDecision } from "@/lib/appVersion";

// El modal de actualización solo actúa en nativo y según la decisión de versión.
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));

const checkForUpdate = vi.fn();
vi.mock("@/lib/appVersion", () => ({ checkForUpdate: () => checkForUpdate() }));

import { UpdateGate } from "@/components/UpdateGate";

const decision = (over: Partial<UpdateDecision>): UpdateDecision => ({
  status: "optional",
  installedBuild: 9,
  info: { latest_build: 10, min_build: 1, version_name: "2.0", download_url: "https://x/apk", notes: "", ota_version: "", ota_url: "" },
  ...over,
});

beforeEach(() => checkForUpdate.mockReset());

describe("UpdateGate", () => {
  it("no muestra nada si está al día", async () => {
    checkForUpdate.mockResolvedValue(decision({ status: "up-to-date" }));
    render(<UpdateGate />);
    await Promise.resolve();
    expect(screen.queryByText(/actualiz/i)).not.toBeInTheDocument();
  });

  it("actualización opcional: se puede posponer con 'Más tarde'", async () => {
    checkForUpdate.mockResolvedValue(decision({ status: "optional" }));
    render(<UpdateGate />);
    await waitFor(() => expect(screen.getByText("Hay una nueva versión")).toBeInTheDocument());
    const later = screen.getByRole("button", { name: /más tarde/i });
    expect(later).toBeInTheDocument();
    fireEvent.click(later);
    await waitFor(() => expect(screen.queryByText("Hay una nueva versión")).not.toBeInTheDocument());
  });

  it("actualización forzada: es bloqueante, sin opción de posponer", async () => {
    checkForUpdate.mockResolvedValue(decision({ status: "forced" }));
    render(<UpdateGate />);
    await waitFor(() => expect(screen.getByText("Actualización obligatoria")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /más tarde/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /actualizar/i })).toBeInTheDocument();
  });
});
