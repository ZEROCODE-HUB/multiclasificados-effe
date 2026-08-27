import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ListingCard } from "@/components/ListingCard";
import type { Listing } from "@/data/mockData";

// Los adicionales Urgente / Destacado / Confidencial se ven como insignias en la
// tarjeta del aviso. Solo aparecen si el aviso los trae activados.

vi.mock("@/hooks/useSession", () => ({ useSession: () => ({ supabase: true }) }));
vi.mock("@/hooks/useFavorites", () => ({ useFavorites: () => ({ isFavorite: () => false, toggle: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() }) }));

const BASE: Listing = {
  id: "l1", title: "Casa en venta", description: "d", price: 100, currency: "PEN",
  category: "inmuebles", location: "Lima", imageUrl: "x", date: "2026-07-10",
  featured: false, advertiser: "A", views: 0,
};

const renderCard = (extra: Partial<Listing>, layout: "grid" | "list" = "grid") =>
  render(
    <MemoryRouter><ListingCard listing={{ ...BASE, ...extra }} layout={layout} /></MemoryRouter>,
  );

// Las insignias van como icono; el nombre es el aria-label (y el tooltip al
// pasar el mouse). Se consultan por etiqueta accesible, no por texto visible.
describe("ListingCard — insignias de adicionales", () => {
  it("sin adicionales no muestra ninguna insignia", () => {
    renderCard({});
    expect(screen.queryByLabelText("Destacado")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Urgente")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Confidencial")).not.toBeInTheDocument();
  });

  it("muestra 'Urgente' solo si el aviso es urgente", () => {
    renderCard({ urgent: true });
    expect(screen.getByLabelText("Urgente")).toBeInTheDocument();
    expect(screen.queryByLabelText("Destacado")).not.toBeInTheDocument();
  });

  // "Destacado" YA NO lleva chip en la tarjeta: el marco dorado lo dice, y el
  // icono era la misma información dos veces justo donde menos sitio hay. En la
  // ficha del aviso sigue estando, que allí no compite con nada.
  it("'Destacado' no lleva chip: lo dice el marco dorado", () => {
    const { container } = renderCard({ featured: true, confidential: true });
    expect(screen.queryByLabelText("Destacado")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Confidencial")).toBeInTheDocument();
    expect((container.firstChild as HTMLElement).className).toContain("amber");
  });

  // Quitarle el icono no puede dejar el dato solo en el color: quien use lector
  // de pantalla, o no distinga el dorado, se quedaría sin saberlo.
  it("aun sin chip, un lector de pantalla sí sabe que está destacado", () => {
    renderCard({ featured: true });
    expect(screen.getByText("Aviso destacado")).toBeInTheDocument();
  });

  it("también muestra las insignias en el layout de lista", () => {
    renderCard({ urgent: true, confidential: true }, "list");
    expect(screen.getByLabelText("Urgente")).toBeInTheDocument();
    expect(screen.getByLabelText("Confidencial")).toBeInTheDocument();
  });

  // El documento pide para Destacado un "marco dorado" (además de la insignia).
  // El marco vive en el wrapper de la card; el enlace real (EFFE-014) es un
  // overlay aparte, así que se consulta el wrapper (container.firstChild), no el link.
  it("el aviso Destacado lleva marco dorado", () => {
    const { container } = renderCard({ featured: true });
    expect((container.firstChild as HTMLElement).className).toContain("amber");
  });

  it("un aviso sin Destacado no lleva marco dorado", () => {
    const { container } = renderCard({ urgent: true });
    expect((container.firstChild as HTMLElement).className).not.toContain("amber");
  });
});
