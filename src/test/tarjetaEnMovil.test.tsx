import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ListingCard } from "@/components/ListingCard";
import { columnsThatFit } from "@/hooks/useFittingCount";
import type { Listing } from "@/data/mockData";

/**
 * La tarjeta con DOS por fila en el teléfono.
 *
 * A una sola columna la tarjeta ocupaba el ancho completo: la foto crecía a
 * ~270 px de alto y solo cabia 1,4 avisos por pantalla. Con 179 avisos activos
 * eso es mucho scroll para ver poco.
 *
 * Pasar a dos columnas no es solo cambiar el numero de la rejilla: a ~158 px de
 * ancho hay tres cosas que se rompen, y son las que fijan estos tests.
 */

vi.mock("@/hooks/useSession", () => ({ useSession: () => ({ supabase: true }) }));
vi.mock("@/hooks/useFavorites", () => ({ useFavorites: () => ({ isFavorite: () => false, toggle: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() }) }));

const BASE: Listing = {
  id: "l1", title: "Casa en venta", description: "d", price: 100, currency: "PEN",
  category: "inmuebles", location: "Lima", imageUrl: "x", date: "2026-07-10",
  featured: false, advertiser: "A", views: 0,
};

const pintar = (extra: Partial<Listing> = {}) =>
  render(<MemoryRouter><ListingCard listing={{ ...BASE, ...extra }} /></MemoryRouter>);

describe("densidad de la tarjeta en movil", () => {
  it("el boton 'Ver detalle' no se muestra en movil", () => {
    // La tarjeta entera YA es un enlace que la cubre, asi que en movil el boton
    // repetia el mismo destino a cambio de 32 px de alto por tarjeta.
    pintar();
    const boton = screen.getByRole("button", { name: /ver detalle/i });
    expect(boton.className).toContain("hidden");
    expect(boton.className).toContain("sm:inline-flex");
  });

  it("en escritorio si se muestra: ahi hay sitio y acompana al hover", () => {
    pintar();
    expect(screen.getByRole("button", { name: /ver detalle/i }).className)
      .toMatch(/sm:inline-flex/);
  });

  it("el hueco reservado a la derecha baja a 3.5rem", () => {
    // Arriba a la derecha ya solo queda el favorito (de 12 a 44 px): al bajar
    // el sello al bloque de texto se liberaron 36 px, que en una tarjeta de
    // 158 px no son pocos. Con el valor original (8.5rem) al bloque izquierdo
    // le quedaban 22 px y los distintivos no cabian.
    pintar({ confidential: true });
    // Se llega por un chip: un querySelector con los corchetes de Tailwind
    // dentro del valor no es un selector CSS valido. Se usa Confidencial y no
    // Destacado porque ese ya no pinta chip (lo dice el marco dorado).
    const bloque = screen.getByRole("img", { name: /confidencial/i }).parentElement!;
    expect(bloque.className).toContain("max-w-[calc(100%-3.5rem)]");
    expect(bloque.className).not.toContain("8.5rem");
  });
});

describe("el distintivo Urgente parpadea", () => {
  const chip = () => screen.queryByRole("img", { name: /urgente/i });
  // Lo que se anima NO es el chip sino una capa de destello por encima: si se
  // animara el chip entero, el icono y el contador de horas se desvanecerian
  // con el y la cifra dejaria de leerse justo cuando mas se mira.
  const destello = () => chip()?.querySelector("[aria-hidden]");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T10:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("parpadea mientras el plazo sigue corriendo", () => {
    pintar({ urgent: true, expiresAt: "2026-08-29T10:00:00Z" });
    expect(destello()?.className).toContain("animate-latido-urgente");
  });

  it("el icono y el contador NO se desvanecen: solo el fondo", () => {
    pintar({ urgent: true, expiresAt: "2026-08-29T10:00:00Z" });
    // El chip en si no lleva la animacion; la lleva la capa de detras.
    expect(chip()!.className).not.toContain("animate-latido-urgente");
    expect(destello()).toBeTruthy();
  });

  it("el fondo rojo sigue solido: no deja asomar la foto", () => {
    // Con opacidad sobre el chip, en imagenes claras se transparentaba la foto
    // y el distintivo se veia sucio. El destello va ENCIMA de un rojo opaco.
    pintar({ urgent: true, expiresAt: "2026-08-29T10:00:00Z" });
    expect(chip()!.className).toContain("bg-red-600");
  });

  it("se queda quieto cuando el plazo ya vencio", () => {
    // Un "Urgente" caducado parpadeando seria una llamada de atencion a algo
    // que ya no la merece.
    pintar({ urgent: true, expiresAt: "2026-08-20T10:00:00Z" });
    expect(destello()).toBeFalsy();
  });

  it("respeta a quien pidio menos animacion en su sistema", () => {
    // `motion-safe:` traduce a @media (prefers-reduced-motion: no-preference).
    // Sin ese prefijo, el parpadeo se le impondria a quien lo desactivo por
    // motivos vestibulares o de migrana.
    pintar({ urgent: true, expiresAt: "2026-08-29T10:00:00Z" });
    expect(destello()?.className).toContain("motion-safe:animate-latido-urgente");
  });

  it("los otros distintivos no parpadean: es del que corre plazo", () => {
    pintar({ confidential: true });
    const otro = screen.getByRole("img", { name: /confidencial/i });
    expect(otro.className).not.toContain("animate-latido-urgente");
    expect(otro.querySelector("[aria-hidden]")).toBeFalsy();
  });
});

describe("la portada entra en dos columnas en movil", () => {
  // La portada no usa grid-cols: pide un ancho minimo por tarjeta y deja que
  // CSS decida. Con 230 px, un movil de 360 (menos 32 de margenes) daba UNA
  // sola columna sin que nadie hubiera escrito un grid-cols-1.
  const GAP = 16;

  it("con el minimo viejo de 230 solo cabia una", () => {
    expect(columnsThatFit(360 - 32, 230, GAP)).toBe(1);
  });

  it("con 150 entran dos", () => {
    expect(columnsThatFit(360 - 32, 150, GAP)).toBe(2);
    expect(columnsThatFit(412 - 32, 150, GAP)).toBe(2);
  });

  it("el escritorio se queda como estaba: 150 lo llenaria de columnas diminutas", () => {
    // Es la razon de que el minimo cambie por tramo en vez de bajar a secas.
    expect(columnsThatFit(1200, 230, GAP)).toBe(4);
    expect(columnsThatFit(1200, 150, GAP)).toBe(7);
  });
});

describe("el aviso 'tiene video'", () => {
  const chip = () => screen.queryByRole("img", { name: /incluye video/i });

  it("va DENTRO de la imagen, no colgando del fondo de la tarjeta", () => {
    // El bug: estaba anclado al wrapper (imagen + textos), asi que su bottom-3
    // no caia sobre la foto sino sobre el precio.
    pintar({ videoCount: 2 });
    const marco = chip()!.parentElement!;
    // Su padre tiene que ser el contenedor de la FOTO: el que lleva el 4:3 y
    // el <img> dentro. Si vuelve a colgar del wrapper, aqui no habria imagen.
    expect(marco.querySelector("img")).toBeTruthy();
    expect(marco.style.aspectRatio).toBe("4 / 3");
  });

  it("es solo el icono: la palabra pesaba mas que el propio aviso", () => {
    pintar({ videoCount: 1 });
    expect(screen.queryByText(/^video$/i)).toBeNull();
    expect(chip()).toBeInTheDocument();
  });

  it("sin videos no aparece", () => {
    pintar();
    expect(chip()).toBeNull();
  });
});
