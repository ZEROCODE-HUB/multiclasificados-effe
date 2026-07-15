// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  eventsForRole, prefOrDefault, DEFAULT_PREF, NOTIF_EVENTS,
} from "@/lib/notificationPrefs";

// Lógica pura de las preferencias de notificación (la pestaña Notificaciones de
// Configuración). El acceso a Supabase se prueba vía la UI en otros tests.

describe("notificationPrefs — filtrado por rol", () => {
  it("el buscador ve sus eventos y no los del anunciante", () => {
    const seeker = eventsForRole("buscador").map((e) => e.event);
    expect(seeker).toContain("saved_search_match");   // exclusivo buscador
    expect(seeker).toContain("application_status");    // exclusivo buscador
    expect(seeker).not.toContain("listing_expiring");  // exclusivo anunciante
  });

  it("el anunciante ve sus eventos y no los del buscador", () => {
    const adv = eventsForRole("anunciante").map((e) => e.event);
    expect(adv).toContain("listing_expiring");         // exclusivo anunciante
    expect(adv).not.toContain("saved_search_match");   // exclusivo buscador
  });

  it("los eventos comunes aparecen para ambos roles", () => {
    for (const role of ["buscador", "anunciante"] as const) {
      const events = eventsForRole(role).map((e) => e.event);
      expect(events).toContain("new_message");
      expect(events).toContain("new_review");
    }
  });
});

describe("notificationPrefs — valores por defecto", () => {
  it("sin fila explícita usa el default (in-app on, push/email off)", () => {
    expect(prefOrDefault({}, "new_message")).toEqual(DEFAULT_PREF);
    expect(DEFAULT_PREF).toEqual({ in_app: true, push: false, email: false });
  });

  it("con fila explícita respeta lo guardado", () => {
    const map = { new_message: { in_app: false, push: true, email: false } };
    expect(prefOrDefault(map, "new_message")).toEqual({ in_app: false, push: true, email: false });
    // Un evento sin fila sigue cayendo al default.
    expect(prefOrDefault(map, "new_review")).toEqual(DEFAULT_PREF);
  });

  it("todos los eventos declarados tienen etiqueta y descripción", () => {
    for (const e of NOTIF_EVENTS) {
      expect(e.label.trim().length).toBeGreaterThan(0);
      expect(e.desc.trim().length).toBeGreaterThan(0);
    }
  });
});
