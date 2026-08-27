import { describe, it, expect } from "vitest";
import { statusMeta, metaFor } from "@/pages/admin/estadoDeUsuario";

/**
 * Cómo se enseña el estado de una cuenta en el panel.
 *
 * EL BUG, tal como lo vio el cliente: pulsa "Dar de baja", sale el aviso de que
 * el usuario se desactivó… y la tabla lo sigue mostrando como ACTIVO.
 *
 * No fallaba la baja: en la base el perfil quedaba en `inactive` correctamente.
 * Fallaba el mapa de etiquetas, que no conocía ese estado —lo introdujo la
 * migración 0127— y tenía un fallback que ante lo desconocido devolvía "Activo".
 * Es decir: afirmaba justo lo contrario de lo que había pasado.
 *
 * De ahí que estas pruebas cubran las dos cosas: que `inactive` exista, y que el
 * fallback no vuelva a mentir nunca más.
 */

describe("las etiquetas de estado", () => {
  it("conoce 'inactive', que es lo que deja una baja", () => {
    expect(statusMeta.inactive).toBeDefined();
    expect(metaFor("inactive").label).toBe("Inactivo");
  });

  it("no pinta la baja de rojo: no es un castigo como la suspensión", () => {
    // Suspender es una sanción; dar de baja es cerrar una cuenta. Pintarlas
    // igual mezclaría dos cosas que administración necesita distinguir.
    expect(metaFor("inactive").color).not.toContain("destructive");
    expect(metaFor("suspended").color).toContain("destructive");
  });

  it("los estados de siempre no cambian", () => {
    expect(metaFor("active").label).toBe("Activo");
    expect(metaFor("suspended").label).toBe("Suspendido");
    // "banned" es un bloqueo heredado y se unifica con la suspensión.
    expect(metaFor("banned").label).toBe("Suspendido");
  });
});

describe("ante un estado desconocido NO se dice 'Activo'", () => {
  // Esta es la regla que habría evitado el bug entero: el fallback decía
  // "Activo" ante cualquier cosa que no supiera, así que un estado nuevo no se
  // notaba — se disfrazaba de lo contrario.
  it("un estado que nadie contempló se enseña tal cual", () => {
    expect(metaFor("archivado").label).toBe("archivado");
    expect(metaFor("archivado").label).not.toBe("Activo");
  });

  it("tampoco con la cadena vacía", () => {
    expect(metaFor("").label).not.toBe("Activo");
  });

  it("cualquier estado futuro salta a la vista en vez de esconderse", () => {
    for (const s of ["pendiente_de_borrado", "moroso", "xyz"]) {
      expect(metaFor(s).label).toBe(s);
    }
  });
});
