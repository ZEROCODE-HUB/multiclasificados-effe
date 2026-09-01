import { describe, it, expect } from "vitest";
import { agruparPorAviso } from "@/lib/denuncias";
import type { AdminReport } from "@/lib/admin";

/**
 * Agrupar las denuncias por aviso (1-sep-2026).
 *
 * La decisión que toma quien modera es SOBRE EL AVISO: lo que se deshabilita o
 * se deja es el aviso, no cada denuncia. Sin agrupar, el aviso con nueve
 * denuncias eran nueve tarjetas y nueve botones para una sola decisión — y al
 * pulsar el primero las otras ocho se quedaban en "Pendiente" con el aviso ya
 * caído.
 *
 * El orden por denuncias SIN CERRAR es lo que el cliente pidió con "controlar la
 * cantidad de Reportes que tiene un aviso": el más denunciado arriba, no perdido
 * entre los demás por fecha.
 */

let n = 0;
const denuncia = (o: Partial<AdminReport> & { listing_id: string | null }): AdminReport => ({
  id: `r${++n}`, target_type: "listing", reason: "Posible estafa", category: "Posible estafa o fraude",
  status: "open", action_taken: null, reporter: "Vecino", reported: "Luis",
  reporter_id: null, reported_id: null, listing_title: "Aviso",
  assigned_to: null, assignee: null, created_at: "2026-08-01T10:00:00Z",
  ...o,
});

describe("qué se junta con qué", () => {
  it("las denuncias del mismo aviso caen en un solo grupo", () => {
    const g = agruparPorAviso([
      denuncia({ listing_id: "a", listing_title: "Auto" }),
      denuncia({ listing_id: "b", listing_title: "Casa" }),
      denuncia({ listing_id: "a", listing_title: "Auto" }),
    ]);
    expect(g).toHaveLength(2);
    expect(g.find((x) => x.listingId === "a")!.denuncias).toHaveLength(2);
  });

  it("una denuncia sin aviso va sola, no en un cajón común", () => {
    // No debería pasar en esta pestaña, pero juntar bajo una clave nula cosas
    // que no tienen nada que ver sería peor que dejarlas sueltas.
    const g = agruparPorAviso([
      denuncia({ listing_id: null }),
      denuncia({ listing_id: null }),
    ]);
    expect(g).toHaveLength(2);
  });

  it("separa las abiertas de las cerradas dentro del grupo", () => {
    // `abiertas` es lo que exige una decisión, y lo que cierran los botones.
    const [g] = agruparPorAviso([
      denuncia({ listing_id: "a", status: "open" }),
      denuncia({ listing_id: "a", status: "reviewing" }),
      denuncia({ listing_id: "a", status: "resolved" }),
    ]);
    expect(g.denuncias).toHaveLength(3);
    expect(g.abiertas).toHaveLength(2);
    // "reviewing" NO está cerrada: sigue esperando a alguien.
    expect(g.abiertas.map((r) => r.status).sort()).toEqual(["open", "reviewing"]);
  });
});

describe("cuántas tiene el aviso de verdad", () => {
  it("con el filtro puesto, el total sale de la base y no de la lista", () => {
    // Filtrando por "Pendiente" solo llega una de las tres. Decir "1 en total"
    // le escondería al moderador que ese aviso acumula tres denuncias, que es
    // justo el dato que el cliente pidió ver.
    const [g] = agruparPorAviso([
      denuncia({ listing_id: "a", reportes_del_aviso: 3 }),
    ]);
    expect(g.abiertas).toHaveLength(1);
    expect(g.total).toBe(3);
  });

  it("nunca dice menos de las que se están enseñando", () => {
    // Las denuncias anteriores a la 0136 no traen `reportes_del_aviso`, y una
    // cuenta desfasada tampoco puede dejar el total por debajo de lo visible.
    const [g] = agruparPorAviso([
      denuncia({ listing_id: "a", reportes_del_aviso: null }),
      denuncia({ listing_id: "a", reportes_del_aviso: null }),
    ]);
    expect(g.total).toBe(2);
  });
});

describe("el orden", () => {
  it("primero el aviso con más denuncias sin cerrar", () => {
    const g = agruparPorAviso([
      denuncia({ listing_id: "b", listing_title: "Casa" }),
      denuncia({ listing_id: "a", listing_title: "Auto" }),
      denuncia({ listing_id: "a", listing_title: "Auto" }),
      denuncia({ listing_id: "a", listing_title: "Auto" }),
    ]);
    expect(g.map((x) => x.titulo)).toEqual(["Auto", "Casa"]);
  });

  it("las resueltas no empujan un aviso hacia arriba", () => {
    // Un aviso con nueve denuncias ya cerradas no necesita mirarse; uno con dos
    // abiertas sí. Contar el total invertiría el orden.
    const g = agruparPorAviso([
      ...Array.from({ length: 9 }, () => denuncia({ listing_id: "viejo", listing_title: "Viejo", status: "resolved" })),
      denuncia({ listing_id: "nuevo", listing_title: "Nuevo" }),
      denuncia({ listing_id: "nuevo", listing_title: "Nuevo" }),
    ]);
    expect(g.map((x) => x.titulo)).toEqual(["Nuevo", "Viejo"]);
  });

  it("a igualdad de abiertas, manda la denuncia más reciente", () => {
    const g = agruparPorAviso([
      denuncia({ listing_id: "a", listing_title: "Antiguo", created_at: "2026-08-01T10:00:00Z" }),
      denuncia({ listing_id: "b", listing_title: "Reciente", created_at: "2026-08-25T10:00:00Z" }),
    ]);
    expect(g.map((x) => x.titulo)).toEqual(["Reciente", "Antiguo"]);
  });

  it("la fecha del grupo es la de su denuncia más nueva, no la de la primera", () => {
    // Si se tomara la primera de la lista, un aviso denunciado ayer se hundiría
    // por tener también una denuncia de julio.
    const [g] = agruparPorAviso([
      denuncia({ listing_id: "a", created_at: "2026-07-01T10:00:00Z" }),
      denuncia({ listing_id: "a", created_at: "2026-08-25T10:00:00Z" }),
    ]);
    expect(g.ultima).toBe("2026-08-25T10:00:00Z");
  });
});

describe("el caso real que lo motivó", () => {
  it("nueve denuncias de un aviso son UNA tarjeta, y sale la primera", () => {
    // Producción, 1-sep-2026: 13 denuncias sin cerrar, 9 de ellas del mismo
    // aviso de QA. Eran 13 tarjetas; ahora son 5, y la de las nueve arriba.
    const filas = [
      ...Array.from({ length: 9 }, () => denuncia({ listing_id: "qa", listing_title: "[QA] Auto de prueba activo" })),
      denuncia({ listing_id: "gato", listing_title: "Adoptá un lindo gatito" }),
      denuncia({ listing_id: "laptop", listing_title: "Laptop i5 RAM 64Gb" }),
      denuncia({ listing_id: "test", listing_title: "Test" }),
      denuncia({ listing_id: "prog", listing_title: "Se necesita un programador", status: "reviewing" }),
    ];
    const g = agruparPorAviso(filas);
    expect(g).toHaveLength(5);
    expect(g[0].titulo).toBe("[QA] Auto de prueba activo");
    expect(g[0].abiertas).toHaveLength(9);
    // Y el total de denuncias no se pierde por agrupar: el Excel sigue
    // sacando una fila por cada una.
    expect(g.reduce((n, x) => n + x.denuncias.length, 0)).toBe(filas.length);
  });
});
