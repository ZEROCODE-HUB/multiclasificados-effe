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

// Verificación de documento contra Factiliza (RENIEC/SUNAT). Por defecto el
// documento existe; los tests que prueban el rechazo la sobreescriben.
const verifyDocument = vi.fn();
vi.mock("@/lib/verifyDoc", async (orig) => ({
  // normalizeDocNumber va REAL: es lo que limpia lo que el usuario pega.
  ...(await (orig() as Promise<Record<string, unknown>>)),
  verifyDocument: (...a: unknown[]) => verifyDocument(...a),
}));

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
const COST_CREDITS = 16.14; // 1 crédito = 1 sol

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

// Publicar exige verificar el documento contra RENIEC/SUNAT y confirmar la ficha
// devuelta. Pulsa "Publicar aviso", completa el DNI y confirma; al confirmar se
// encadena el flujo de publicación (publica o abre el configurador de compra).
const publishAndConfirmIdentity = async () => {
  fireEvent.click(screen.getByRole("button", { name: /publicar aviso/i }));
  fireEvent.click(await screen.findByRole("button", { name: /persona natural/i }));
  fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "12345678" } });
  await screen.findByText("JUAN PEREZ");
  fireEvent.click(screen.getByRole("button", { name: /confirmar y continuar/i }));
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
  verifyDocument.mockReset().mockResolvedValue({ ok: true, nombre: "JUAN PEREZ", data: {} });
});

describe("AdvertiserPublish — secuencia del flujo de publicación con créditos", () => {
  it("CON CRÉDITOS: al pulsar Publicar publica directo y descuenta (sin cuadro de pagos)", async () => {
    getCreditBalance.mockResolvedValue(1000); // saldo suficiente (créditos)
    seedDraft();
    render(<AdvertiserPublish />);

    // El formulario se cargó (borrador restaurado) y el saldo se leyó (1000 créditos).
    await screen.findByDisplayValue("Casa bonita");
    await screen.findByText("1000 créditos");

    uploadMainPhoto();
    await publishAndConfirmIdentity();

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
    await publishAndConfirmIdentity();

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
    await publishAndConfirmIdentity();

    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalledTimes(1));
    // Dinero: 16.14 × (1 − 0.50) = 8.07 soles. Créditos: round(8.07 × 10) = 81.
    expect(spendCredits).toHaveBeenCalledWith(8.07, "L1");
    expect(createAndPublishListing).toHaveBeenCalledWith(expect.objectContaining({ total: 8.07 }));
  });

  it("POST-COMPRA: tras comprar en el configurador, recién publica y descuenta", async () => {
    getCreditBalance.mockResolvedValue(0); // arranca sin saldo → abre el configurador
    purchaseCredits.mockResolvedValue({ newBalance: 1000, orderId: "o1", invoiceNumber: "B001-000100" });
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");

    uploadMainPhoto();
    await publishAndConfirmIdentity();
    await screen.findByText(/créditos a comprar/i);

    // Completa datos del comprobante y compra.
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "12345678" } });
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "comprador@correo.com" } });
    // El DNI se autoverifica con Factiliza; esperamos a que confirme antes de comprar.
    await screen.findByText("JUAN PEREZ");
    fireEvent.click(screen.getByRole("button", { name: /comprar/i }));

    // Al acreditarse y cubrir el costo, publica automáticamente y descuenta.
    await waitFor(() => expect(purchaseCredits).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalledTimes(1));
    expect(spendCredits).toHaveBeenCalledWith(COST_CREDITS, "L1");
    await screen.findByText(/pago confirmado/i);
  });
});

describe("AdvertiserPublish — la identidad se valida contra RENIEC/SUNAT", () => {
  it("NO publica sin verificar: pulsar Publicar abre el cuadro de identidad", async () => {
    getCreditBalance.mockResolvedValue(1000); // saldo de sobra: nada más lo frena
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    uploadMainPhoto();

    fireEvent.click(screen.getByRole("button", { name: /publicar aviso/i }));

    await screen.findByText(/verifica tu identidad/i);
    expect(createAndPublishListing).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("DNI FALSO (12345678): Factiliza no lo encuentra, se muestra el error y NO se publica", async () => {
    verifyDocument.mockResolvedValue({ ok: false, error: "No se encontró el documento." });
    getCreditBalance.mockResolvedValue(1000);
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    uploadMainPhoto();

    fireEvent.click(screen.getByRole("button", { name: /publicar aviso/i }));
    fireEvent.click(await screen.findByRole("button", { name: /persona natural/i }));
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "12345678" } });

    // Se consultó de verdad y el error de RENIEC llega al usuario.
    await waitFor(() => expect(verifyDocument).toHaveBeenCalledWith("dni", "12345678"));
    await screen.findByText(/no se encontró el documento/i);

    // "Confirmar y continuar" sigue bloqueado: sin ficha no hay nada que confirmar.
    expect(screen.getByRole("button", { name: /confirmar y continuar/i })).toBeDisabled();
    expect(createAndPublishListing).not.toHaveBeenCalled();
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("consulta Factiliza UNA sola vez por documento (no en cada render)", async () => {
    getCreditBalance.mockResolvedValue(1000);
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    uploadMainPhoto();

    fireEvent.click(screen.getByRole("button", { name: /publicar aviso/i }));
    fireEvent.click(await screen.findByRole("button", { name: /persona natural/i }));
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "12345678" } });
    await screen.findByText("JUAN PEREZ");

    // Cada consulta cuesta saldo de Factiliza y expone datos personales.
    expect(verifyDocument).toHaveBeenCalledTimes(1);
  });

  it("un borrador con {verified:true} en localStorage NO salta la verificación", async () => {
    getCreditBalance.mockResolvedValue(1000);
    // El borrador vive en localStorage: el usuario puede editarlo a mano.
    localStorage.setItem("effe:publish-draft", JSON.stringify({
      form: { category: "inmuebles", title: "Casa bonita", description: "Descripción larga del aviso", price: "100", currency: "PEN", location: "Lima", condition: "nuevo" },
      duration: 7, quantity: 1, extras: {},
      verified: true, verifiedName: "QUIEN SEA", personType: "natural", docNumber: "12345678",
    }));
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    uploadMainPhoto();

    fireEvent.click(screen.getByRole("button", { name: /publicar aviso/i }));

    await screen.findByText(/verifica tu identidad/i);
    expect(createAndPublishListing).not.toHaveBeenCalled();
  });
});
