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
vi.mock("@/lib/credits", () => ({
  getCreditBalance: (...a: unknown[]) => getCreditBalance(...a),
}));

// Pasarela de pago (Izipay). El pago se simula: createPayment devuelve un
// formToken, el formulario embebido (stub) dispara onPaid y el polling resuelve.
const createPayment = vi.fn();
const pollOrderStatus = vi.fn();
const getPurchaseResult = vi.fn();
vi.mock("@/lib/payments", () => ({
  createPayment: (...a: unknown[]) => createPayment(...a),
  pollOrderStatus: (...a: unknown[]) => pollOrderStatus(...a),
  getPurchaseResult: (...a: unknown[]) => getPurchaseResult(...a),
  hostedPaymentUrl: () => "https://x/pay",
}));
vi.mock("@/components/PaymentForm", () => ({
  PaymentForm: ({ onPaid }: { onPaid: () => void }) => <button onClick={onPaid}>SIMULAR_PAGO</button>,
}));

// Desde la migración 0091 el cobro ocurre DENTRO de `publish_listing`, en la
// base de datos. Estas pruebas ya no pueden comprobar cuánto se cobró —de eso
// se encarga src/test/migration0091.test.ts, contra un Postgres de verdad—;
// aquí se comprueba el precio que la pantalla calcula y arrastra.
const createAndPublishListing = vi.fn();
vi.mock("@/lib/publish", () => ({
  createAndPublishListing: (...a: unknown[]) => createAndPublishListing(...a),
  SaldoInsuficiente: class SaldoInsuficiente extends Error {},
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
  // Stub de Link: los tests no montan un <Router>, así que el <Link> real (de un
  // hijo del wizard) reventaba al leer el contexto de router. Con un <a> basta.
  return { ...actual, useNavigate: () => navigate, Link: ({ children, to, ...rest }: any) => <a href={typeof to === "string" ? to : undefined} {...rest}>{children}</a> };
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
    form: { category: "inmuebles", title: "Casa bonita", description: "Descripción larga del aviso", price: "100", currency: "PEN", department: "15", location: "Lima", condition: "nuevo" },
    duration: 7, quantity: 1, extras: {},
  }));
};

const uploadMainPhoto = () => {
  const fileInput = document.querySelectorAll("input[type=file]")[0] as HTMLInputElement;
  const file = new File(["img"], "portada.png", { type: "image/png" });
  Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
  fireEvent.change(fileInput);
};

// Publicar ya NO abre un modal de verificación: la identidad viene del perfil
// (verificada al comprar saldo). Pulsar "Publicar aviso" abre un ÚNICO modal de
// confirmación; al confirmar se encadena el flujo (publica o abre el configurador
// de compra si falta saldo).
const clickPublish = async () => {
  fireEvent.click(screen.getByRole("button", { name: /publicar aviso/i }));
  fireEvent.click(await screen.findByRole("button", { name: /confirmar y publicar/i }));
};

beforeEach(() => {
  localStorage.clear();
  getCreditBalance.mockReset();
  createPayment.mockReset().mockResolvedValue({ orderId: "o1", formToken: "tok", publicKey: "pk" });
  pollOrderStatus.mockReset().mockResolvedValue("paid");
  getPurchaseResult.mockReset().mockResolvedValue({ balance: 1000, invoiceNumber: "B001-000100" });
  createAndPublishListing.mockReset().mockResolvedValue({
    listingId: "L1", published: true,
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
    await screen.findByText("S/ 1000");

    uploadMainPhoto();
    await clickPublish();

    // Publica directo: crea el aviso y descuenta el costo en créditos.
    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalledTimes(1));
    expect(createAndPublishListing).toHaveBeenCalledWith(expect.objectContaining({ total: COST_SOLES }));

    // Muestra el éxito y NO abre el configurador de compra.
    await screen.findByText(/aviso publicado/i);
    expect(screen.queryByText(/saldo a comprar/i)).toBeNull();
  });

  it("RESPETA LA DURACIÓN elegida: publica por los días que el usuario seleccionó y pagó", async () => {
    getCreditBalance.mockResolvedValue(1000);
    seedDraft(); // el borrador trae 7 días; el usuario cambia a 90 antes de publicar
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");

    // Selecciona "90 días" en el bloque "Duración del aviso".
    const btn90 = screen.getByText("90").closest("button");
    if (!btn90) throw new Error("No se encontró el botón de 90 días");
    fireEvent.click(btn90);

    uploadMainPhoto();
    await clickPublish();

    // La duración que llega a la publicación es la elegida (90), no la del borrador (7).
    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalledTimes(1));
    expect(createAndPublishListing).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 90, total: 113.49 }),
    );
  });

  it("SIN CRÉDITOS: al pulsar Publicar abre el configurador y NO publica", async () => {
    getCreditBalance.mockResolvedValue(0); // sin saldo
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");

    uploadMainPhoto();
    await clickPublish();

    // Se abre el modal configurador (anuncios/días/extras → créditos).
    await screen.findByText(/saldo a comprar/i);
    expect(screen.getByText(/arma tu compra/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /continuar al pago/i })).toBeTruthy();

    // No se publicó nada (y como el cobro va dentro, tampoco se cobró).
    expect(createAndPublishListing).not.toHaveBeenCalled();
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
    await clickPublish();

    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalledTimes(1));
    // Dinero: 16.14 × (1 − 0.50) = 8.07 soles.
    expect(createAndPublishListing).toHaveBeenCalledWith(expect.objectContaining({ total: 8.07 }));
  });

  it("POST-COMPRA: tras pagar en el configurador, recién publica y descuenta", async () => {
    getCreditBalance.mockResolvedValue(0); // arranca sin saldo → abre el configurador
    getPurchaseResult.mockResolvedValue({ balance: 1000, invoiceNumber: "B001-000100" });
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");

    uploadMainPhoto();
    await clickPublish();
    await screen.findByText(/saldo a comprar/i);

    // Completa datos del comprobante y continúa al pago.
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "12345678" } });
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "comprador@correo.com" } });
    // El DNI se autoverifica con Factiliza; esperamos a que confirme antes de pagar.
    await screen.findByText("JUAN PEREZ");
    fireEvent.click(screen.getByRole("button", { name: /continuar al pago/i }));

    // Paga en el formulario embebido (stub) → se confirma por polling.
    fireEvent.click(await screen.findByText("SIMULAR_PAGO"));

    // Al acreditarse y cubrir el costo, publica automáticamente y descuenta.
    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalledTimes(1));
    expect(createAndPublishListing).toHaveBeenCalledWith(expect.objectContaining({ total: COST_SOLES }));
    await screen.findByText(/aviso publicado/i);
  });
});

describe("AdvertiserPublish — un solo modal de confirmación (sin verificación al publicar)", () => {
  it("pulsar Publicar abre SOLO el modal de confirmación y NO abre el cuadro de identidad", async () => {
    getCreditBalance.mockResolvedValue(1000); // saldo de sobra
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    uploadMainPhoto();

    fireEvent.click(screen.getByRole("button", { name: /publicar aviso/i }));

    // Aparece el modal de confirmación, NO el de verificación de identidad.
    await screen.findByText(/confirmar publicación/i);
    expect(screen.queryByText(/verifica tu identidad/i)).toBeNull();
    // Aún no publica: espera la confirmación explícita.
    expect(createAndPublishListing).not.toHaveBeenCalled();
  });

  it("al confirmar en el modal, recién publica y descuenta", async () => {
    getCreditBalance.mockResolvedValue(1000);
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    uploadMainPhoto();

    fireEvent.click(screen.getByRole("button", { name: /publicar aviso/i }));
    fireEvent.click(await screen.findByRole("button", { name: /confirmar y publicar/i }));

    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalledTimes(1));
    expect(createAndPublishListing).toHaveBeenCalledWith(expect.objectContaining({ total: COST_SOLES }));
    await screen.findByText(/aviso publicado/i);
  });
});

// La foto dejó de ser obligatoria: quien no sube ninguna publica igual y su
// aviso sale con la imagen de la marca. Era el motivo más tonto por el que un
// anunciante abandonaba a mitad del formulario.
describe("AdvertiserPublish — publicar sin foto", () => {
  it("el botón de publicar NO espera a que se suba una imagen", async () => {
    getCreditBalance.mockResolvedValue(1000);
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");

    // Sin llamar a uploadMainPhoto().
    expect(screen.getByRole("button", { name: /publicar aviso/i })).toBeEnabled();
  });

  it("publica de verdad, y le dice a la capa de datos que no hay portada", async () => {
    getCreditBalance.mockResolvedValue(1000);
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");

    await clickPublish();

    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalledTimes(1));
    expect(createAndPublishListing.mock.calls[0][0].mainPhoto).toBeNull();
    await screen.findByText(/aviso publicado/i);
  });

  it("avisa en el formulario de que la imagen es opcional", async () => {
    getCreditBalance.mockResolvedValue(1000);
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    // Si no se dice, el anunciante supone que sin foto no puede seguir.
    expect(screen.getByText(/saldrá con la imagen de eFFe/i)).toBeInTheDocument();
  });

  it("el medidor de avance no penaliza por no tener foto", async () => {
    getCreditBalance.mockResolvedValue(1000);
    seedDraft(); // borrador con TODO lo obligatorio relleno
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    // Antes se quedaba en 83% para siempre y parecía que faltaba algo.
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
