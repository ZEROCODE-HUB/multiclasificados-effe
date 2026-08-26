import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Que los comprobantes que se quedaron a medias salten a la vista.
 *
 * El panel comercial ya enseñaba el estado de cada uno, el motivo del rechazo y
 * hasta un botón de reintentar. Lo que faltaba es que alguien supiera que tiene
 * que ir a mirar: con veinte por página, un rechazo de hace tres semanas está en
 * la página 4. Y una boleta que SUNAT rechazó y nadie mira es un problema
 * tributario esperando a que el cliente reclame.
 *
 * Lo que más importa fijar aquí: que el CONTADOR y la LISTA usen exactamente la
 * misma condición. Si el aviso dice "3" y al pulsarlo salen 5, es la forma más
 * rápida de que nadie vuelva a hacerle caso al aviso.
 */
const consulta = {
  filtros: [] as Array<{ metodo: string; arg: unknown }>,
  count: 0,
  autenticado: true,
};

const constructor = () => {
  const api = {
    select: (_c: string, _o?: unknown) => api,
    is: (col: string, v: unknown) => { consulta.filtros.push({ metodo: `is:${col}`, arg: v }); return api; },
    or: (expr: string) => { consulta.filtros.push({ metodo: "or", arg: expr }); return api; },
    eq: (col: string, v: unknown) => { consulta.filtros.push({ metodo: `eq:${col}`, arg: v }); return api; },
    gte: () => api, lt: () => api, order: () => api, range: () => api,
    then: (res: (v: unknown) => unknown) =>
      res({ data: [], count: consulta.count, error: null }),
  };
  return api;
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => constructor(),
    auth: {
      // `isAuthed` usa getUser(), no getSession(): con el mock equivocado las
      // consultas ni se lanzaban y las pruebas median el vacio.
      getUser: async () => ({ data: { user: consulta.autenticado ? { id: "u1" } : null } }),
      getSession: async () =>
        ({ data: { session: consulta.autenticado ? { user: { id: "u1" } } : null } }),
    },
  },
}));

import { contarComprobantesConProblema, fetchAllInvoices } from "@/lib/admin";

const condicionDe = (fs: typeof consulta.filtros) =>
  fs.find((f) => f.metodo === "or")?.arg as string | undefined;

beforeEach(() => { consulta.filtros = []; consulta.count = 0; consulta.autenticado = true; });

describe("el contador del panel", () => {
  it("cuenta los que SUNAT rechazó, los que no salieron por correo y los marcados", async () => {
    await contarComprobantesConProblema();
    const cond = condicionDe(consulta.filtros) ?? "";
    expect(cond).toContain("sunat_status.in.(rechazado,error,vencido)");
    expect(cond).toContain("email_status.eq.error");
    expect(cond).toContain("needs_review.eq.true");
  });

  it("no cuenta los anulados: ya se resolvieron por otra vía", async () => {
    // Un anulado pudo tener una emisión fallida, pero no hay nada que
    // reintentar. Contarlo sería mandar al administrador a mirar algo cerrado.
    await contarComprobantesConProblema();
    expect(consulta.filtros).toContainEqual({ metodo: "is:anulado_at", arg: null });
  });

  it("devuelve el número que dice la base", async () => {
    consulta.count = 7;
    expect(await contarComprobantesConProblema()).toBe(7);
  });

  it("sin sesión no pregunta nada y devuelve 0", async () => {
    consulta.autenticado = false;
    expect(await contarComprobantesConProblema()).toBe(0);
    expect(consulta.filtros).toHaveLength(0);
  });

  it("si la consulta falla devuelve 0, no rompe la pantalla de inicio", async () => {
    // Es un aviso. Un aviso que tumba el panel del administrador sería mucho
    // peor que no tener aviso.
    consulta.count = 0;
    await expect(contarComprobantesConProblema()).resolves.toBe(0);
  });
});

describe("el filtro de la lista usa la MISMA condición", () => {
  it("carácter por carácter, para que el número del aviso cuadre con lo que sale", async () => {
    await contarComprobantesConProblema();
    const delContador = condicionDe(consulta.filtros);

    consulta.filtros = [];
    await fetchAllInvoices({ soloAtencion: true });
    const deLaLista = condicionDe(consulta.filtros);

    expect(deLaLista).toBe(delContador);
    expect(deLaLista).toBeTruthy();
  });

  it("y también descarta los anulados", async () => {
    await fetchAllInvoices({ soloAtencion: true });
    expect(consulta.filtros).toContainEqual({ metodo: "is:anulado_at", arg: null });
  });

  it("sin pedirlo, la lista no filtra por eso", async () => {
    await fetchAllInvoices({});
    expect(condicionDe(consulta.filtros)).toBeUndefined();
  });
});
