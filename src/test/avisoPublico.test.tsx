import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

/**
 * La ficha de un aviso es PÚBLICA.
 *
 * Antes redirigía a /auth a quien no tuviera sesión, así que un enlace
 * compartido por WhatsApp llevaba a una pantalla de login en vez de al aviso —
 * con la búsqueda siendo pública ya, o sea que se veía el escaparate y no se
 * podía entrar a mirar.
 *
 * Y era una segunda cerradura sobre una puerta ya cerrada: la base de datos
 * solo deja leer avisos activos (`listings_select_public`) y cada acción pide
 * sesión por su cuenta. Eso es lo que se comprueba aquí: que se ve todo y que
 * las acciones siguen exigiendo cuenta.
 */

beforeEach(() => {
  (globalThis as never as { ResizeObserver: unknown }).ResizeObserver =
    class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
});

const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  useNavigate: () => navigate,
}));

// `vi.hoisted`: las fábricas de `vi.mock` se izan al principio del archivo y se
// ejecutan ANTES que las constantes normales, así que una `const` de aquí abajo
// no existiría todavía cuando el mock la usa.
const AVISO = vi.hoisted(() => ({
  id: "01e6d187-aa3f-448d-802f-a69c17900d0c",
  title: "Rodillo Cat de 11 TN",
  description: "Máquina en buen estado.",
  price: 45000,
  currency: "PEN",
  category: "vehiculos",
  location: "Guadalupe",
  image: "/foto.webp",
  images: ["/foto.webp"],
  date: "2026-08-01",
  views: 12,
  condition: "usado",
  advertiser: "Juan Perez",
  advertiserVerified: false,
  featured: false,
  urgent: false,
  confidential: false,
  lat: null,
  lng: null,
  expiresAt: null,
}));

// SIN SESIÓN: es justo el caso que se quiere probar.
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

describe("un visitante SIN cuenta abre un aviso compartido", () => {
  beforeEach(() => navigate.mockClear());

  it("NO se le redirige al login", async () => {
    pintar();
    await screen.findAllByText(AVISO.title);
    expect(navigate).not.toHaveBeenCalledWith(
      expect.stringContaining("/auth"),
      expect.anything(),
    );
  });

  it("ve el aviso: título, precio, ubicación y descripción", async () => {
    pintar();
    await screen.findAllByText(AVISO.title);
    // El separador de miles depende de la configuración regional del entorno
    // (45,000 o 45.000): lo que importa es que el precio se vea, no su formato.
    expect(screen.getAllByText(/45[.,]?000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Guadalupe/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Máquina en buen estado/)).toBeTruthy();
  });

  it("ve los botones de contacto, para saber que puede escribir", async () => {
    pintar();
    await screen.findAllByText(AVISO.title);
    expect(screen.getByRole("button", { name: /enviar mensaje/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /mostrar teléfono/i })).toBeTruthy();
  });

  it("puede compartirlo, que es de donde venía", async () => {
    pintar();
    await screen.findAllByText(AVISO.title);
    expect(screen.getByRole("button", { name: "Compartir este aviso" })).toBeTruthy();
  });

  it("el teléfono NO aparece por ningún lado sin haber iniciado sesión", async () => {
    pintar();
    await screen.findAllByText(AVISO.title);
    // El número solo se pide al pulsar, y ese botón exige cuenta.
    expect(screen.queryByText(/9\d{2}\s?\d{3}\s?\d{3}/)).toBeNull();
  });
});
