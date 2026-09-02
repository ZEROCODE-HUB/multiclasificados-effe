import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EnlaceFalso } from "./routerStubs";
import { render, screen } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// "Publicar uno igual": llega ?copiar=<id> y el formulario aparece relleno con
// los datos de ese aviso, pero creando uno NUEVO. El original no se toca.
beforeEach(prepararDom);

const cargarAvisoParaCopiar = vi.fn();
const createAndPublishListing = vi.fn();
const saveListingDraft = vi.fn();

vi.mock("@/lib/publish", () => ({
  cargarAvisoParaCopiar: (...a: unknown[]) => cargarAvisoParaCopiar(...a),
  createAndPublishListing: (...a: unknown[]) => createAndPublishListing(...a),
  finalizeListingPublication: vi.fn(),
  saveListingDraft: (...a: unknown[]) => saveListingDraft(...a),
  SaldoInsuficiente: class extends Error {},
}));
vi.mock("@/lib/credits", () => ({ getCreditBalance: vi.fn().mockResolvedValue(1000) }));
// `importOriginal` en vez de enumerar: el módulo real exporta más cosas de las
// que este test simula (SaldoYaSuficiente, esPagoManual…), y sin ellas el
// componente revienta en cuanto añadimos una exportación nueva.
vi.mock("@/lib/payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments")>()),

  createPayment: vi.fn(), createPublishPayment: vi.fn(), pollOrderStatus: vi.fn(),
  getPurchaseResult: vi.fn(), hostedPaymentUrl: () => "https://x/pay",
  SaldoYaSuficiente: class extends Error {},
}));
vi.mock("@/components/PaymentForm", () => ({ PaymentForm: () => <div />, precargarKrypton: () => {} }));
vi.mock("@/lib/verifyDoc", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  verifyDocument: vi.fn().mockResolvedValue({ ok: true, nombre: "JUAN", data: {} }),
}));
vi.mock("@/lib/promotions", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  fetchActivePromotions: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { email: "t@correo.com" } } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
  },
}));
vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  useNavigate: () => vi.fn(), Link: EnlaceFalso,
}));
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ role: "anunciante", name: "Test", initials: "T", supabase: true }),
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import AdvertiserPublish from "@/pages/advertiser/AdvertiserPublish";

const copia = (extra: Record<string, unknown> = {}) => ({
  form: {
    category: "inmuebles", title: "Casa en Miraflores", description: "Bonita casa",
    price: "250000", currency: "PEN", department: "15", location: "Miraflores", condition: "usado",
  },
  lat: -12.1, lng: -77.03,
  duration: 30, quantity: 1, extras: { urgente: 1 },
  mainPhoto: null, extraPhotos: [], videos: [], pdf: null,
  faltanAdjuntos: false,
  ...extra,
});

/** Un vídeo del aviso original, como orden de copia (no como archivo). */
const videoCopiado = (i: number) => ({
  file: new File([], `video-${i}.mp4`),
  name: `video-${i}.mp4`,
  copiarDe: `u1/original/${i - 1}-video.mp4`,
  urlOrigen: `https://cdn/videos/${i}.mp4`,
});

const conUrl = (busqueda: string) => {
  window.history.replaceState({}, "", `/dashboard/anunciante/publicar${busqueda}`);
};

beforeEach(() => {
  localStorage.clear();
  toast.mockClear();
  cargarAvisoParaCopiar.mockReset().mockResolvedValue(copia());
  createAndPublishListing.mockReset();
});
afterEach(() => window.history.replaceState({}, "", "/"));

describe("AdvertiserPublish — publicar uno igual", () => {
  it("sin ?copiar no pide nada: el formulario arranca vacío", async () => {
    conUrl("");
    render(<AdvertiserPublish />);
    await screen.findByRole("button", { name: /publicar aviso/i });
    expect(cargarAvisoParaCopiar).not.toHaveBeenCalled();
  });

  it("con ?copiar rellena el formulario con los datos del aviso", async () => {
    conUrl("?copiar=abc-123");
    render(<AdvertiserPublish />);

    await screen.findByDisplayValue("Casa en Miraflores");
    expect(cargarAvisoParaCopiar).toHaveBeenCalledWith("abc-123");
    expect(screen.getByDisplayValue("Bonita casa")).toBeTruthy();
    expect(screen.getByDisplayValue("250000")).toBeTruthy();
  });

  it("avisa si alguna imagen no se pudo copiar, pero rellena el resto", async () => {
    cargarAvisoParaCopiar.mockResolvedValue(copia({ faltanAdjuntos: true }));
    conUrl("?copiar=abc-123");
    render(<AdvertiserPublish />);

    await screen.findByDisplayValue("Casa en Miraflores");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining("No pudimos traer alguna imagen"),
    }));
  });

  it("TRAE LOS VÍDEOS del aviso original", async () => {
    /**
     * LO QUE REPORTÓ EL CLIENTE: al republicar, "me pidió poner una imagen
     * adicional o video, y creo que no lo trajo".
     *
     * Y no lo traía: `cargarAvisoParaCopiar` leía `listing_images` y el PDF,
     * pero NO `listing_videos`. Así que la copia llegaba con el paquete
     * contratado —"3 videos", que es lo que se paga— y ningún vídeo detrás, y
     * al publicar saltaba "Contrataste 3 videos y subiste 0".
     */
    cargarAvisoParaCopiar.mockResolvedValue(copia({
      extras: { video20: 2 },
      videos: [videoCopiado(1), videoCopiado(2)],
    }));
    conUrl("?copiar=abc-123");
    render(<AdvertiserPublish />);

    await screen.findByDisplayValue("Casa en Miraflores");
    // Los dos huecos contratados salen ocupados, no vacíos pidiendo archivo.
    expect(await screen.findByText("video-1.mp4")).toBeInTheDocument();
    expect(screen.getByText("video-2.mp4")).toBeInTheDocument();
    // Y el botón de agregar ya no aparece: los dos contratados están puestos.
    expect(screen.queryByText(/Agregar video \(/)).toBeNull();
  });

  it("un aviso sin vídeos sigue funcionando igual", async () => {
    // La lista vacía es el caso normal: casi ningún aviso lleva vídeo.
    cargarAvisoParaCopiar.mockResolvedValue(copia({ videos: [] }));
    conUrl("?copiar=abc-123");
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa en Miraflores");
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({
      title: "No se pudo copiar el aviso",
    }));
  });

  it("si el aviso no se puede leer, lo dice y no deja el formulario a medias", async () => {
    cargarAvisoParaCopiar.mockRejectedValue(new Error("No se pudo cargar el aviso que quieres copiar."));
    conUrl("?copiar=abc-123");
    render(<AdvertiserPublish />);

    await screen.findByRole("button", { name: /publicar aviso/i });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "No se pudo copiar el aviso" }));
  });
});
