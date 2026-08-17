// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  LIMITE_POR_DIA,
  LIMITE_POR_HORA,
  VIDA_CACHE_DIAS,
  buscarEnCache,
  evaluarLimite,
  type ConsultaPrevia,
} from "../../supabase/functions/_shared/limite-consultas.ts";

// El tope de consultas a Factiliza. Cada una cuesta dinero y devuelve el nombre
// y el domicilio de cualquier DNI que se escriba: sin límite, una cuenta
// cualquiera servía de buscador de personas pagado por nosotros.

const AHORA = Date.parse("2026-08-17T15:00:00Z");
const haceMinutos = (m: number) => new Date(AHORA - m * 60_000).toISOString();
const haceHoras = (h: number) => haceMinutos(h * 60);
const haceDias = (d: number) => haceHoras(d * 24);

const consulta = (created_at: string, extra: Partial<ConsultaPrevia> = {}): ConsultaPrevia => ({
  doc_type: "dni", doc_number: "44443333", ok: true,
  nombre: "JUAN PEREZ", data: { direccion: "AV. LIMA 123" },
  created_at, ...extra,
});

describe("tope por usuario", () => {
  it("sin historial, adelante", () => {
    const v = evaluarLimite([], AHORA);
    expect(v.permitido).toBe(true);
    expect(v.restantesHora).toBe(LIMITE_POR_HORA);
    expect(v.restantesDia).toBe(LIMITE_POR_DIA);
  });

  it("corta a la sexta consulta de la hora", () => {
    const historial = Array.from({ length: LIMITE_POR_HORA }, (_, i) => consulta(haceMinutos(i * 5)));
    const v = evaluarLimite(historial, AHORA);
    expect(v.permitido).toBe(false);
    expect(v.motivo).toMatch(/espera unos minutos/i);
    expect(v.restantesHora).toBe(0);
  });

  it("pasada la hora, vuelve a haber cupo", () => {
    const historial = Array.from({ length: LIMITE_POR_HORA }, () => consulta(haceHoras(2)));
    expect(evaluarLimite(historial, AHORA).permitido).toBe(true);
  });

  it("el tope del día manda sobre el de la hora", () => {
    // Repartidas a lo largo del día: en ninguna hora hay 5, pero ya van 10.
    const historial = Array.from({ length: LIMITE_POR_DIA }, (_, i) => consulta(haceHoras(i + 1)));
    const v = evaluarLimite(historial, AHORA);
    expect(v.permitido).toBe(false);
    expect(v.motivo).toMatch(/hoy/i);
  });

  it("las consultas de anteayer ya no cuentan", () => {
    const historial = Array.from({ length: 50 }, () => consulta(haceDias(2)));
    expect(evaluarLimite(historial, AHORA).permitido).toBe(true);
  });

  it("las fallidas cuentan igual: son las de quien va probando documentos", () => {
    const historial = Array.from({ length: LIMITE_POR_HORA }, () =>
      consulta(haceMinutos(1), { ok: false, nombre: null, data: null }));
    expect(evaluarLimite(historial, AHORA).permitido).toBe(false);
  });

  it("una fecha ilegible no regala cupo ni lo quita", () => {
    const historial = [consulta("no es una fecha"), consulta(haceMinutos(1))];
    const v = evaluarLimite(historial, AHORA);
    expect(v.permitido).toBe(true);
    expect(v.restantesHora).toBe(LIMITE_POR_HORA - 1);
  });
});

describe("caché", () => {
  it("encuentra lo ya consultado por el mismo usuario", () => {
    const hit = buscarEnCache([consulta(haceDias(3))], "dni", "44443333", AHORA);
    expect(hit?.nombre).toBe("JUAN PEREZ");
  });

  it("no confunde un DNI con un RUC del mismo número", () => {
    const historial = [consulta(haceDias(1), { doc_type: "ruc", doc_number: "20131312955" })];
    expect(buscarEnCache(historial, "dni", "20131312955", AHORA)).toBeNull();
  });

  it("una consulta fallida no se sirve como respuesta", () => {
    const historial = [consulta(haceDias(1), { ok: false, nombre: null })];
    expect(buscarEnCache(historial, "dni", "44443333", AHORA)).toBeNull();
  });

  it("pasados los 30 días se vuelve a preguntar", () => {
    const historial = [consulta(haceDias(VIDA_CACHE_DIAS + 1))];
    expect(buscarEnCache(historial, "dni", "44443333", AHORA)).toBeNull();
  });

  it("con varias, se queda con la más reciente", () => {
    const historial = [
      consulta(haceDias(10), { nombre: "NOMBRE VIEJO" }),
      consulta(haceDias(1), { nombre: "NOMBRE NUEVO" }),
    ];
    expect(buscarEnCache(historial, "dni", "44443333", AHORA)?.nombre).toBe("NOMBRE NUEVO");
  });

  it("una fila sin nombre no vale como caché aunque esté marcada ok", () => {
    // Es lo que deja `purge_doc_lookups` al olvidar los datos personales: la
    // fila sigue contando para el tope, pero ya no puede responder.
    const historial = [consulta(haceDias(1), { nombre: null, data: null })];
    expect(buscarEnCache(historial, "dni", "44443333", AHORA)).toBeNull();
  });
});
