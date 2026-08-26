import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Editar un aviso YA PUBLICADO.
 *
 * Lo que se fija aquí no es que guarde —eso es lo fácil— sino **lo que NO puede
 * tocar**. Editar y comprar son cosas distintas, y aquí se rozan:
 *
 *   · Si desde editar se pudiera cambiar la duración, editar sería una forma de
 *     alargar la vigencia gratis.
 *   · Si se pudieran cambiar los adicionales, sería contratarlos gratis. Y a la
 *     inversa: bajar de tres vídeos a uno no devuelve dinero, así que
 *     reescribirlo tampoco tiene sentido.
 *   · Si se pudiera tocar el estado o la fecha de vencimiento, un aviso vencido
 *     resucitaría por la puerta de atrás.
 *   · La categoría cambia el orden en el buscador y las promociones que le
 *     aplican. Lo que se compró como "Vehículos" se queda ahí.
 */
const llamadas = {
  update: null as Record<string, unknown> | null,
  filtros: [] as Array<{ metodo: string; col?: string; valor?: unknown }>,
  fila: { id: "L1" } as unknown,
};

const consulta = {
  update: (v: Record<string, unknown>) => { llamadas.update = v; return consulta; },
  eq: (col: string, valor: unknown) => { llamadas.filtros.push({ metodo: "eq", col, valor }); return consulta; },
  in: (col: string, valor: unknown) => { llamadas.filtros.push({ metodo: "in", col, valor }); return consulta; },
  select: () => consulta,
  maybeSingle: () => Promise.resolve({ data: llamadas.fila, error: null }),
  delete: () => consulta,
  insert: () => Promise.resolve({ error: null }),
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => consulta,
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    storage: { from: () => ({
      upload: async () => ({ error: null }),
      getPublicUrl: () => ({ data: { publicUrl: "https://x/f.webp" } }),
    }) },
  },
}));
vi.mock("@/lib/compressImage", () => ({ compressImage: async (f: File) => f }));

import { guardarCambiosDeAviso } from "@/lib/publish";

const ENTRADA = {
  form: {
    category: "inmuebles", title: "Casa nueva", description: "Bonita",
    price: "1000", currency: "PEN", department: "Lima", location: "Miraflores",
    condition: "usado", country: "PE",
  },
  lat: -12.1, lng: -77.0,
  quantity: 1, duration: 90,
  extras: { video20: 3 },
  mainPhoto: null, extraPhotos: [], pdf: null, videos: [],
} as never;

beforeEach(() => {
  llamadas.update = null;
  llamadas.filtros = [];
  llamadas.fila = { id: "L1" };
});

describe("lo que SÍ actualiza", () => {
  it("los campos que el anunciante puede corregir", async () => {
    await guardarCambiosDeAviso("L1", ENTRADA);
    expect(llamadas.update).toMatchObject({
      title: "Casa nueva",
      description: "Bonita",
      price: 1000,
      currency: "PEN",
      condition: "usado",
      location: "Miraflores",
      lat: -12.1,
      lng: -77.0,
    });
  });
});

describe("lo que NO puede tocar, que es de lo que va esto", () => {
  it("la DURACIÓN: cambiarla desde aquí sería alargar la vigencia gratis", async () => {
    await guardarCambiosDeAviso("L1", ENTRADA);
    expect(llamadas.update).not.toHaveProperty("plan_duration_days");
    expect(llamadas.update).not.toHaveProperty("expires_at");
  });

  it("los ADICIONALES: sería contratarlos sin pagarlos", async () => {
    await guardarCambiosDeAviso("L1", ENTRADA);
    expect(llamadas.update).not.toHaveProperty("plan_extras");
    expect(llamadas.update).not.toHaveProperty("plan_quantity");
  });

  it("el ESTADO: un aviso no se resucita editándolo", async () => {
    await guardarCambiosDeAviso("L1", ENTRADA);
    expect(llamadas.update).not.toHaveProperty("status");
    expect(llamadas.update).not.toHaveProperty("published_at");
  });

  it("la CATEGORÍA: mueve el aviso de sitio y le cambia las promociones", async () => {
    await guardarCambiosDeAviso("L1", ENTRADA);
    expect(llamadas.update).not.toHaveProperty("category_id");
  });

  it("ni el dueño, claro", async () => {
    await guardarCambiosDeAviso("L1", ENTRADA);
    expect(llamadas.update).not.toHaveProperty("owner_id");
  });
});

describe("sobre qué avisos actúa", () => {
  it("solo sobre los suyos, y solo si están activos o pausados", async () => {
    await guardarCambiosDeAviso("L1", ENTRADA);
    expect(llamadas.filtros).toContainEqual({ metodo: "eq", col: "id", valor: "L1" });
    expect(llamadas.filtros).toContainEqual({ metodo: "eq", col: "owner_id", valor: "u1" });
    expect(llamadas.filtros).toContainEqual({ metodo: "in", col: "status", valor: ["active", "paused"] });
  });

  it("el filtro va en el UPDATE, no en una comprobación previa", async () => {
    // Entre comprobar el estado y escribir, el aviso puede haber vencido. Si el
    // filtro no viajara con la escritura, esto lo estaría resucitando.
    await guardarCambiosDeAviso("L1", ENTRADA);
    const orden = llamadas.filtros.map((f) => f.col);
    expect(orden).toContain("status");
    expect(llamadas.update).not.toBeNull();
  });

  it("si no tocó ninguna fila lo DICE, en vez de fingir que guardó", async () => {
    // Sin esto el usuario vería "guardado" tras un update que no cambió nada:
    // los cambios se perderían en silencio, que es lo peor que puede pasar.
    llamadas.fila = null;
    await expect(guardarCambiosDeAviso("L1", ENTRADA)).rejects.toThrow(/ya no está activo o no es tuyo/i);
  });

  it("sin título no llega ni a preguntar a la base", async () => {
    await expect(
      guardarCambiosDeAviso("L1", { ...(ENTRADA as object), form: { ...(ENTRADA as never as { form: object }).form, title: "  " } } as never),
    ).rejects.toThrow(/título/i);
    expect(llamadas.update).toBeNull();
  });
});
