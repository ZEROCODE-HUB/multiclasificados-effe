import { describe, it, expect } from "vitest";
import { notificationText, notificationLink, type AppNotification } from "@/lib/notifications";

// EFFE-039 (front): el tipo 'new_application' se renderiza y enlaza al panel de
// postulaciones del anunciante.

const mk = (payload: Record<string, unknown>): AppNotification => ({
  id: "n1",
  type: "new_application",
  title: "Nueva postulación",
  payload,
  read_at: null,
  created_at: "2026-07-21T00:00:00Z",
});

describe("notificación new_application", () => {
  it("el texto incluye el título del aviso", () => {
    expect(notificationText(mk({ listing_title: "Vacante de cocinero" })))
      .toBe('Nueva postulación en "Vacante de cocinero"');
  });

  it("sin título usa un texto genérico legible", () => {
    expect(notificationText(mk({}))).toBe('Nueva postulación en "tu aviso"');
  });

  it("enlaza al panel de postulaciones del anunciante", () => {
    expect(notificationLink(mk({ listing_id: "L1" }), "anunciante"))
      .toBe("/dashboard/anunciante/postulaciones");
  });
});

// IT2-036: el cambio de estado de una postulación debe traducirse a español;
// antes 'interview' se mostraba crudo ("cambió a: interview").
describe("notificación application_status", () => {
  const st = (status: string): AppNotification => ({
    id: "n2",
    type: "application_status",
    title: "Tu postulación cambió de estado",
    payload: { listing_id: "L1", status },
    read_at: null,
    created_at: "2026-07-21T00:00:00Z",
  });

  it("traduce 'interview' a 'En entrevista'", () => {
    expect(notificationText(st("interview"))).toBe("Tu postulación cambió a: En entrevista");
  });

  it("traduce el resto de estados", () => {
    expect(notificationText(st("reviewed"))).toBe("Tu postulación cambió a: En revisión");
    expect(notificationText(st("accepted"))).toBe("Tu postulación cambió a: Aceptada");
    expect(notificationText(st("rejected"))).toBe("Tu postulación cambió a: Rechazada");
  });
});
