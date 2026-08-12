import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// El saldo del formulario de publicar se redondeaba con Math.round, así que no
// coincidía con el de la barra superior y, al redondear hacia arriba, daba por
// bueno un saldo que en realidad no alcanzaba (IT3-016).

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  (URL as any).createObjectURL = () => "blob:mock";
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

const getCreditBalance = vi.fn();
vi.mock("@/lib/credits", () => ({
  getCreditBalance: (...a: unknown[]) => getCreditBalance(...a),
}));
vi.mock("@/lib/payments", () => ({
  createPayment: vi.fn(), pollOrderStatus: vi.fn(), getPurchaseResult: vi.fn(),
  hostedPaymentUrl: () => "https://x/pay",
}));
vi.mock("@/components/PaymentForm", () => ({ PaymentForm: () => null }));
vi.mock("@/lib/publish", () => ({
  createAndPublishListing: vi.fn(),
  SaldoInsuficiente: class SaldoInsuficiente extends Error {},
}));
vi.mock("@/lib/promotions", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  fetchActivePromotions: vi.fn().mockResolvedValue([]),
}));
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
vi.mock("react-router-dom", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, useNavigate: () => vi.fn(), Link: ({ children, to, ...rest }: any) => <a href={typeof to === "string" ? to : undefined} {...rest}>{children}</a> };
});
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ role: "anunciante", name: "Test", initials: "T", supabase: true }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import AdvertiserPublish from "@/pages/advertiser/AdvertiserPublish";
import { formatCredits } from "@/lib/pricing";

// Borrador con duración elegida: así se pinta el total y la línea de "Falta".
const seedDraft = () => {
  localStorage.setItem("effe:publish-draft", JSON.stringify({
    form: { category: "inmuebles", title: "Casa bonita", description: "Descripción larga del aviso", price: "100", currency: "PEN", department: "15", location: "Lima", condition: "nuevo" },
    duration: 7, quantity: 1, extras: {},
  }));
};

beforeEach(() => {
  localStorage.clear();
  getCreditBalance.mockReset();
});

describe("Publicar — el saldo no se redondea", () => {
  it("muestra el saldo con decimales, igual que la barra superior", async () => {
    getCreditBalance.mockResolvedValue(16.6);
    seedDraft();
    render(<AdvertiserPublish />);

    // formatCredits es la MISMA función que usa CreditsBalance en el navbar.
    await waitFor(() => expect(screen.getAllByText(formatCredits(16.6)).length).toBeGreaterThan(0));
    // Con Math.round esto habría salido como "S/ 17".
    expect(screen.queryByText("S/ 17")).toBeNull();
  });

  it("un saldo por debajo del total avisa de cuánto falta", async () => {
    // Coste de 1 aviso × 7 días con la matriz por defecto: 16.14 créditos.
    // El redondeo hacia arriba podía dar por bueno un saldo insuficiente (hasta
    // 0,49 menos) y el error salía recién al cobrar; el aviso debe salir antes.
    getCreditBalance.mockResolvedValue(15.9);
    seedDraft();
    render(<AdvertiserPublish />);

    expect(await screen.findByText(/^Falta /)).toBeTruthy();
  });
});
