import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { prepararDom } from "./domPolyfills";

/**
 * El pie de la portada TAMBIÉN se ve en el móvil.
 *
 * ── QUÉ HABÍA ANTES ──────────────────────────────────────────────────────────
 *
 *     <footer className="hidden md:block …">   // "oculto en móvil, look app"
 *
 * Con eso, en un teléfono no había forma de llegar a «Acerca de nosotros»,
 * «Trabaje con nosotros», los términos, el correo de contacto ni las redes: la
 * portada se acababa en la sección de «Acerca de» y ya.
 *
 * ── LO QUE HAY QUE VIGILAR AL ENSEÑARLO ──────────────────────────────────────
 *
 * La barra inferior del móvil (`MobileBottomNav`) es `fixed bottom-0` y tapa
 * 4rem del final de la página. La página reservaba ese hueco en su contenedor,
 * POR FUERA del pie — y así el hueco salía del color del fondo: entre el pie
 * oscuro y la barra oscura aparecía una franja blanca.
 *
 * Por eso la reserva vive ahora DENTRO del `<footer>`: su fondo corre por debajo
 * de la barra y no se ve ninguna costura. Estas pruebas fijan las dos cosas —
 * que se vea, y que reserve el sitio en el elemento correcto—.
 */

beforeEach(() => {
  prepararDom();
  localStorage.setItem("effe:pais", "PE");
});

vi.mock("@/lib/listings", () => ({
  fetchListings: async () => [],
  searchListings: async () => [],
}));
vi.mock("@/lib/stats", () => ({
  fetchPlatformStats: async () => null,
  fetchCategoryCounts: async () => ({}),
}));
vi.mock("@/hooks/useCategories", () => ({ useCategories: () => [] }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/LibroReclamaciones", () => ({ LibroReclamaciones: () => null }));

// La sesión decide si hay barra inferior, así que se cambia por prueba.
const session = vi.fn();
vi.mock("@/hooks/useSession", () => ({ useSession: () => session() }));

import Index from "@/pages/Index";

const pie = () => {
  const { container } = render(<MemoryRouter><Index /></MemoryRouter>);
  return { footer: container.querySelector("footer")!, raiz: container.firstElementChild! };
};

describe("el pie de la portada se ve en el móvil", () => {
  it("no está oculto por debajo de `md`", () => {
    session.mockReturnValue(null);
    const { footer } = pie();
    // `hidden md:block` era exactamente lo que lo escondía en el teléfono.
    expect(footer.className).not.toContain("hidden");
  });

  it("y sigue teniendo su contenido, no solo la caja", () => {
    // Que se vea la etiqueta vacía no sirve de nada: lo que hacía falta en el
    // móvil eran estos enlaces.
    session.mockReturnValue(null);
    const { footer } = pie();
    expect(footer.querySelector('a[href="/acerca-de"]')).not.toBeNull();
    expect(footer.querySelector('a[href="/trabaje-con-nosotros"]')).not.toBeNull();
    expect(footer.textContent).toContain("info@coleffe.com");
  });
});

describe("y no queda debajo de la barra inferior", () => {
  it("con sesión de anunciante, el PIE reserva el alto de la barra", () => {
    session.mockReturnValue({ role: "anunciante", name: "Ana", initials: "A", supabase: true });
    const { footer, raiz } = pie();
    // La reserva tiene que estar en el pie, que es quien pinta el fondo oscuro.
    expect(footer.className).toContain("var(--nav-bottom)");
    // Y NO en el contenedor: ahí dejaba una franja del color del fondo entre el
    // pie y la barra.
    expect(raiz.className).not.toContain("var(--nav-bottom)");
  });

  it("en escritorio ese `pb` no encoge el pie", () => {
    // A partir de lg la barra no existe y `--nav-bottom` se queda en el inset,
    // así que sin este override el pie perdería su respiro de siempre.
    session.mockReturnValue({ role: "anunciante", name: "Ana", initials: "A", supabase: true });
    const { footer } = pie();
    expect(footer.className).toContain("lg:pb-24");
  });

  it("sin barra inferior (visitante), el pie usa su margen normal", () => {
    session.mockReturnValue(null);
    const { footer } = pie();
    expect(footer.className).not.toContain("var(--nav-bottom)");
    expect(footer.className).toContain("pb-14");
  });
});
