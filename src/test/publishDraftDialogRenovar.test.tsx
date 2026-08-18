import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// Renovar un aviso vivo: le suma días conservando su id, sus visitas, sus
// favoritos y su enlace. Es distinto de publicar un borrador, y no debe acabar
// llamando a la función de publicar.
beforeEach(prepararDom);

const renovarAviso = vi.fn();
const finalizeListingPublication = vi.fn();

vi.mock("@/lib/publish", () => ({
  renovarAviso: (...a: unknown[]) => renovarAviso(...a),
  finalizeListingPublication: (...a: unknown[]) => finalizeListingPublication(...a),
  SaldoInsuficiente: class SaldoInsuficiente extends Error {
    listingId?: string;
    faltan?: number;
  },
}));
vi.mock("@/lib/credits", () => ({ getCreditBalance: vi.fn().mockResolvedValue(1000) }));
vi.mock("@/lib/pricingRemote", () => ({ fetchPricingSettings: () => new Promise(() => {}) }));
vi.mock("@/lib/promotions", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  fetchActivePromotions: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/components/BuyCreditsModal", () => ({ BuyCreditsModal: () => null }));
vi.mock("@/components/VerifyIdentityDialog", () => ({
  VerifyIdentityDialog: ({ onConfirmed }: { onConfirmed: (c: unknown) => void }) => (
    <button onClick={() => onConfirmed({ name: "JUAN", docType: "dni", docNumber: "44443333" })}>
      CONFIRMAR_IDENTIDAD
    </button>
  ),
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import { PublishDraftDialog } from "@/components/PublishDraftDialog";

const aviso = {
  id: "L1",
  title: "Casa bonita",
  status: "active" as const,
  category: "inmuebles",
  planDurationDays: 7,
  planQuantity: 1,
  planExtras: {},
} as never;

const abrir = (modo: "publicar" | "renovar") =>
  render(
    <PublishDraftDialog
      draft={aviso}
      modo={modo}
      email="ana@correo.com"
      fallbackName="Ana"
      onClose={() => {}}
      onPublished={() => {}}
    />,
  );

beforeEach(() => {
  renovarAviso.mockReset().mockResolvedValue(undefined);
  finalizeListingPublication.mockReset().mockResolvedValue({ published: true });
  toast.mockClear();
});

describe("PublishDraftDialog — modo renovar", () => {
  it("se anuncia como renovación, no como publicación", async () => {
    abrir("renovar");
    await screen.findByText("Renovar aviso");
  });

  it("renueva el aviso existente y NO llama a publicar", async () => {
    abrir("renovar");
    await screen.findByText("Renovar aviso");

    fireEvent.click(screen.getByRole("button", { name: /renovar|publicar/i }));

    await waitFor(() => expect(renovarAviso).toHaveBeenCalledWith("L1", 7));
    expect(finalizeListingPublication).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "¡Aviso renovado!" }));
  });

  it("el mensaje deja claro que conserva lo que el aviso ya tenía", async () => {
    abrir("renovar");
    await screen.findByText("Renovar aviso");
    fireEvent.click(screen.getByRole("button", { name: /renovar|publicar/i }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining("visitas"),
    })));
  });

  it("en modo publicar sigue siendo el de siempre", async () => {
    abrir("publicar");
    await screen.findByText(/Publicar borrador|Republicar aviso/);
    expect(renovarAviso).not.toHaveBeenCalled();
  });
});
