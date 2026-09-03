import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EnlaceFalso } from "./routerStubs";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

/**
 * Editar un aviso YA PUBLICADO: `?editar=<id>` en la pantalla de publicar.
 *
 * Se reutiliza la pantalla de crear porque las validaciones, la compresión de
 * imágenes, el mapa y el control de adjuntos son los mismos, y duplicarlos
 * garantiza que dentro de unos meses el aviso creado valide una cosa y el
 * editado otra.
 *
 * Lo que NO se comparte es el cobro, y eso es lo que se fija aquí: que el bloque
 * de duración y adicionales **ni se pinte**, que no haya panel de costo, y que
 * el botón sea otro. La diferencia es estructural y no una bandera dentro del
 * mismo botón, porque un botón que a veces cobra acaba cobrando cuando no debe.
 */
beforeEach(prepararDom);

const cargarAvisoParaContinuar = vi.fn();
const guardarCambiosDeAviso = vi.fn();
const createAndPublishListing = vi.fn();
const finalizeListingPublication = vi.fn();

vi.mock("@/lib/publish", () => ({
  cargarAvisoParaCopiar: vi.fn(),
  cargarAvisoParaContinuar: (...a: unknown[]) => cargarAvisoParaContinuar(...a),
  guardarCambiosDeAviso: (...a: unknown[]) => guardarCambiosDeAviso(...a),
  createAndPublishListing: (...a: unknown[]) => createAndPublishListing(...a),
  finalizeListingPublication: (...a: unknown[]) => finalizeListingPublication(...a),
  saveListingDraft: vi.fn(),
  SaldoInsuficiente: class extends Error {},
}));
vi.mock("@/lib/credits", () => ({ getCreditBalance: vi.fn().mockResolvedValue(1000) }));
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
const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  useNavigate: () => navigate, Link: EnlaceFalso,
}));
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ role: "anunciante", name: "Test", initials: "T", supabase: true }),
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import AdvertiserPublish from "@/pages/advertiser/AdvertiserPublish";

const AVISO = (extra: Record<string, unknown> = {}) => ({
  form: {
    category: "inmuebles", title: "Casa en Miraflores", description: "Bonita casa",
    price: "250000", currency: "PEN", department: "15", location: "Miraflores",
    condition: "usado", country: "PE",
  },
  lat: -12.1, lng: -77.03,
  duration: 30, quantity: 1, extras: {},
  mainPhoto: null, extraPhotos: [], videos: [], pdf: null,
  ...extra,
});

const conUrl = (busqueda: string) => {
  window.history.replaceState({}, "", `/dashboard/anunciante/publicar${busqueda}`);
};

beforeEach(() => {
  localStorage.clear();
  toast.mockClear();
  navigate.mockClear();
  cargarAvisoParaContinuar.mockReset().mockResolvedValue(AVISO());
  guardarCambiosDeAviso.mockReset().mockResolvedValue(undefined);
  createAndPublishListing.mockReset();
  finalizeListingPublication.mockReset();
});
afterEach(() => window.history.replaceState({}, "", "/"));

describe("abre el aviso para editarlo", () => {
  it("lo pide en modo editar, no en modo continuar", async () => {
    // El modo va explícito: si se dedujera del estado, abrir un borrador por
    // aquí lo dejaría sin publicar nunca.
    conUrl("?editar=abc-123");
    render(<AdvertiserPublish />);
    await waitFor(() => expect(cargarAvisoParaContinuar).toHaveBeenCalledWith("abc-123", "editar"));
  });

  it("rellena el formulario con lo que había", async () => {
    conUrl("?editar=abc-123");
    render(<AdvertiserPublish />);
    expect(await screen.findByDisplayValue("Casa en Miraflores")).toBeInTheDocument();
    // La descripción es ahora el editor con formato (0146), no un <textarea>.
    expect(screen.getByRole("textbox", { name: /descripción/i })).toHaveTextContent("Bonita casa");
  });

  it("si el aviso no se puede editar, lo dice y no rompe la pantalla", async () => {
    cargarAvisoParaContinuar.mockRejectedValue(new Error("Este aviso es un borrador"));
    conUrl("?editar=abc-123");
    render(<AdvertiserPublish />);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
  });
});

describe("lo que NO se ve al editar", () => {
  it("el bloque de duración y adicionales ni se pinta", async () => {
    // Es lo que el usuario PAGÓ. Si se pudiera tocar aquí, editar sería una
    // forma de alargar la vigencia o contratar adicionales gratis.
    conUrl("?editar=abc-123");
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa en Miraflores");
    expect(screen.queryByText(/duración y adicionales/i)).toBeNull();
  });

  it("ni el panel de Costo: no hay nada que pagar", async () => {
    conUrl("?editar=abc-123");
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa en Miraflores");
    expect(screen.queryByText(/^costo$/i)).toBeNull();
  });

  it("ni «Publicar aviso» ni «Guardar en mis borradores»", async () => {
    conUrl("?editar=abc-123");
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa en Miraflores");
    expect(screen.queryByRole("button", { name: /publicar aviso/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /guardar en mis borradores/i })).toBeNull();
  });

  it("y la categoría queda bloqueada", async () => {
    // Cambiarla mueve el aviso de sitio en el buscador y le cambia las
    // promociones que le aplican.
    conUrl("?editar=abc-123");
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa en Miraflores");
    const combos = screen.getAllByRole("combobox");
    expect(combos.some((c) => c.hasAttribute("disabled") || c.getAttribute("data-disabled") !== null)).toBe(true);
  });
});

describe("guardar los cambios", () => {
  const guardar = async () => {
    await screen.findByDisplayValue("Casa en Miraflores");
    fireEvent.click(await screen.findByRole("button", { name: /guardar cambios/i }));
  };

  it("llama a guardar, NUNCA a publicar ni a cobrar", async () => {
    conUrl("?editar=abc-123");
    render(<AdvertiserPublish />);
    await guardar();
    await waitFor(() => expect(guardarCambiosDeAviso).toHaveBeenCalled());
    expect(createAndPublishListing).not.toHaveBeenCalled();
    expect(finalizeListingPublication).not.toHaveBeenCalled();
  });

  it("y sobre ESE aviso, no sobre otro", async () => {
    conUrl("?editar=abc-123");
    render(<AdvertiserPublish />);
    await guardar();
    await waitFor(() => expect(guardarCambiosDeAviso).toHaveBeenCalledWith("abc-123", expect.anything()));
  });

  it("al terminar vuelve a Mis avisos", async () => {
    conUrl("?editar=abc-123");
    render(<AdvertiserPublish />);
    await guardar();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard/anunciante/avisos"));
  });

  it("exige LO MISMO que publicar: sin descripción no guarda", async () => {
    // El aviso ya está en el escaparate. Salir de aquí con menos de lo que
    // exigía entrar sería empeorarlo, y en silencio.
    cargarAvisoParaContinuar.mockResolvedValue(AVISO({
      form: { ...AVISO().form, description: "" },
    }));
    conUrl("?editar=abc-123");
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa en Miraflores");
    fireEvent.click(await screen.findByRole("button", { name: /guardar cambios/i }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/falta un dato/i) })));
    expect(guardarCambiosDeAviso).not.toHaveBeenCalled();
  });

  it("y no deja quitar un adicional que ya se pagó", async () => {
    // Contrató un vídeo y el aviso no lo trae: guardar así dejaría un aviso
    // cobrado y sin lo cobrado.
    cargarAvisoParaContinuar.mockResolvedValue(AVISO({ extras: { video20: 1 }, videos: [] }));
    conUrl("?editar=abc-123");
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa en Miraflores");
    fireEvent.click(await screen.findByRole("button", { name: /guardar cambios/i }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/falta subir/i) })));
    expect(guardarCambiosDeAviso).not.toHaveBeenCalled();
  });
});

describe("sin ?editar la pantalla sigue siendo la de crear", () => {
  it("no pide ningún aviso y ofrece publicar", async () => {
    conUrl("");
    render(<AdvertiserPublish />);
    expect(await screen.findByRole("button", { name: /publicar aviso/i })).toBeInTheDocument();
    expect(cargarAvisoParaContinuar).not.toHaveBeenCalled();
  });
});
