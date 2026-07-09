import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// "Guardar en mis borradores": persiste el aviso en la BD sin cobrar ni pedir
// identidad, y publicar después reutiliza ESE aviso en vez de crear otro.

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
  (URL as any).createObjectURL = () => "blob:mock";
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

const getCreditBalance = vi.fn().mockResolvedValue(1000);
const spendCredits = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/credits", () => ({
  getCreditBalance: (...a: unknown[]) => getCreditBalance(...a),
  spendCredits: (...a: unknown[]) => spendCredits(...a),
  purchaseCredits: vi.fn(),
}));

const createAndPublishListing = vi.fn();
const saveListingDraft = vi.fn();
vi.mock("@/lib/publish", () => ({
  createAndPublishListing: (...a: unknown[]) => createAndPublishListing(...a),
  saveListingDraft: (...a: unknown[]) => saveListingDraft(...a),
}));

vi.mock("@/lib/verifyDoc", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  verifyDocument: vi.fn().mockResolvedValue({ ok: true, nombre: "JUAN PEREZ", data: {} }),
}));

vi.mock("@/lib/promotions", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, fetchActivePromotions: vi.fn().mockResolvedValue([]) };
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

let sessionValue: unknown = { role: "anunciante", name: "Test", initials: "T", supabase: true };
vi.mock("@/hooks/useSession", () => ({ useSession: () => sessionValue }));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import AdvertiserPublish from "@/pages/advertiser/AdvertiserPublish";

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

const draftButton = () => screen.getByRole("button", { name: /guardar en mis borradores/i });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  sessionValue = { role: "anunciante", name: "Test", initials: "T", supabase: true };
  getCreditBalance.mockResolvedValue(1000);
  spendCredits.mockResolvedValue(true);
  saveListingDraft.mockResolvedValue("L-DRAFT");
  createAndPublishListing.mockResolvedValue({
    listingId: "L-DRAFT", invoiceNumber: "B001-000099", published: true, invoiceSaved: true,
  });
});

describe("AdvertiserPublish — Guardar en mis borradores", () => {
  it("guarda el aviso en la BD sin cobrar ni pedir identidad", async () => {
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    uploadMainPhoto();

    fireEvent.click(draftButton());

    await waitFor(() => expect(saveListingDraft).toHaveBeenCalledTimes(1));
    expect(saveListingDraft).toHaveBeenCalledWith(expect.objectContaining({
      form: expect.objectContaining({ title: "Casa bonita", category: "inmuebles" }),
      duration: 7,
      draftId: null, // primera vez: crea
    }));

    // Guardar es gratis y no exige documento.
    expect(spendCredits).not.toHaveBeenCalled();
    expect(screen.queryByText(/verifica tu identidad/i)).toBeNull();
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Guardado en tus borradores" })));
  });

  it("guardar DOS veces actualiza el mismo borrador, no crea otro", async () => {
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    uploadMainPhoto();

    fireEvent.click(draftButton());
    await waitFor(() => expect(saveListingDraft).toHaveBeenCalledTimes(1));
    expect(saveListingDraft.mock.calls[0][0].draftId).toBeNull();

    fireEvent.click(draftButton());
    await waitFor(() => expect(saveListingDraft).toHaveBeenCalledTimes(2));
    // La segunda vez apunta al aviso ya creado.
    expect(saveListingDraft.mock.calls[1][0].draftId).toBe("L-DRAFT");
  });

  it("publicar DESPUÉS de guardar reutiliza el borrador (no deja dos avisos)", async () => {
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    await screen.findByText("1000 créditos");
    uploadMainPhoto();

    fireEvent.click(draftButton());
    await waitFor(() => expect(saveListingDraft).toHaveBeenCalledTimes(1));

    // Ahora publica: verifica identidad y confirma.
    fireEvent.click(screen.getByRole("button", { name: /publicar aviso/i }));
    fireEvent.click(await screen.findByRole("button", { name: /persona natural/i }));
    fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "12345678" } });
    await screen.findByText("JUAN PEREZ");
    fireEvent.click(screen.getByRole("button", { name: /confirmar y continuar/i }));

    await waitFor(() => expect(createAndPublishListing).toHaveBeenCalledTimes(1));
    // Clave: se publica el borrador ya creado.
    expect(createAndPublishListing.mock.calls[0][0].draftId).toBe("L-DRAFT");
  });

  it("sin título o sin categoría no guarda (son NOT NULL en la BD)", async () => {
    localStorage.setItem("effe:publish-draft", JSON.stringify({
      form: { category: "", title: "", description: "", price: "", currency: "PEN", location: "", condition: "nuevo" },
      duration: 7, quantity: 1, extras: {},
    }));
    render(<AdvertiserPublish />);
    await screen.findByRole("button", { name: /guardar en mis borradores/i });

    fireEvent.click(draftButton());

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Falta lo mínimo para guardar" })));
    expect(saveListingDraft).not.toHaveBeenCalled();
  });

  it("un doble toque guarda una sola vez", async () => {
    let resolveSave: (v: unknown) => void = () => {};
    saveListingDraft.mockReturnValue(new Promise((res) => { resolveSave = res; }));

    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    uploadMainPhoto();

    const btn = draftButton();
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    resolveSave("L-DRAFT");
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Guardado en tus borradores" })));
    expect(saveListingDraft).toHaveBeenCalledTimes(1);
  });

  it("si falla el guardado, lo dice y NO deja creer que se guardó", async () => {
    saveListingDraft.mockRejectedValue(new Error("Ponle un título al aviso para guardarlo."));
    seedDraft();
    render(<AdvertiserPublish />);
    await screen.findByDisplayValue("Casa bonita");
    uploadMainPhoto();

    fireEvent.click(draftButton());

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: "No se pudo guardar el borrador",
        description: "Ponle un título al aviso para guardarlo.",
      })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Guardado en tus borradores" }));
  });
});
