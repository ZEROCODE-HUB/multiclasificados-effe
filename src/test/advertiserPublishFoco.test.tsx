import { describe, it, expect, vi, beforeEach } from "vitest";
import { EnlaceFalso } from "./routerStubs";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// Antes, publicar sin un dato mostraba un toast genérico ("Faltan campos
// obligatorios") y el usuario tenía que buscar cuál en un formulario de cinco
// pasos. Ahora se marca el campo y la pantalla baja hasta él.
beforeEach(prepararDom);

const getCreditBalance = vi.fn().mockResolvedValue(1000);
vi.mock("@/lib/credits", () => ({ getCreditBalance: () => getCreditBalance() }));

vi.mock("@/lib/payments", () => ({
  createPayment: vi.fn(), createPublishPayment: vi.fn(), pollOrderStatus: vi.fn(),
  getPurchaseResult: vi.fn(), hostedPaymentUrl: () => "https://x/pay",
  SaldoYaSuficiente: class extends Error {},
}));
vi.mock("@/components/PaymentForm", () => ({ PaymentForm: () => <div />, precargarKrypton: () => {} }));

const createAndPublishListing = vi.fn();
vi.mock("@/lib/publish", () => ({
  createAndPublishListing: (...a: unknown[]) => createAndPublishListing(...a),
  saveListingDraft: vi.fn().mockResolvedValue("L1"),
  finalizeListingPublication: vi.fn().mockResolvedValue({ published: true }),
  SaldoInsuficiente: class extends Error {},
}));

vi.mock("@/lib/verifyDoc", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  verifyDocument: vi.fn().mockResolvedValue({ ok: true, nombre: "JUAN PEREZ", data: {} }),
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

// Borrador completo; cada test le quita LO QUE quiere ver fallar.
const seedDraft = (parche: Record<string, unknown> = {}) => {
  localStorage.setItem("effe:publish-draft", JSON.stringify({
    form: {
      category: "inmuebles", title: "Casa bonita", description: "Descripción larga",
      price: "100", currency: "PEN", department: "15", location: "Lima", condition: "nuevo",
      ...parche,
    },
    duration: 7, quantity: 1, extras: {},
  }));
};

const publicar = () => fireEvent.click(screen.getByRole("button", { name: /publicar aviso/i }));

beforeEach(() => {
  localStorage.clear();
  toast.mockClear();
  createAndPublishListing.mockReset().mockResolvedValue({ listingId: "L1", published: true });
  // jsdom no implementa scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
  // requestAnimationFrame inmediato: el foco se pide dentro de uno.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0; });
});

describe("AdvertiserPublish — el campo que falta se marca y se enfoca", () => {
  it("sin título: marca el campo, baja hasta él y NO publica", async () => {
    seedDraft({ title: "" });
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Descripción larga");

    publicar();

    await screen.findByText("Ponle un título a tu aviso.");
    const caja = document.querySelector('[data-campo="titulo"]')!;
    expect(caja.getAttribute("aria-invalid")).toBe("true");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    expect(createAndPublishListing).not.toHaveBeenCalled();
  });

  it("precio negativo: lo rechaza con un mensaje propio", async () => {
    seedDraft({ price: "-5" });
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");

    publicar();

    await screen.findByText("El precio no puede ser negativo.");
    expect(createAndPublishListing).not.toHaveBeenCalled();
  });

  it("con todo completo abre la confirmación en vez de marcar nada", async () => {
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");

    publicar();

    await screen.findByRole("button", { name: /confirmar y publicar/i });
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
  });
});
