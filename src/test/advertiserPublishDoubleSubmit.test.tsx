import { describe, it, expect, vi, beforeEach } from "vitest";
import { EnlaceFalso } from "./routerStubs";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// Regresión del bug de DOBLE PUBLICACIÓN / DOBLE COBRO de créditos.
// Los tres caminos que cobraban dos veces al usuario:
//   1) publicar → cerrar el modal de confirmación → volver a pulsar "Publicar"
//   2) doble toque rápido antes de que React vuelva a renderizar
//   3) el descuento de créditos falla → comprar créditos → se republicaba el aviso

beforeEach(prepararDom);

const getCreditBalance = vi.fn();
vi.mock("@/lib/credits", () => ({
  getCreditBalance: (...a: unknown[]) => getCreditBalance(...a),
}));

// Pasarela de pago (Izipay) simulada: createPayment → formToken; el formulario
// embebido (stub) dispara onPaid y el polling resuelve como pagado.
const createPayment = vi.fn();
const createPublishPayment = vi.fn();
const pollOrderStatus = vi.fn();
const getPurchaseResult = vi.fn();
vi.mock("@/lib/payments", () => ({
  createPayment: (...a: unknown[]) => createPayment(...a),
  createPublishPayment: (...a: unknown[]) => createPublishPayment(...a),
  pollOrderStatus: (...a: unknown[]) => pollOrderStatus(...a),
  getPurchaseResult: (...a: unknown[]) => getPurchaseResult(...a),
  hostedPaymentUrl: () => "https://x/pay",
  SaldoYaSuficiente: class SaldoYaSuficiente extends Error {},
}));
vi.mock("@/components/PaymentForm", () => ({
  PaymentForm: ({ onPaid }: { onPaid: () => void }) => <button onClick={onPaid}>SIMULAR_PAGO</button>,
}));

const createAndPublishListing = vi.fn();
const saveListingDraft = vi.fn();
vi.mock("@/lib/publish", () => ({
  createAndPublishListing: (...a: unknown[]) => createAndPublishListing(...a),
  saveListingDraft: (...a: unknown[]) => saveListingDraft(...a),
  SaldoInsuficiente: class SaldoInsuficiente extends Error {
    listingId?: string;
  },
}));

vi.mock("@/lib/verifyDoc", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  verifyDocument: vi.fn().mockResolvedValue({ ok: true, nombre: "JUAN PEREZ", data: {} }),
}));

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

const COST_CREDITS = 16.14; // 1 aviso × 7 días = 16.14 soles = 16.14 créditos

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

const publishButton = () => screen.getByRole("button", { name: /publicar aviso/i });
const confirmButton = () => screen.getByRole("button", { name: /confirmar y publicar/i });

// Publicar abre un ÚNICO modal de confirmación (la identidad viene del perfil).
const openConfirm = async () => {
  fireEvent.click(publishButton());
  await screen.findByText(/confirmar publicación/i);
};

// Confirmar en el modal encadena la publicación (o el configurador de compra).
const publishConfirmed = async () => {
  await openConfirm();
  fireEvent.click(confirmButton());
};

beforeEach(() => {
  localStorage.clear();
  getCreditBalance.mockReset().mockResolvedValue(1000);
  createPayment.mockReset().mockResolvedValue({ orderId: "o1", formToken: "tok", publicKey: "pk", amount: 16.14, listingCost: null });
  createPublishPayment.mockReset().mockResolvedValue({ orderId: "o1", formToken: "tok", publicKey: "pk", amount: 16.14, listingCost: 16.14 });
  pollOrderStatus.mockReset().mockResolvedValue("paid");
  getPurchaseResult.mockReset().mockResolvedValue({ balance: 1000, invoiceNumber: "B001-000100", published: null });
  createAndPublishListing.mockReset().mockResolvedValue({
    listingId: "L1", published: true,
  });
  saveListingDraft.mockReset().mockResolvedValue("L1");
  navigate.mockClear();
  toast.mockClear();
  fetchActivePromotions.mockReset().mockResolvedValue([]);
});

describe("AdvertiserPublish — no se puede publicar/cobrar dos veces", () => {
  it("CERRAR EL MODAL DE ÉXITO y volver a pulsar Publicar NO republica ni vuelve a cobrar", async () => {
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    await screen.findByText("S/ 1000");

    uploadMainPhoto();
    await publishConfirmed();

    await screen.findByText(/aviso publicado/i);
    expect(createAndPublishListing).toHaveBeenCalledTimes(1);

    // El usuario cierra la ventanita con Esc (no con los botones que navegan).
    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByText(/aviso publicado/i)).toBeNull());

    // El formulario quedó vacío: ya no hay aviso que reenviar.
    expect(screen.queryByDisplayValue("Casa bonita")).toBeNull();

    // Y aunque vuelva a pulsar el botón, no se publica ni se cobra otra vez.
    fireEvent.click(publishButton());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Completa los datos requeridos" })));
    expect(createAndPublishListing).toHaveBeenCalledTimes(1);
  });

  it("DOBLE TOQUE rápido en 'Confirmar' publica una sola vez y cobra una sola vez", async () => {
    // Confirmar es ahora el punto de envío real: encadena la publicación. El
    // ghost-click de touch→click del WebView de Android pega aquí, no en
    // "Publicar aviso".
    let resolvePublish: (v: unknown) => void = () => {};
    createAndPublishListing.mockReturnValue(new Promise((res) => { resolvePublish = res; }));

    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    await screen.findByText("S/ 1000");
    uploadMainPhoto();
    await openConfirm();

    // Tres clics en el MISMO task de JS: `.click()` nativo dentro de un solo
    // `act` corre los tres handlers antes de que React vuelva a renderizar.
    // Con `fireEvent` cada clic hace su propio flush y el cuadro ya estaría
    // cerrado en el segundo, que es justo lo que NO queremos probar.
    const btn = confirmButton();
    await act(async () => { btn.click(); btn.click(); btn.click(); });

    resolvePublish({ listingId: "L1", published: true });

    await screen.findByText(/aviso publicado/i);
    expect(createAndPublishListing).toHaveBeenCalledTimes(1);
  });

  it("DOBLE TOQUE en 'Publicar': abre el modal de confirmación y NO publica", async () => {
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    await screen.findByText("S/ 1000");
    uploadMainPhoto();

    const btn = publishButton();
    await act(async () => { btn.click(); btn.click(); btn.click(); });

    // Solo abre el modal de confirmación; no publica hasta confirmar.
    await screen.findByText(/confirmar publicación/i);
    expect(createAndPublishListing).not.toHaveBeenCalled();
  });

  it("MIENTRAS PUBLICA el botón queda deshabilitado y muestra 'Publicando…'", async () => {
    let resolvePublish: (v: unknown) => void = () => {};
    createAndPublishListing.mockReturnValue(new Promise((res) => { resolvePublish = res; }));

    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    await screen.findByText("S/ 1000");
    uploadMainPhoto();

    // Se captura el nodo antes: al publicar, el botón pasa a decir "Publicando…"
    // y deja de matchear /publicar/i.
    const btn = publishButton();
    await publishConfirmed();

    await waitFor(() => expect(btn).toBeDisabled());
    expect(screen.getByText(/publicando/i)).toBeTruthy();

    resolvePublish({ listingId: "L1", published: true });
    await screen.findByText(/aviso publicado/i);
  });

  it("SI FALTA SALDO: tras comprar, publica el MISMO aviso y no crea otro", async () => {
    // Antes esto era "el aviso se publicó pero el cobro falló", un estado que
    // ya no existe: desde la migración 0091 publicar y cobrar van juntos, así
    // que sin saldo no pasa ninguna de las dos cosas. Lo que SÍ sigue en pie es
    // el riesgo de duplicar: el aviso ya se creó como borrador (con sus fotos
    // subidas), y al reintentar hay que publicar ESE.
    const { SaldoInsuficiente } = await import("@/lib/publish");
    const falta = new SaldoInsuficiente("Tu saldo no alcanza para publicar este aviso.");
    falta.listingId = "L1";
    createAndPublishListing.mockRejectedValueOnce(falta);
    // Al montar se enseñan 1000; el rechazo de la BD viene justamente de que ese
    // saldo estaba obsoleto, así que al refrescarlo aparece el real: 0.
    getCreditBalance.mockResolvedValueOnce(1000).mockResolvedValue(0);
    // Se cobró y acreditó, pero el servidor no llegó a activar el aviso: es el
    // caso que obliga a la pantalla a publicarlo, y por tanto el que puede
    // duplicar si no reutiliza el borrador.
    getPurchaseResult.mockResolvedValue({ balance: 1000, invoiceNumber: "B001-000100", published: false });

    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    await screen.findByText("S/ 1000");
    uploadMainPhoto();

    await publishConfirmed();

    // Ni publicado ni cobrado: se ofrece pagar el aviso ahí mismo.
    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalledTimes(1));
    await screen.findByText(/a pagar ahora/i);
    // Y no se anuncia un éxito que no ocurrió.
    expect(screen.queryByText(/aviso publicado/i)).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "12345678" } });
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "comprador@correo.com" } });
    await screen.findByText("JUAN PEREZ");
    fireEvent.click(screen.getByRole("button", { name: /pagar y publicar/i }));
    fireEvent.click(await screen.findByText("SIMULAR_PAGO"));

    // El cobro va atado al aviso que ya existía, no a un paquete de saldo.
    await waitFor(() => expect(createPublishPayment).toHaveBeenCalledTimes(1));
    expect(createPublishPayment).toHaveBeenCalledWith(expect.objectContaining({ listingId: "L1" }));
    await screen.findByText(/aviso publicado/i);

    // Clave: el segundo intento reutiliza el aviso que ya existía.
    expect(createAndPublishListing).toHaveBeenCalledTimes(2);
    expect(createAndPublishListing).toHaveBeenNthCalledWith(2, expect.objectContaining({ draftId: "L1" }));
  });
});
