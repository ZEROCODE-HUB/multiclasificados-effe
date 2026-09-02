import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ListingRow } from "@/components/ListingRow";
import { duracionDelPlan, expiryInfo, AVISAR_DESDE } from "@/lib/listings";
import { esAConvenir, precioDeTarjeta, formatPrecioAviso } from "@/lib/pricing";
import type { Listing } from "@/data/mockData";

/**
 * La fila de «Mis avisos»: los puntos 02, 05 y 08 del cliente.
 *
 *  02 · «Precio a convenir» pesaba lo mismo que un importe de verdad.
 *  05 · Renovar, Republicar y Publicar no se distinguían, y cada una salía DOS
 *       veces (en el menú ⋮ y como botón).
 *  08 · Llegaba la campanita del vencimiento, se resaltaba la fila y solo había
 *       "Ver": no aparecía el botón para renovar.
 */

vi.mock("@/lib/imageUrl", () => ({ imgUrl: (u: string) => u || "x.jpg" }));

const AVISO: Listing = {
  id: "a1", title: "Depa en Miraflores", description: "", price: 250000, currency: "PEN",
  condition: "na", category: "inmuebles", location: "Miraflores", department: "15",
  country: "PE", videoCount: 0, lat: null, lng: null, imageUrl: "x.jpg",
  date: "2026-08-01", publishedAt: "2026-08-01T10:00:00Z", featured: false, urgent: false,
  confidential: false, advertiser: "Ana", advertiserVerified: false, views: 12,
  expiresAt: "2026-09-10T10:00:00Z",
} as Listing;

const pintar = (props: Record<string, unknown>) =>
  render(
    <MemoryRouter>
      <ListingRow listing={AVISO} {...props} />
    </MemoryRouter>,
  );

// ───────────────────────────────────────────────────────────── 08
describe("cuándo se ofrece renovar (punto 08)", () => {
  /**
   * LA CAUSA, que costó encontrar.
   *
   * El umbral del 85 % se mide sobre el tiempo contratado, y ese dato vive en
   * `plan_duration_days`. Hasta la 0140 esa columna solo se llenaba en los
   * BORRADORES: un aviso publicado o republicado se quedaba sin ella.
   *
   * La base de datos no tenía ese problema: `notify_expiring_listings` cae en
   * `expires_at - published_at` cuando falta el plan. Así que la campanita
   * avisaba al 85 % de verdad y la app, con otra cuenta, decidía que todavía no
   * tocaba enseñar "Renovar". Con un plan largo la diferencia es enorme.
   */
  const HOY = new Date("2026-09-01T00:00:00Z").getTime();

  it("un plan de 90 días al 90 % consumido: la app decía «normal»", () => {
    // La cuenta VIEJA: sin plan, se miraba si quedaban 7 días o más. A un plan
    // de 90 días al 90 % le quedan NUEVE, así que salía "normal" y el botón de
    // renovar no aparecía — aunque el correo ya hubiera llegado.
    const quedan9 = new Date(HOY + 9 * 86_400_000).toISOString();
    expect(expiryInfo(quedan9, null, HOY)!.tone).toBe("normal");
  });

  it("y con la cuenta de la base, la misma: «por vencer»", () => {
    const publicado = new Date(HOY - 81 * 86_400_000).toISOString();
    const quedan9 = new Date(HOY + 9 * 86_400_000).toISOString();
    const dias = duracionDelPlan(null, publicado, quedan9);
    expect(dias).toBeCloseTo(90, 0);
    expect(expiryInfo(quedan9, dias, HOY)!.tone).not.toBe("normal");
  });

  it("el plan guardado manda cuando está: es el que se pagó", () => {
    const quedan9 = new Date(HOY + 9 * 86_400_000).toISOString();
    expect(duracionDelPlan(30, "2026-01-01T00:00:00Z", quedan9)).toBe(30);
  });

  it("sin plan y sin fechas no se inventa una duración", () => {
    // Devolver un número a ojo aquí sería peor que no saber: decidiría si se
    // enseña el botón de cobrar.
    expect(duracionDelPlan(null, null, null)).toBeNull();
    expect(duracionDelPlan(null, "2026-09-01T00:00:00Z", "2026-08-01T00:00:00Z")).toBeNull();
  });

  it("el umbral sigue siendo el mismo 85 % que usa la base", () => {
    // Si los dos números se separan, vuelve el problema por el otro lado.
    expect(AVISAR_DESDE).toBe(0.85);
  });
});

// ───────────────────────────────────────────────────────────── 05
describe("las acciones de la fila (punto 05)", () => {
  it("cada acción sale UNA vez, no en el menú y además como botón", () => {
    // Publicar, Republicar, Renovar, Editar y Eliminar estaban en los dos
    // sitios. Cinco acciones por duplicado en una fila de cuatro líneas.
    pintar({ onDuplicate: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onView: vi.fn() });
    expect(screen.getAllByRole("button", { name: /^Republicar$/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Editar$/ })).toHaveLength(1);
  });

  it("«Republicar» es la de crear un aviso nuevo, y lo explica", () => {
    // OJO AL NOMBRE, que aquí está el lío: "Republicar" en pantalla NO es la
    // acción que se llamaba así en el código (revivir un aviso vencido). Es
    // `onDuplicate`, la que se llamaba "Publicar uno igual". El cliente decidió
    // (2026-09-02) dejar UNA sola forma de volver a anunciar, y es esta.
    pintar({ onDuplicate: vi.fn(), onView: vi.fn() });
    const boton = screen.getByRole("button", { name: /^Republicar$/ });
    expect(boton.getAttribute("title")).toMatch(/copia/i);
    expect(boton.getAttribute("title")).toMatch(/cambiar lo que quieras/i);
    expect(boton.getAttribute("title")).toMatch(/aviso nuevo/i);
  });

  it("llama a `onDuplicate` y no a las que están ocultas", () => {
    const duplicar = vi.fn();
    const republicar = vi.fn();
    const renovar = vi.fn();
    pintar({ onDuplicate: duplicar, onRepublish: republicar, onRenew: renovar, onView: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: /^Republicar$/ }));
    expect(duplicar).toHaveBeenCalledTimes(1);
    expect(republicar).not.toHaveBeenCalled();
    expect(renovar).not.toHaveBeenCalled();
  });

  it("Renovar y el Republicar viejo NO se pintan, aunque se pasen sus props", () => {
    // Están ocultos por decisión del cliente y su código sigue entero. Esta es
    // la prueba de que "oculto" significa oculto: si alguien descomenta los
    // botones sin querer, esto lo dice.
    pintar({ onRepublish: vi.fn(), onRenew: vi.fn(), onDuplicate: vi.fn(), onView: vi.fn() });
    expect(screen.queryByRole("button", { name: /^Renovar$/ })).toBeNull();
    // Solo uno con ese nombre: el de duplicar. Si el viejo se pintara, serían dos.
    expect(screen.getAllByRole("button", { name: /^Republicar$/ })).toHaveLength(1);
  });

  it("un borrador no ofrece Republicar: nunca llegó a publicarse", () => {
    pintar({ onPublish: vi.fn(), onView: vi.fn(), status: "Borrador" });
    expect(screen.getByRole("button", { name: /^Publicar$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Republicar$/ })).toBeNull();
  });

  it("eliminar ya no está entre los botones principales", () => {
    // Es destructiva y estaba junto a "Editar", a un dedo de distancia en el
    // móvil. Vive en el menú ⋮, que es donde se busca lo que se hace una vez.
    pintar({ onDelete: vi.fn(), onEdit: vi.fn(), onView: vi.fn() });
    expect(screen.queryByRole("button", { name: /^Eliminar$/ })).toBeNull();
  });

  it("sin acciones secundarias no se pinta un menú ⋮ vacío", () => {
    pintar({ onView: vi.fn(), onEdit: vi.fn(), onDuplicate: vi.fn() });
    expect(screen.queryByRole("button", { name: /más opciones/i })).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────── 02
describe("«a convenir» no se pinta como un precio (punto 02)", () => {
  it("un aviso sin precio se detecta, con 0 o con basura", () => {
    expect(esAConvenir(0)).toBe(true);
    expect(esAConvenir(-5)).toBe(true);
    expect(esAConvenir(NaN)).toBe(true);
    expect(esAConvenir(250000)).toBe(false);
  });

  it("en la fila va con el peso del texto secundario, no en negrita grande", () => {
    const { container } = render(
      <MemoryRouter>
        <ListingRow listing={{ ...AVISO, price: 0 }} onView={vi.fn()} />
      </MemoryRouter>,
    );
    const p = [...container.querySelectorAll("p")]
      .find((e) => e.textContent === "Precio a convenir")!;
    expect(p.className).toContain("text-sm");
    expect(p.className).not.toContain("font-extrabold");
  });

  it("y un importe de verdad sigue grande: es el dato que se busca", () => {
    const { container } = render(
      <MemoryRouter>
        <ListingRow listing={AVISO} onView={vi.fn()} />
      </MemoryRouter>,
    );
    const p = [...container.querySelectorAll("p")]
      .find((e) => e.textContent === formatPrecioAviso(250000, "PEN"))!;
    expect(p.className).toContain("font-extrabold");
  });

  it("la tarjeta sigue diciendo la versión corta", () => {
    // "Precio a convenir" mide unos 165 px y la tarjeta de la tira del mapa,
    // 160: partía en dos líneas y descuadraba la fila entera.
    expect(precioDeTarjeta(0, "PEN")).toBe("A convenir");
    expect(formatPrecioAviso(0, "PEN")).toBe("Precio a convenir");
  });
});
