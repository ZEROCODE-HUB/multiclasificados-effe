import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// "Urgente" es un adicional para respuesta inmediata: solo se ofrece en avisos
// cortos (hasta 7 días). Al elegir 15/30/60/90 días la opción desaparece.

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
  (URL as any).createObjectURL = () => "blob:mock";
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

vi.mock("@/lib/credits", () => ({
  getCreditBalance: vi.fn().mockResolvedValue(1000),
  spendCredits: vi.fn().mockResolvedValue(true),
  purchaseCredits: vi.fn(),
}));
vi.mock("@/lib/publish", () => ({ createAndPublishListing: vi.fn(), saveListingDraft: vi.fn() }));
vi.mock("@/lib/promotions", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  fetchActivePromotions: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: { user: { email: "t@correo.com" } } } }),
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
  } },
}));
vi.mock("@/components/DashboardLayout", () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("react-router-dom", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock("@/hooks/useSession", () => ({ useSession: () => ({ role: "anunciante", name: "T", supabase: true }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import AdvertiserPublish from "@/pages/advertiser/AdvertiserPublish";

const dayButton = (d: string) => screen.getByText(d, { selector: "p" }).closest("button")!;

beforeEach(() => {
  localStorage.setItem("effe:publish-draft", JSON.stringify({
    form: { category: "inmuebles", title: "Casa", description: "desc larga", price: "100", currency: "PEN", location: "Lima", condition: "nuevo" },
    duration: 7, quantity: 1, extras: {},
  }));
});

describe("AdvertiserPublish — Urgente según la duración", () => {
  it("a 7 días ofrece 'Marcar como Urgente'", async () => {
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa");
    expect(screen.getByText("Marcar como Urgente")).toBeInTheDocument();
  });

  it("al pasar a 30 días oculta Urgente y explica por qué", async () => {
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa");

    fireEvent.click(dayButton("30"));
    await waitFor(() => expect(screen.queryByText("Marcar como Urgente")).not.toBeInTheDocument());
    expect(screen.getByText(/solo está disponible en avisos de hasta 7 días/i)).toBeInTheDocument();
  });

  it("vuelve a ofrecer Urgente si se regresa a una duración corta", async () => {
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa");

    fireEvent.click(dayButton("60"));
    await waitFor(() => expect(screen.queryByText("Marcar como Urgente")).not.toBeInTheDocument());

    fireEvent.click(dayButton("3"));
    await waitFor(() => expect(screen.getByText("Marcar como Urgente")).toBeInTheDocument());
  });
});
