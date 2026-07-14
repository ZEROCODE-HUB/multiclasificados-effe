import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// Regresión del bug de DOBLE PUBLICACIÓN / DOBLE COBRO de créditos.
// Los tres caminos que cobraban dos veces al usuario:
//   1) publicar → cerrar el modal de confirmación → volver a pulsar "Publicar"
//   2) doble toque rápido antes de que React vuelva a renderizar
//   3) el descuento de créditos falla → comprar créditos → se republicaba el aviso

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
  (URL as any).createObjectURL = () => "blob:mock";
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

const getCreditBalance = vi.fn();
const spendCredits = vi.fn();
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
  return { ...actual, useNavigate: () => navigate };
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
  spendCredits.mockReset().mockResolvedValue(true);
  purchaseCredits.mockReset();
  createAndPublishListing.mockReset().mockResolvedValue({
    listingId: "L1", invoiceNumber: "B001-000099", published: true, invoiceSaved: true,
  });
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

    await screen.findByText(/pago confirmado/i);
    expect(createAndPublishListing).toHaveBeenCalledTimes(1);
    expect(spendCredits).toHaveBeenCalledTimes(1);

    // El usuario cierra la ventanita con Esc (no con los botones que navegan).
    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByText(/pago confirmado/i)).toBeNull());

    // El formulario quedó vacío: ya no hay aviso que reenviar.
    expect(screen.queryByDisplayValue("Casa bonita")).toBeNull();

    // Y aunque vuelva a pulsar el botón, no se publica ni se cobra otra vez.
    fireEvent.click(publishButton());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Completa los datos requeridos" })));
    expect(createAndPublishListing).toHaveBeenCalledTimes(1);
    expect(spendCredits).toHaveBeenCalledTimes(1);
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

    resolvePublish({ listingId: "L1", invoiceNumber: "B001-000099", published: true, invoiceSaved: true });

    await screen.findByText(/pago confirmado/i);
    expect(createAndPublishListing).toHaveBeenCalledTimes(1);
    expect(spendCredits).toHaveBeenCalledTimes(1);
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
    expect(spendCredits).not.toHaveBeenCalled();
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

    resolvePublish({ listingId: "L1", invoiceNumber: "B001-000099", published: true, invoiceSaved: true });
    await screen.findByText(/pago confirmado/i);
  });

  it("SI FALLA EL COBRO: al comprar créditos se cobra el aviso ya publicado, no se republica", async () => {
    // El aviso se publica, pero el saldo cambió y spend_credits devuelve false.
    spendCredits.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    purchaseCredits.mockResolvedValue({ newBalance: 1000, orderId: "o1", invoiceNumber: "B001-000100" });

    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    await screen.findByText("S/ 1000");
    uploadMainPhoto();

    await publishConfirmed();

    // Publicó una vez, no cobró, y abrió el configurador de compra.
    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalledTimes(1));
    await screen.findByText(/saldo a comprar/i);
    // No se anuncia un pago que no ocurrió.
    expect(screen.queryByText(/pago confirmado/i)).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "12345678" } });
    fireEvent.change(screen.getByPlaceholderText("tu@correo.com"), { target: { value: "comprador@correo.com" } });
    await screen.findByText("JUAN PEREZ");
    fireEvent.click(screen.getByRole("button", { name: /comprar/i }));

    await waitFor(() => expect(purchaseCredits).toHaveBeenCalledTimes(1));
    await screen.findByText(/pago confirmado/i);

    // Clave: el aviso NO se volvió a crear; solo se cobró el que ya existía.
    expect(createAndPublishListing).toHaveBeenCalledTimes(1);
    expect(spendCredits).toHaveBeenCalledTimes(2);
    expect(spendCredits).toHaveBeenNthCalledWith(2, COST_CREDITS, "L1");
  });
});
