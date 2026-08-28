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

// El sello es TEXTO y vive en el bloque de contenido, no sobre la foto.
const sello = () => screen.queryByText(/anunciante verificado/i);

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

  // DÓNDE VIVE, que ha cambiado dos veces y conviene dejarlo escrito.
  // Empezó como chip con la palabra sobre la foto: medía 95 px y, anclado a 48
  // del borde, ocupaba 143 de los ~158 de una tarjeta a dos columnas. Pasó a
  // ser solo el escudo, y seguía siendo un recuadro de 32 px tapando el aviso y
  // peleándose con el favorito por la esquina. Ahora es texto, abajo, fuera de
  // la foto: no tapa nada y encima se lee.
  it("no va encima de la foto, sino en el texto", () => {
    const { container } = renderCard({ advertiserVerified: true });
    const foto = container.querySelector("img")!.parentElement!;
    expect(foto.textContent).not.toMatch(/verificado/i);
    expect(sello()).toBeInTheDocument();
  });

  // Va pegado al precio: a secas, "Verificado" se leería como si lo comprobado
  // fuera el importe. Lo que el equipo revisa es a quien publica.
  it("dice ANUNCIANTE, para no dar a entender que se comprobó el precio", () => {
    renderCard({ advertiserVerified: true });
    expect(sello()!.textContent).toMatch(/anunciante/i);
  });

  it("se lee, sin depender de reconocer un símbolo", () => {
    // Antes era solo un escudo: quien no lo reconociera se quedaba sin el dato.
    renderCard({ advertiserVerified: true });
    expect(sello()!.textContent!.trim().length).toBeGreaterThan(5);
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

/**
 * TODAS LAS TARJETAS MIDEN LO MISMO.
 *
 * La línea del sello se pintaba solo cuando el anunciante estaba verificado,
 * así que esas tarjetas medían unos píxeles más que las demás y la fila salía
 * descuadrada. Reservar el hueco siempre cuesta una línea de 10 px y las iguala.
 */
describe("el sello no descuadra la fila", () => {
  const bloqueDelSello = (c: HTMLElement) =>
    [...c.querySelectorAll("p")].find((p) => p.className.includes("min-h-[0.875rem]"));

  it("la línea se reserva aunque el anunciante NO esté verificado", () => {
    const { container } = renderCard({ advertiserVerified: false });
    expect(bloqueDelSello(container)).toBeTruthy();
  });

  it("y sigue estando cuando sí lo está", () => {
    const { container } = renderCard({ advertiserVerified: true });
    expect(bloqueDelSello(container)).toBeTruthy();
  });

  it("pero vacía cuando no hay sello: se reserva el hueco, no se inventa el dato", () => {
    const { container } = renderCard({ advertiserVerified: false });
    expect(bloqueDelSello(container)!.textContent!.trim()).toBe("");
    expect(sello()).toBeNull();
  });

  // LO QUE RESERVA UN HUECO TIENE QUE MEDIR LO QUE OCUPA SU CONTENIDO.
  //
  // Reservar el sitio del sello no bastaba, y el fallo sobrevivió a la primera
  // corrección: `text-[10px]` solo fija el TAMAÑO DE LETRA. La altura de línea
  // la heredaba del `line-height: 1.65` del body, así que el texto ocupaba
  // 16,5 px dentro de un hueco reservado de 14 — la tarjeta con sello seguía
  // midiendo dos píxeles y medio más que la de al lado.
  //
  // Lo mismo pasaba con el título: dos líneas a `leading-snug` miden 38,5 px y
  // se reservaban 36, así que una tarjeta de título corto y otra de título
  // largo tampoco medían igual.
  //
  // jsdom no calcula diseño, así que no se puede medir el alto real; lo que sí
  // se puede es comprobar la ARITMÉTICA de las clases, que es donde estuvo el
  // error las dos veces. Si alguien cambia una y olvida la otra, esto avisa.
  describe("la reserva mide exactamente lo que ocupa el contenido", () => {
    const REM = 16;
    // `leading-5` → 1.25rem; `leading-[0.875rem]` → 0.875rem.
    const alturaDeLinea = (clases: string) => {
      const arbitraria = /leading-\[([\d.]+)rem\]/.exec(clases);
      if (arbitraria) return Number(arbitraria[1]) * REM;
      const escala = /(?:^|\s)leading-(\d+)(?:\s|$)/.exec(clases);
      if (escala) return (Number(escala[1]) / 4) * REM;
      // Sin altura de línea propia hereda el 1.65 del body: es justo el caso
      // que rompía la reserva, así que no puede pasar por bueno.
      return null;
    };
    const reserva = (clases: string) => {
      const m = /min-h-\[([\d.]+)rem\]/.exec(clases);
      return m ? Number(m[1]) * REM : null;
    };

    it("el sello: una línea de 10 px cabe en su hueco, ni más ni menos", () => {
      const { container } = renderCard({ advertiserVerified: true });
      const cls = bloqueDelSello(container)!.className;
      expect(alturaDeLinea(cls)).toBe(reserva(cls));
    });

    it("el título: el hueco son DOS líneas clavadas", () => {
      const { container } = renderCard({ advertiserVerified: true });
      const h3 = container.querySelector("h3")!;
      expect(h3.className).toContain("line-clamp-2");
      expect(alturaDeLinea(h3.className)! * 2).toBe(reserva(h3.className));
    });
  });

  it("las dos tarjetas tienen las MISMAS filas de contenido", () => {
    // Lo que decide el alto son los bloques del cuerpo, no cuántos elementos
    // haya dentro de cada uno: el sello mete un icono y un texto DENTRO de un
    // hueco que ya estaba reservado, así que no añade ninguna fila.
    const filas = (verificado: boolean) => {
      const { container } = renderCard({ advertiserVerified: verificado });
      const cuerpo = [...container.querySelectorAll("div")]
        .find((d) => d.className.includes("flex-1") && d.className.includes("min-w-0"))!;
      return cuerpo.children.length;
    };
    expect(filas(true)).toBe(filas(false));
  });
});
