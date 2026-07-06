import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// --- Polyfills que Radix (Dialog) y la subida de foto necesitan en jsdom ---
beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
  (URL as any).createObjectURL = () => "blob:mock";
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

// --- Mocks de la capa de datos y del entorno ---
const getCreditBalance = vi.fn();
const spendCredits = vi.fn().mockResolvedValue(true);
const purchaseCredits = vi.fn();
vi.mock("@/lib/credits", () => ({
  getCreditBalance: (...a: unknown[]) => getCreditBalance(...a),
  spendCredits: (...a: unknown[]) => spendCredits(...a),
  purchaseCredits: (...a: unknown[]) => purchaseCredits(...a),
}));

const createAndPublishListing = vi.fn();
vi.mock("@/lib/publish", () => ({
  createAndPublishListing: (...a: unknown[]) => createAndPublishListing(...a),
}));

vi.mock("@/lib/verifyDoc", () => ({ verifyDocument: vi.fn() }));

// Promociones: mockeamos solo la carga; los helpers (bestPromoForCategory/applyDiscount) son reales.
const fetchActivePromotions = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/promotions", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, fetchActivePromotions: (...a: unknown[]) => fetchActivePromotions(...a) };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { email: "test@correo.com" } } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
  },
}));

vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ role: "anunciante", name: "Test", initials: "T", supabase: true }),
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import AdvertiserPublish from "@/pages/advertiser/AdvertiserPublish";

// Costo de 1 aviso × 7 días con la matriz por defecto (base 16.14).
// El DINERO va en soles; el usuario se cobra en CRÉDITOS = soles × 10 (redondeado).
const COST_SOLES = 16.14;
const COST_CREDITS = 161; // solesToCredits(16.14) = round(161.4)

// Precarga el formulario vía el borrador que el componente restaura al montar.
const seedDraft = () => {
  localStorage.setItem("effe:publish-draft", JSON.stringify({
    form: { category: "inmuebles", title: "Casa bonita", description: "Descripción larga del aviso", price: "100", currency: "PEN", location: "Lima", condition: "nuevo" },
    duration: 7, quantity: 1, extras: {},
  }));
};

const uploadMainPhoto = () => {
  const fileInput = document.querySelectorAll("input[type=file]")[0] as HTMLInputElement;
  const file = new File(["img"], "portada.png", { type: "image/png" });
  Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
  fireEvent.change(fileInput);
};

beforeEach(() => {
  localStorage.clear();
  getCreditBalance.mockReset();
  spendCredits.mockClear().mockResolvedValue(true);
  purchaseCredits.mockReset();
  createAndPublishListing.mockReset().mockResolvedValue({
    listingId: "L1", invoiceNumber: "B001-000099", published: true, invoiceSaved: true,
  });
  navigate.mockClear();
  toast.mockClear();
  fetchActivePromotions.mockReset().mockResolvedValue([]);
});

describe("AdvertiserPublish — secuencia del flujo de publicación con créditos", () => {
  it("CON CRÉDITOS: al pulsar Publicar publica directo y descuenta (sin cuadro de pagos)", async () => {
    getCreditBalance.mockResolvedValue(1000); // saldo suficiente (créditos)
    seedDraft();
    render(<AdvertiserPublish />);

    // El formulario se cargó (borrador restaurado) y el saldo se leyó (1000 cr).
    await screen.findByDisplayValue("Casa bonita");
    await screen.findByText("1000 cr");

    uploadMainPhoto();
    fireEvent.click(screen.getByRole("button", { name: /publicar aviso/i }));

    // Publica directo: crea el aviso y descuenta el costo en créditos.
    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalledTimes(1));
    expect(spendCredits).toHaveBeenCalledWith(COST_CREDITS, "L1");

    // Muestra el éxito y NO abre el configurador de compra.
    await screen.findByText(/pago confirmado/i);
    expect(screen.queryByText(/créditos a comprar/i)).toBeNull();
  });

  it("SIN CRÉDITOS: al pulsar Publicar abre el configurador y NO publica", async () => {
    getCreditBalance.mockResolvedValue(0); // sin saldo
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");

    uploadMainPhoto();
    fireEvent.click(screen.getByRole("button", { name: /publicar aviso/i }));

    // Se abre el modal configurador (anuncios/días/extras → créditos).
    await screen.findByText(/créditos a comprar/i);
    expect(screen.getByText(/arma tu compra/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /comprar/i })).toBeTruthy();

    // No se publicó ni se descontó nada.
    expect(createAndPublishListing).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("CON PROMOCIÓN: aplica el descuento al costo al publicar (50% → 8.07)", async () => {
    getCreditBalance.mockResolvedValue(1000);
    fetchActivePromotions.mockResolvedValue([
      { id: "p1", name: "Día de la Madre", discount_pct: 50, starts_at: "", ends_at: "", category_ids: ["inmuebles"], is_active: true },
    ]);
    seedDraft(); // categoría "inmuebles"
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    // Espera a que la promo esté cargada y reflejada en el resumen.
    await screen.findByText(/Día de la Madre/i);

    uploadMainPhoto();
    fireEvent.click(screen.getByRole("button", { name: /publicar aviso/i }));

    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalledTimes(1));
    // Dinero: 16.14 × (1 − 0.50) = 8.07 soles. Créditos: round(8.07 × 10) = 81.
    expect(spendCredits).toHaveBeenCalledWith(81, "L1");
    expect(createAndPublishListing).toHaveBeenCalledWith(expect.objectContaining({ total: 8.07 }));
  });

  it("POST-COMPRA: tras comprar en el configurador, recién publica y descuenta", async () => {
    getCreditBalance.mockResolvedValue(0); // arranca sin saldo → abre el configurador
    purchaseCredits.mockResolvedValue({ newBalance: 1000, orderId: "o1", invoiceNumber: "B001-000100" });
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");

    uploadMainPhoto();
    fireEvent.click(screen.getByRole("button", { name: /publicar aviso/i }));
    await screen.findByText(/créditos a comprar/i);

    // Completa datos del comprobante y compra.
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "12345678" } });
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "comprador@correo.com" } });
    fireEvent.click(screen.getByRole("button", { name: /comprar/i }));

    // Al acreditarse y cubrir el costo, publica automáticamente y descuenta.
    await waitFor(() => expect(purchaseCredits).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalledTimes(1));
    expect(spendCredits).toHaveBeenCalledWith(COST_CREDITS, "L1");
    await screen.findByText(/pago confirmado/i);
  });
});
