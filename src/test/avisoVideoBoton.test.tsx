import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { prepararDom } from "./domPolyfills";

/**
 * Los vídeos del aviso se enseñan como BOTÓN, no como reproductor incrustado.
 *
 * Nacieron incrustados en el lote de los 16 pedidos (18-ago), y el resultado en
 * la ficha era desproporcionado: cada reproductor ocupaba hasta 420 px de alto,
 * así que un aviso con tres metía **1 260 px de rectángulos negros** en mitad de
 * la página y empujaba los datos del aviso y el contacto fuera de la pantalla.
 * En un clasificado eso es exactamente lo contrario de lo que interesa: la
 * llamada al anunciante es lo que tiene que quedar a mano.
 *
 * El PDF del aviso ya se enseñaba como un botón discreto desde antes. Son dos
 * adjuntos de la misma naturaleza y no hay razón para que uno grite y el otro
 * no, así que ahora comparten aspecto — y esta prueba lo fija, porque es el
 * tipo de cosa que se deshace sin querer al tocar la ficha.
 */
beforeEach(() => {
  prepararDom();
  (globalThis as never as { ResizeObserver: unknown }).ResizeObserver =
    class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
});

vi.mock("react-router-dom", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  useNavigate: () => vi.fn(),
}));

const AVISO = vi.hoisted(() => ({
  id: "01e6d187-aa3f-448d-802f-a69c17900d0c",
  title: "Rodillo Cat de 11 TN",
  description: "Máquina en buen estado.",
  price: 45000, currency: "PEN", category: "vehiculos", location: "Guadalupe",
  image: "/foto.webp", images: ["/foto.webp"], date: "2026-08-01", views: 12,
  condition: "usado", advertiser: "Juan Perez", advertiserVerified: false,
  featured: false, urgent: false, confidential: false,
  lat: null, lng: null, expiresAt: null,
}));

/** Los vídeos que devuelve la consulta, controlados por cada prueba. */
const videos = vi.hoisted(() => ({ lista: [] as Array<{ id: string; url: string }> }));

vi.mock("@/hooks/useSession", () => ({ useSession: () => null }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      getUser: () => Promise.resolve({ data: { user: null } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }),
  },
}));
vi.mock("@/lib/listings", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  fetchListingById: vi.fn().mockResolvedValue(AVISO),
  fetchListingImages: vi.fn().mockResolvedValue(["/foto.webp"]),
  fetchListings: vi.fn().mockResolvedValue([]),
  fetchListingDocumentUrl: vi.fn().mockResolvedValue(null),
  fetchListingVideos: vi.fn(() => Promise.resolve(videos.lista)),
  fetchAdvertiserPhone: vi.fn().mockResolvedValue(null),
  trackEvent: vi.fn(),
}));
vi.mock("@/lib/reviews", () => ({
  fetchSellerInfo: vi.fn().mockResolvedValue(null),
  fetchReviews: vi.fn().mockResolvedValue([]),
  fetchAdvertiserStats: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/applications", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  fetchMyApplication: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/pricing", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  loadSold: vi.fn().mockReturnValue({}),
}));
vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => [
    { id: "vehiculos", name: "Vehículos", icon: () => null, conditionEnabled: true, imageUrl: null },
  ],
}));
vi.mock("@/components/ListingLocationMap", () => ({ ListingLocationMap: () => null }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));

import ListingDetail from "@/pages/ListingDetail";

const pintar = () =>
  render(
    <MemoryRouter initialEntries={[`/aviso/${AVISO.id}`]}>
      <Routes>
        <Route path="/aviso/:id" element={<ListingDetail />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => { videos.lista = []; });

describe("un aviso con un vídeo", () => {
  beforeEach(() => {
    videos.lista = [{ id: "v1", url: "https://x/uno.mp4" }];
  });

  it("enseña un botón, no un reproductor ocupando media pantalla", async () => {
    pintar();
    const boton = await screen.findByRole("link", { name: /ver video/i });
    expect(boton).toHaveAttribute("href", "https://x/uno.mp4");
    expect(document.querySelector("video")).toBeNull();
  });

  it("se abre en otra pestaña, igual que el PDF", async () => {
    pintar();
    const boton = await screen.findByRole("link", { name: /ver video/i });
    expect(boton).toHaveAttribute("target", "_blank");
    // Sin `noopener`, la pestaña abierta puede tocar la que la abrió.
    expect(boton.getAttribute("rel")).toContain("noopener");
  });

  it("no lo numera: «Ver video 1» a secas hace pensar que falta el 2", async () => {
    pintar();
    expect(await screen.findByRole("link", { name: "Ver video" })).toBeInTheDocument();
  });
});

describe("un aviso con tres vídeos", () => {
  beforeEach(() => {
    videos.lista = [
      { id: "v1", url: "https://x/uno.mp4" },
      { id: "v2", url: "https://x/dos.mp4" },
      { id: "v3", url: "https://x/tres.mp4" },
    ];
  });

  it("son tres botones y ningún reproductor", async () => {
    // Incrustados eran 1 260 px de negro entre la descripción y el contacto.
    pintar();
    expect((await screen.findAllByRole("link", { name: /ver video/i })).length).toBe(3);
    expect(document.querySelectorAll("video").length).toBe(0);
  });

  it("ahora sí van numerados, para poder distinguirlos", async () => {
    pintar();
    expect(await screen.findByRole("link", { name: "Ver video 1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver video 3" })).toBeInTheDocument();
  });

  it("cada uno apunta a su archivo", async () => {
    pintar();
    const enlaces = await screen.findAllByRole("link", { name: /ver video/i });
    expect(enlaces.map((e) => e.getAttribute("href"))).toEqual([
      "https://x/uno.mp4", "https://x/dos.mp4", "https://x/tres.mp4",
    ]);
  });
});

describe("un aviso sin vídeos", () => {
  it("no enseña ningún botón ni deja un hueco", async () => {
    pintar();
    await screen.findAllByText(AVISO.title);
    expect(screen.queryByRole("link", { name: /ver video/i })).toBeNull();
  });
});
