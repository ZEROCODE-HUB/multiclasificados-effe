import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Session, SessionRole } from "@/hooks/useSession";

// MOB-02: con el teclado abierto dentro de una conversación, la barra de
// escribir no se acoplaba al teclado — quedaba flotando con un hueco debajo.
// La causa era esta barra de 5 iconos: el WebView se encoge con el teclado, pero
// ella seguía reservando sus 4rem justo encima. Dentro de un chat abierto no
// aporta nada (el chat ya tiene su propio "volver"), así que desaparece.

const { sessionRef } = vi.hoisted(() => ({ sessionRef: { current: null as Session | null } }));
vi.mock("@/hooks/useSession", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, useSession: () => sessionRef.current };
});
vi.mock("@/hooks/useUnreadMessages", () => ({ useUnreadMessages: () => 0 }));

import { MobileBottomNav } from "@/components/MobileBottomNav";

const sess = (role: SessionRole): Session => ({ role, name: "Ana Gómez", initials: "AG", supabase: true });

function renderNav(url: string, role: SessionRole = "buscador") {
  sessionRef.current = sess(role);
  render(
    <MemoryRouter initialEntries={[url]}>
      <MobileBottomNav />
    </MemoryRouter>,
  );
}

const hayBarra = () => screen.queryByRole("link", { name: /Inicio/i }) !== null;

beforeEach(() => vi.clearAllMocks());

describe("MobileBottomNav — dentro de una conversación", () => {
  it("se oculta cuando hay un chat abierto (?c=…)", () => {
    renderNav("/dashboard/buscador/mensajes?c=conv-123");
    expect(hayBarra()).toBe(false);
  });

  it("sigue visible en la lista de conversaciones, sin ninguna abierta", () => {
    renderNav("/dashboard/buscador/mensajes");
    expect(hayBarra()).toBe(true);
  });

  it("también se oculta para el anunciante", () => {
    renderNav("/dashboard/anunciante/mensajes?c=conv-9", "anunciante");
    expect(hayBarra()).toBe(false);
  });

  it("un ?c= en otra pantalla no la oculta", () => {
    // La regla mira la ruta de mensajes, no cualquier parámetro llamado "c".
    renderNav("/dashboard/buscador/favoritos?c=algo");
    expect(hayBarra()).toBe(true);
  });

  it("se mantiene en el resto de la app", () => {
    renderNav("/buscar");
    expect(hayBarra()).toBe(true);
  });
});
