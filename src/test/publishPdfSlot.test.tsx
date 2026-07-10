import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// El apartado para subir el PDF aparece SOLO cuando el adicional "PDF adjunto"
// está activo; al desactivarlo se oculta (y descarta el archivo elegido).

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
vi.mock("@/lib/verifyDoc", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  verifyDocument: vi.fn().mockResolvedValue({ ok: true, nombre: "JUAN PEREZ", data: {} }),
}));
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

beforeEach(() => {
  localStorage.setItem("effe:publish-draft", JSON.stringify({
    form: { category: "inmuebles", title: "Casa", description: "desc larga", price: "100", currency: "PEN", location: "Lima", condition: "nuevo" },
    duration: 7, quantity: 1, extras: {},
  }));
});

describe("AdvertiserPublish — apartado del PDF adjunto", () => {
  it("no se muestra si el adicional PDF no está activo", async () => {
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa");
    expect(screen.queryByText("Adjuntar PDF")).not.toBeInTheDocument();
  });

  it("aparece al activar el adicional y se oculta al desactivarlo", async () => {
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa");

    fireEvent.click(screen.getByRole("button", { name: /agregar pdf adjunto por aviso/i }));
    await waitFor(() => expect(screen.getByText("Adjuntar PDF")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /quitar pdf adjunto por aviso/i }));
    await waitFor(() => expect(screen.queryByText("Adjuntar PDF")).not.toBeInTheDocument());
  });
});
