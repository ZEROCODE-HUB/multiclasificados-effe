import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListingRow } from "@/components/ListingRow";
import type { Listing } from "@/data/mockData";

// El contador de "Mis avisos": un aviso activo muestra cuántos días le quedan;
// uno vencido o pausado no muestra cuenta regresiva.

const BASE: Listing = {
  id: "l1", title: "Casa en venta", description: "d", price: 100, currency: "PEN",
  category: "inmuebles", location: "Lima", imageUrl: "x", date: "2026-07-10",
  featured: false, advertiser: "", views: 3,
};

beforeEach(() => { vi.useFakeTimers().setSystemTime(new Date("2026-07-10T12:00:00Z")); });
afterEach(() => { vi.useRealTimers(); });

const enDias = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

describe("ListingRow — contador de vencimiento", () => {
  it("un aviso activo muestra los días que le quedan", () => {
    render(<ListingRow listing={BASE} status="Activo" expiresAt={enDias(30)} />);
    expect(screen.getByText("Vence en 30 días")).toBeInTheDocument();
  });

  it("no muestra contador si el aviso está vencido", () => {
    render(<ListingRow listing={BASE} status="Vencido" expiresAt={enDias(-1)} />);
    expect(screen.queryByText(/vence en/i)).not.toBeInTheDocument();
  });

  it("no muestra contador en un borrador (sin fecha de vencimiento)", () => {
    render(<ListingRow listing={BASE} status="Borrador" expiresAt={null} />);
    expect(screen.queryByText(/vence/i)).not.toBeInTheDocument();
  });
});
