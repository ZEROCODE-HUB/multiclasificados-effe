import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { prepararDom } from "./domPolyfills";

/**
 * Abrir el enlace de un aviso que ya no se puede enseñar.
 *
 * EL FALLO QUE ESTO FIJA
 *
 * `listing_cards` es la vista pública y solo trae los ACTIVOS. Cuando un aviso
 * vence desaparece de ahí, `fetchListingById` devuelve null… y la ficha se
 * quedaba con su aviso vacío PARA SIEMPRE: imagen rota, sin título, sin
 * descripción y con "Precio a convenir", porque el precio del hueco es 0.
 * Parecía un aviso roto, no uno vencido.
 *
 * Y no es un caso raro: el correo de "tu aviso está por vencer" enlaza al
 * aviso, así que basta abrirlo un rato después para caer justo aquí. Fue así
 * como se reportó.
 */
beforeEach(() => {
  prepararDom();
  (globalThis as never as { ResizeObserver: unknown }).ResizeObserver =
    class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
});

const estado = { valor: { existe: false } as Record<string, unknown> };

vi.mock("react-router-dom", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  useNavigate: () => vi.fn(),
}));
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
  // Devuelve null: es lo que pasa con un aviso vencido.
  fetchListingById: vi.fn().mockResolvedValue(null),
  porQueNoSeVeElAviso: vi.fn(() => Promise.resolve(estado.valor)),
  fetchListingImages: vi.fn().mockResolvedValue([]),
  fetchListings: vi.fn().mockResolvedValue([]),
  fetchListingDocumentUrl: vi.fn().mockResolvedValue(null),
  fetchListingVideos: vi.fn().mockResolvedValue([]),
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
vi.mock("@/components/ListingLocationMap", () => ({ ListingLocationMap: () => null }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));

import ListingDetail from "@/pages/ListingDetail";

const ID = "b3d6de52-ffd2-45c6-b667-5261f584f42e";
const pintar = () =>
  render(
    <MemoryRouter initialEntries={[`/aviso/${ID}`]}>
      <Routes><Route path="/aviso/:id" element={<ListingDetail />} /></Routes>
    </MemoryRouter>,
  );

describe("mientras se averigua, no se enseña nada falso", () => {
  // Segundo reporte del mismo caso: "sale el anuncio vacío tal como antes, y
  // después de unos segundos recién sale el aviso de vencido".
  //
  // Son DOS viajes de red hasta saberlo —la vista pública primero y la tabla
  // después, para averiguar por qué—, y durante los dos se estaba pintando la
  // ficha con el aviso vacío. Estas comprobaciones son SÍNCRONAS a propósito:
  // miran el primer frame, que es donde estaba el problema.
  beforeEach(() => {
    estado.valor = { existe: true, estado: "expired", esMio: true, titulo: "Video prueba" };
  });

  it("ni imagen rota ni «Precio a convenir» en el primer frame", () => {
    pintar();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByText(/precio a convenir/i)).toBeNull();
  });

  it("se ve un esqueleto, y se anuncia para quien no ve la pantalla", () => {
    pintar();
    expect(screen.getByText(/cargando el aviso/i)).toBeInTheDocument();
  });

  it("y tampoco los botones de contacto de un aviso que quizá no existe", () => {
    // Ofrecer "Enviar mensaje" sobre un hueco vacío es peor que no ofrecer nada.
    pintar();
    expect(screen.queryByText(/enviar mensaje/i)).toBeNull();
    expect(screen.queryByText(/mostrar teléfono/i)).toBeNull();
  });
});

describe("mi aviso vencido, abierto desde el correo", () => {
  beforeEach(() => {
    estado.valor = { existe: true, estado: "expired", esMio: true, titulo: "Video prueba" };
  });

  it("dice que venció, en vez de pintar una ficha rota", async () => {
    pintar();
    expect(await screen.findByText(/este aviso ya venció/i)).toBeInTheDocument();
  });

  it("y da la salida: renovarlo desde Mis avisos", async () => {
    pintar();
    expect(await screen.findByRole("link", { name: /mis avisos/i })).toBeInTheDocument();
    expect(screen.getByText(/renuévalo/i)).toBeInTheDocument();
  });

  it("recuerda de qué aviso se trata", async () => {
    pintar();
    expect(await screen.findByText(/Video prueba/)).toBeInTheDocument();
  });

  it("NO deja ni imagen rota ni «Precio a convenir» de un aviso vacío", async () => {
    // Los dos síntomas con los que se reportó.
    pintar();
    await screen.findByText(/este aviso ya venció/i);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByText(/precio a convenir/i)).toBeNull();
  });
});

describe("el aviso vencido de OTRO", () => {
  beforeEach(() => {
    estado.valor = { existe: true, estado: "expired", esMio: false, titulo: "Casa" };
  });

  it("se dice que venció, pero no se le ofrece renovarlo", async () => {
    pintar();
    expect(await screen.findByText(/este aviso ya venció/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /mis avisos/i })).toBeNull();
  });

  it("y siempre queda una salida: explorar", async () => {
    pintar();
    expect(await screen.findByRole("link", { name: /explorar avisos/i })).toBeInTheDocument();
  });
});

describe("un enlace que no lleva a ninguna parte", () => {
  beforeEach(() => { estado.valor = { existe: false }; });

  it("no dice «venció» de algo que no existe", async () => {
    pintar();
    expect(await screen.findByText(/ya no está disponible/i)).toBeInTheDocument();
    expect(screen.queryByText(/ya venció/i)).toBeNull();
  });
});
