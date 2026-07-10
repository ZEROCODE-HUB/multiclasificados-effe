import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// --- Polyfills que Radix (Dialog/Select) necesita en jsdom ---
beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
});

// --- Mocks de la capa de datos y del entorno ---
const updateListing = vi.fn().mockResolvedValue(undefined);
const deleteListing = vi.fn().mockResolvedValue(undefined);
const setListingStatus = vi.fn().mockResolvedValue(undefined);
const replaceMainListingPhoto = vi.fn().mockResolvedValue("https://cdn/new-photo.png");
const listing = {
  id: "abc-123", title: "Original title", description: "desc", price: 100, currency: "PEN",
  category: "inmuebles", location: "Lima", imageUrl: "x", date: "2026-07-01", featured: false,
  advertiser: "", views: 5, status: "active" as const, expiresAt: null, condition: "nuevo" as const,
};

// Conserva los exports reales (expiryInfo, tipos) y solo sustituye la capa de red:
// ListingRow usa expiryInfo, así que no puede quedar sin definir.
vi.mock("@/lib/listings", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  fetchMyListings: () => Promise.resolve([listing]),
  updateListing: (...a: unknown[]) => updateListing(...a),
  deleteListing: (...a: unknown[]) => deleteListing(...a),
  setListingStatus: (...a: unknown[]) => setListingStatus(...a),
  replaceMainListingPhoto: (...a: unknown[]) => replaceMainListingPhoto(...a),
}));

vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, useNavigate: () => navigate, Link: ({ children, ...p }: any) => <a {...p}>{children}</a> };
});

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import AdvertiserListings from "@/pages/advertiser/AdvertiserListings";

beforeEach(() => { updateListing.mockClear(); deleteListing.mockClear(); navigate.mockClear(); replaceMainListingPhoto.mockClear(); toast.mockClear(); });

describe("AdvertiserListings — editar / eliminar / ver", () => {
  it("EDITAR: abre el formulario con los datos y guarda el patch correcto", async () => {
    render(<AdvertiserListings />);
    // El aviso aparece en la pestaña activa
    await screen.findByText("Original title");

    // Click en "Editar" (botón inline)
    fireEvent.click(screen.getAllByRole("button", { name: /editar/i })[0]);

    // El diálogo se abre con el título actual precargado
    const titleInput = await screen.findByDisplayValue("Original title");
    fireEvent.change(titleInput, { target: { value: "Título editado" } });

    // Cambiar precio
    const priceInput = screen.getByDisplayValue("100");
    fireEvent.change(priceInput, { target: { value: "250" } });

    // Guardar
    fireEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => expect(updateListing).toHaveBeenCalledTimes(1));
    expect(updateListing).toHaveBeenCalledWith("abc-123", expect.objectContaining({
      title: "Título editado",
      price: 250,
      currency: "PEN",
      location: "Lima",
      category_id: "inmuebles",
      condition: "nuevo",
    }));
  });

  it("EDITAR: no guarda si falta el título (validación)", async () => {
    render(<AdvertiserListings />);
    await screen.findByText("Original title");
    fireEvent.click(screen.getAllByRole("button", { name: /editar/i })[0]);
    const titleInput = await screen.findByDisplayValue("Original title");
    fireEvent.change(titleInput, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(updateListing).not.toHaveBeenCalled();
  });

  it("EDITAR: cambiar la foto llama a replaceMainListingPhoto con el archivo", async () => {
    render(<AdvertiserListings />);
    await screen.findByText("Original title");
    fireEvent.click(screen.getAllByRole("button", { name: /editar/i })[0]);
    await screen.findByDisplayValue("Original title");

    const fileInput = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File(["imagen"], "portada.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => expect(replaceMainListingPhoto).toHaveBeenCalledTimes(1));
    expect(replaceMainListingPhoto).toHaveBeenCalledWith("abc-123", file);
  });

  it("EDITAR: rechaza un archivo que no es imagen", async () => {
    render(<AdvertiserListings />);
    await screen.findByText("Original title");
    fireEvent.click(screen.getAllByRole("button", { name: /editar/i })[0]);
    await screen.findByDisplayValue("Original title");

    const fileInput = document.querySelector("input[type=file]") as HTMLInputElement;
    const bad = new File(["texto"], "archivo.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [bad], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(replaceMainListingPhoto).not.toHaveBeenCalled();
  });

  it("VER: navega al detalle del aviso", async () => {
    render(<AdvertiserListings />);
    await screen.findByText("Original title");
    fireEvent.click(screen.getByRole("button", { name: /^ver$/i }));
    expect(navigate).toHaveBeenCalledWith("/aviso/abc-123");
  });

  it("ELIMINAR: pide confirmación y borra el aviso", async () => {
    render(<AdvertiserListings />);
    await screen.findByText("Original title");
    fireEvent.click(screen.getAllByRole("button", { name: /eliminar/i })[0]);
    // Confirmación
    const confirmBtn = await screen.findByRole("button", { name: /^eliminar$/i });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(deleteListing).toHaveBeenCalledWith("abc-123"));
  });
});
