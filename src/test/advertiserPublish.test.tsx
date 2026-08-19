import { describe, it, expect, vi, beforeEach } from "vitest";
import { EnlaceFalso } from "./routerStubs";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// --- Polyfills que Radix (Dialog) y la subida de foto necesitan en jsdom ---
beforeEach(prepararDom);

// --- Mocks de la capa de datos y del entorno ---
const getCreditBalance = vi.fn();
vi.mock("@/lib/credits", () => ({
  getCreditBalance: (...a: unknown[]) => getCreditBalance(...a),
}));

// Pasarela de pago (Izipay). El pago se simula: createPayment devuelve un
// formToken, el formulario embebido (stub) dispara onPaid y el polling resuelve.
const createPayment = vi.fn();
const createPublishPayment = vi.fn();
const pollOrderStatus = vi.fn();
const getPurchaseResult = vi.fn();
// `importOriginal` en vez de enumerar: el módulo real exporta más cosas de las
// que este test simula (SaldoYaSuficiente, esPagoManual…), y sin ellas el
// componente revienta en cuanto añadimos una exportación nueva.
vi.mock("@/lib/payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments")>()),

  createPayment: (...a: unknown[]) => createPayment(...a),
  createPublishPayment: (...a: unknown[]) => createPublishPayment(...a),
  pollOrderStatus: (...a: unknown[]) => pollOrderStatus(...a),
  getPurchaseResult: (...a: unknown[]) => getPurchaseResult(...a),
  hostedPaymentUrl: () => "https://x/pay",
  SaldoYaSuficiente: class SaldoYaSuficiente extends Error {},
}));
vi.mock("@/components/PaymentForm", () => ({
  PaymentForm: ({ onPaid }: { onPaid: () => void }) => <button onClick={onPaid}>SIMULAR_PAGO</button>,
  precargarKrypton: () => {},
}));

// Desde la migración 0091 el cobro ocurre DENTRO de `publish_listing`, en la
// base de datos. Estas pruebas ya no pueden comprobar cuánto se cobró —de eso
// se encarga src/test/migration0091.test.ts, contra un Postgres de verdad—;
// aquí se comprueba el precio que la pantalla calcula y arrastra.
const createAndPublishListing = vi.fn();
// Sin saldo, la pantalla guarda el aviso ANTES de cobrar: la orden de pago va
// atada a él y es el servidor quien lo publica al confirmarse el pago.
const saveListingDraft = vi.fn();
// Publicar un aviso que YA está guardado con sus fotos: no se vuelve a subir nada.
const finalizeListingPublication = vi.fn();
vi.mock("@/lib/publish", () => ({
  createAndPublishListing: (...a: unknown[]) => createAndPublishListing(...a),
  saveListingDraft: (...a: unknown[]) => saveListingDraft(...a),
  finalizeListingPublication: (...a: unknown[]) => finalizeListingPublication(...a),
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
  return { ...actual, useNavigate: () => navigate, Link: EnlaceFalso };
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
  createPayment.mockReset().mockResolvedValue({ orderId: "o1", formToken: "tok", publicKey: "pk", amount: 16.14, listingCost: null });
  createPublishPayment.mockReset().mockResolvedValue({ orderId: "o1", formToken: "tok", publicKey: "pk", amount: 16.14, listingCost: 16.14 });
  pollOrderStatus.mockReset().mockResolvedValue("paid");
  getPurchaseResult.mockReset().mockResolvedValue({ balance: 1000, invoiceNumber: "B001-000100", published: null });
  createAndPublishListing.mockReset().mockResolvedValue({
    listingId: "L1", published: true,
  });
  saveListingDraft.mockReset().mockResolvedValue("L1");
  finalizeListingPublication.mockReset().mockResolvedValue({ published: true });
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
    await screen.findByText("S/ 1,000.00");

    uploadMainPhoto();
    await clickPublish();

    // Publica directo: crea el aviso y descuenta el costo en créditos.
    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalledTimes(1));
    expect(createAndPublishListing).toHaveBeenCalledWith(expect.objectContaining({ total: COST_SOLES }), expect.any(Function));

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
      expect.any(Function),
    );
  });

  it("SIN CRÉDITOS: guarda el aviso y ofrece pagarlo en el acto, sin publicar", async () => {
    getCreditBalance.mockResolvedValue(0); // sin saldo
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");

    uploadMainPhoto();
    await clickPublish();

    // Cobra el aviso, no manda a armar una compra de saldo.
    await screen.findByText(/a pagar ahora/i);
    expect(screen.getByRole("button", { name: /pagar y publicar/i })).toBeTruthy();
    // El configurador de saldo ya no aparece de entrada.
    expect(screen.queryByText(/saldo a comprar/i)).toBeNull();

    // El aviso queda guardado para poder atarle el pago…
    await waitFor(() => expect(saveListingDraft).toHaveBeenCalledTimes(1));
    // …pero no se publicó (ni se cobró, que van juntos).
    expect(createAndPublishListing).not.toHaveBeenCalled();
  });

  it("SIN CRÉDITOS: quien prefiera cargar saldo suelto sigue teniendo el configurador", async () => {
    getCreditBalance.mockResolvedValue(0);
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");

    uploadMainPhoto();
    await clickPublish();
    await screen.findByText(/a pagar ahora/i);

    fireEvent.click(screen.getByRole("button", { name: /prefiero solo comprar saldo/i }));

    await screen.findByText(/saldo a comprar/i);
    expect(screen.getByText(/arma tu compra/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /continuar al pago/i })).toBeTruthy();
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
    expect(createAndPublishListing).toHaveBeenCalledWith(expect.objectContaining({ total: 8.07 }), expect.any(Function));
  });

  // Paga en el modal (rellena comprobante → tarjeta → confirma por polling).
  const pagarEnElModal = async () => {
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "12345678" } });
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "comprador@correo.com" } });
    // El DNI se autoverifica con Factiliza; esperamos a que confirme antes de pagar.
    await screen.findByText("JUAN PEREZ");
    fireEvent.click(screen.getByRole("button", { name: /pagar y publicar/i }));
    fireEvent.click(await screen.findByText("SIMULAR_PAGO"));
  };

  it("PAGO Y PUBLICACIÓN: el servidor publica el aviso y la pantalla no vuelve a publicarlo", async () => {
    getCreditBalance.mockResolvedValue(0); // arranca sin saldo → cobra el aviso
    // El webhook acreditó, publicó y emitió la boleta antes de que respondiéramos.
    getPurchaseResult.mockResolvedValue({ balance: 0, invoiceNumber: "B001-000100", published: true });
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");

    uploadMainPhoto();
    await clickPublish();
    await screen.findByText(/a pagar ahora/i);
    await pagarEnElModal();

    // Se cobró el aviso, no un paquete de saldo.
    await waitFor(() => expect(createPublishPayment).toHaveBeenCalledTimes(1));
    expect(createPublishPayment).toHaveBeenCalledWith(expect.objectContaining({ listingId: "L1" }));
    expect(createPayment).not.toHaveBeenCalled();

    // Ya está activo: publicarlo otra vez sería un error de "ya publicado".
    await screen.findByText(/aviso publicado/i);
    expect(createAndPublishListing).not.toHaveBeenCalled();
  });

  it("PAGO SIN PUBLICAR: si el servidor no llegó a activarlo, la pantalla lo remata una vez", async () => {
    getCreditBalance.mockResolvedValue(0);
    // Cobrado y acreditado, pero la publicación no salió: el saldo ya alcanza.
    getPurchaseResult.mockResolvedValue({ balance: 1000, invoiceNumber: "B001-000100", published: false });
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");

    uploadMainPhoto();
    await clickPublish();
    await screen.findByText(/a pagar ahora/i);
    await pagarEnElModal();

    // Se publica el MISMO aviso (el borrador ya creado), una sola vez, y SIN
    // volver a subir las fotos: ya están arriba desde el primer intento.
    await waitFor(() => expect(finalizeListingPublication).toHaveBeenCalledTimes(1));
    expect(finalizeListingPublication.mock.calls[0][0]).toBe("L1");
    expect(finalizeListingPublication.mock.calls[0][1]).toEqual(
      expect.objectContaining({ total: COST_SOLES }),
    );
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
    expect(createAndPublishListing).toHaveBeenCalledWith(expect.objectContaining({ total: COST_SOLES }), expect.any(Function));
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
