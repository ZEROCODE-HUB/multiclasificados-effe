import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Publicar un borrador desde "Mis avisos › Borradores": cobra y activa el aviso
// que YA existe. Nunca vuelve a crearlo (eso duplicaría el aviso) y exige la
// misma verificación de identidad que publicar desde el formulario.

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

const getCreditBalance = vi.fn();
const spendCredits = vi.fn();
vi.mock("@/lib/credits", () => ({
  getCreditBalance: (...a: unknown[]) => getCreditBalance(...a),
  spendCredits: (...a: unknown[]) => spendCredits(...a),
  purchaseCredits: vi.fn(),
}));

const finalizeListingPublication = vi.fn();
const createAndPublishListing = vi.fn();
vi.mock("@/lib/publish", () => ({
  finalizeListingPublication: (...a: unknown[]) => finalizeListingPublication(...a),
  createAndPublishListing: (...a: unknown[]) => createAndPublishListing(...a),
  saveListingDraft: vi.fn(),
}));

const verifyDocument = vi.fn();
vi.mock("@/lib/verifyDoc", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  verifyDocument: (...a: unknown[]) => verifyDocument(...a),
}));

vi.mock("@/lib/promotions", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, fetchActivePromotions: vi.fn().mockResolvedValue([]) };
});
// El fetch real siempre devuelve un PricingSettings (cae a loadSettings si la BD
// no responde). Devolver undefined aquí reventaba BuyCreditsModal por un fallo
// del mock, no del componente.
vi.mock("@/lib/pricingRemote", () => ({
  fetchPricingSettings: vi.fn(async () => (await import("@/lib/pricing")).loadSettings()),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) } },
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import { PublishDraftDialog } from "@/components/PublishDraftDialog";
import type { MyListing } from "@/lib/listings";

const DRAFT = {
  id: "L-DRAFT", title: "Casa bonita", description: "d", price: 100, currency: "PEN",
  category: "inmuebles", location: "Lima", lat: null, lng: null, imageUrl: "x",
  date: "2026-07-08", featured: false, advertiser: "", views: 0,
  status: "draft", expiresAt: null, condition: "nuevo",
  planDurationDays: 7, planQuantity: 1, planExtras: {},
} as unknown as MyListing;

// 1 aviso × 7 días con la matriz por defecto: 16.14 soles → 161 créditos.
const COST_CREDITS = 161;

const onPublished = vi.fn();
const onClose = vi.fn();

const renderDialog = (draft: MyListing | null = DRAFT) =>
  render(
    <PublishDraftDialog draft={draft} email="test@correo.com" fallbackName="Test"
      onClose={onClose} onPublished={onPublished} />,
  );

const confirmIdentity = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /persona natural/i }));
  fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "12345678" } });
  await screen.findByText("JUAN PEREZ");
  fireEvent.click(screen.getByRole("button", { name: /confirmar y continuar/i }));
};

beforeEach(() => {
  vi.clearAllMocks();
  getCreditBalance.mockResolvedValue(1000);
  spendCredits.mockResolvedValue(true);
  verifyDocument.mockResolvedValue({ ok: true, nombre: "JUAN PEREZ", data: {} });
  finalizeListingPublication.mockResolvedValue({ invoiceNumber: "B001-000200", published: true, invoiceSaved: true });
});

describe("PublishDraftDialog — publicar un borrador guardado", () => {
  it("muestra el plan guardado (7 días) y el costo en créditos", async () => {
    renderDialog();
    await screen.findByText("Casa bonita");
    await screen.findByText(`${COST_CREDITS} cr`);
    expect(screen.getByRole("button", { name: new RegExp(`Publicar por ${COST_CREDITS} cr`) })).toBeTruthy();
  });

  it("exige identidad antes de cobrar: pulsar Publicar abre el cuadro y no cobra", async () => {
    renderDialog();
    await screen.findByText(`${COST_CREDITS} cr`);

    fireEvent.click(screen.getByRole("button", { name: /publicar por/i }));

    await screen.findByText(/verifica tu identidad/i);
    expect(spendCredits).not.toHaveBeenCalled();
    expect(finalizeListingPublication).not.toHaveBeenCalled();
  });

  it("tras confirmar identidad: cobra y ACTIVA el aviso existente, sin recrearlo", async () => {
    renderDialog();
    await screen.findByText(`${COST_CREDITS} cr`);
    fireEvent.click(screen.getByRole("button", { name: /publicar por/i }));
    await confirmIdentity();

    await waitFor(() => expect(finalizeListingPublication).toHaveBeenCalledTimes(1));
    expect(spendCredits).toHaveBeenCalledWith(COST_CREDITS, "L-DRAFT");
    expect(finalizeListingPublication).toHaveBeenCalledWith("L-DRAFT", expect.objectContaining({
      duration: 7, docType: "dni", docNumber: "12345678", advertiserName: "JUAN PEREZ",
    }));

    // Clave: NO se crea un aviso nuevo.
    expect(createAndPublishListing).not.toHaveBeenCalled();
    await waitFor(() => expect(onPublished).toHaveBeenCalled());
  });

  it("DNI falso: no cobra ni publica", async () => {
    verifyDocument.mockResolvedValue({ ok: false, error: "No se encontró el documento." });
    renderDialog();
    await screen.findByText(`${COST_CREDITS} cr`);
    fireEvent.click(screen.getByRole("button", { name: /publicar por/i }));

    fireEvent.click(await screen.findByRole("button", { name: /persona natural/i }));
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "12345678" } });
    await screen.findByText(/no se encontró el documento/i);

    expect(screen.getByRole("button", { name: /confirmar y continuar/i })).toBeDisabled();
    expect(spendCredits).not.toHaveBeenCalled();
    expect(finalizeListingPublication).not.toHaveBeenCalled();
  });

  it("sin saldo: el botón ofrece comprar créditos y no cobra", async () => {
    getCreditBalance.mockResolvedValue(0);
    renderDialog();
    await screen.findByText(`${COST_CREDITS} cr`);

    const btn = await screen.findByRole("button", { name: /comprar créditos/i });
    fireEvent.click(btn);

    await screen.findByText(/créditos a comprar/i);
    expect(spendCredits).not.toHaveBeenCalled();
    expect(finalizeListingPublication).not.toHaveBeenCalled();
  });

  it("si el cobro falla, NO activa el aviso y abre la compra", async () => {
    spendCredits.mockResolvedValue(false);
    renderDialog();
    await screen.findByText(`${COST_CREDITS} cr`);
    fireEvent.click(screen.getByRole("button", { name: /publicar por/i }));
    await confirmIdentity();

    await waitFor(() => expect(spendCredits).toHaveBeenCalled());
    expect(finalizeListingPublication).not.toHaveBeenCalled();
    expect(onPublished).not.toHaveBeenCalled();
  });

  it("si se cobró pero el RPC no activó el aviso, lo dice en vez de fingir éxito", async () => {
    finalizeListingPublication.mockResolvedValue({ invoiceNumber: "", published: false, invoiceSaved: false });
    renderDialog();
    await screen.findByText(`${COST_CREDITS} cr`);
    fireEvent.click(screen.getByRole("button", { name: /publicar por/i }));
    await confirmIdentity();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Se cobró pero el aviso no se activó" })));
    expect(onPublished).not.toHaveBeenCalled();
  });
});
