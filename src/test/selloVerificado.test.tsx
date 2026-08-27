import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ListingCard } from "@/components/ListingCard";
import { mapCard } from "@/lib/listings";
import type { Listing } from "@/data/mockData";

/**
 * El sello "Verificado" de la tarjeta.
 *
 * Estaba escrito a pelo en el componente: salía en TODOS los avisos, siempre,
 * sin ninguna condición. Es la peor clase de adorno —el que parece un dato— y
 * quien lo veía podía concluir que alguien había comprobado a ese anunciante.
 *
 * Ahora sale solo con `profiles.verified`, que es la decisión del equipo de
 * administración (Administración → Usuarios). Es lo que la propia app ya
 * prometía en Ajustes: «La verificación la realiza el equipo de administración».
 */

vi.mock("@/hooks/useSession", () => ({ useSession: () => ({ supabase: true }) }));
vi.mock("@/hooks/useFavorites", () => ({ useFavorites: () => ({ isFavorite: () => false, toggle: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() }) }));

const BASE: Listing = {
  id: "l1", title: "Casa en venta", description: "d", price: 100, currency: "PEN",
  category: "inmuebles", location: "Lima", imageUrl: "x", date: "2026-07-10",
  featured: false, advertiser: "A", views: 0,
};

const renderCard = (extra: Partial<Listing>) =>
  render(<MemoryRouter><ListingCard listing={{ ...BASE, ...extra }} /></MemoryRouter>);

// El sello ya no lleva la palabra "Verificado" (ver más abajo), así que se
// busca por lo que lo identifica de verdad: su aria-label.
const sello = () => screen.queryByRole("img", { name: /anunciante verificado/i });

describe("el sello Verificado en la tarjeta", () => {
  it("un anunciante verificado por el equipo lo lleva", () => {
    renderCard({ advertiserVerified: true });
    expect(sello()).toBeInTheDocument();
  });

  it("uno sin verificar NO lo lleva", () => {
    renderCard({ advertiserVerified: false });
    expect(sello()).toBeNull();
  });

  it("si no se sabe nada del anunciante, tampoco: en la duda no se afirma", () => {
    renderCard({});
    expect(sello()).toBeNull();
  });

  it("los adicionales que se pagan no dan el sello", () => {
    // Destacado y Urgente se compran; verificar es otra cosa y no se vende.
    renderCard({ featured: true, urgent: true, confidential: true });
    expect(sello()).toBeNull();
  });

  // Es SOLO el escudo, sin la palabra. Con dos tarjetas por fila el chip con
  // texto medía 95 px y, anclado a 48 del borde, ocupaba 143 de los ~158 que
  // mide la tarjeta: se comía el ancho entero y se encimaba con los
  // distintivos de la izquierda.
  it("no lleva la palabra escrita: solo el escudo", () => {
    renderCard({ advertiserVerified: true });
    expect(screen.queryByText(/verificado/i)).toBeNull();
    expect(sello()).toBeInTheDocument();
  });

  // Quitar el texto no puede costar el significado: quien no vea el escudo (o
  // no lo reconozca) tiene que poder saber qué es.
  it("sigue diciendo qué significa, aunque no se lea", () => {
    renderCard({ advertiserVerified: true });
    expect(sello()).toHaveAttribute("aria-label", expect.stringMatching(/verificado por eFFe/i));
  });
});

/**
 * La otra mitad del asunto: que el dato llegue desde la base.
 * El aviso lo trae la vista `listing_cards` (migración 0087) en la columna
 * `advertiser_verified`.
 */
describe("de la fila de la base al aviso", () => {
  const fila = (extra: Record<string, unknown> = {}) => ({
    id: "00000000-0000-0000-0000-000000000001",
    title: "Casa", description: null, price: "100", currency: "PEN",
    condition: null, category_id: "inmuebles", location: "Lima", department: "15",
    lat: null, lng: null, featured: false, urgent: null, confidential: null,
    views: null, published_at: null, created_at: "2026-07-10T00:00:00Z",
    expires_at: null, advertiser: "Ana", image_url: null,
    ...extra,
  }) as never;

  it("trae el sello cuando la vista dice que sí", () => {
    expect(mapCard(fila({ advertiser_verified: true })).advertiserVerified).toBe(true);
  });

  it("no lo trae cuando dice que no", () => {
    expect(mapCard(fila({ advertiser_verified: false })).advertiserVerified).toBe(false);
  });

  it("contra una base sin la 0087 aplicada, NO se inventa el sello", () => {
    // La columna no existe todavía → llega `undefined`. Equivocarse hacia
    // "verificado" sería afirmar algo que nadie comprobó; hacia "no verificado"
    // solo es no decir nada.
    expect(mapCard(fila()).advertiserVerified).toBe(false);
  });
});
