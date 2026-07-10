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

describe("ListingCard — insignias de adicionales", () => {
  it("sin adicionales no muestra ninguna insignia", () => {
    renderCard({});
    expect(screen.queryByText("Destacado")).not.toBeInTheDocument();
    expect(screen.queryByText("Urgente")).not.toBeInTheDocument();
    expect(screen.queryByText("Confidencial")).not.toBeInTheDocument();
  });

  it("muestra 'Urgente' solo si el aviso es urgente", () => {
    renderCard({ urgent: true });
    expect(screen.getByText("Urgente")).toBeInTheDocument();
    expect(screen.queryByText("Destacado")).not.toBeInTheDocument();
  });

  it("muestra 'Destacado' y 'Confidencial' cuando ambos están activos", () => {
    renderCard({ featured: true, confidential: true });
    expect(screen.getByText("Destacado")).toBeInTheDocument();
    expect(screen.getByText("Confidencial")).toBeInTheDocument();
  });

  it("también muestra las insignias en el layout de lista", () => {
    renderCard({ urgent: true, confidential: true }, "list");
    expect(screen.getByText("Urgente")).toBeInTheDocument();
    expect(screen.getByText("Confidencial")).toBeInTheDocument();
  });
});
