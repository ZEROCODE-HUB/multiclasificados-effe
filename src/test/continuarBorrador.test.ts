import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Retomar un borrador para terminarlo: `?continuar=<id>`.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * Los adicionales se contratan ANTES de subir el archivo: eliges «3 vídeos» y
 * luego los subes. Así que se puede guardar un borrador que ya contrató tres
 * vídeos y no tiene ninguno. Al pulsar Publicar saltaba «te falta subir lo que
 * contrataste»… y el modal de editar solo tiene título, precio y descripción.
 * El aviso quedaba **imposible de publicar y de arreglar a la vez**.
 *
 * POR QUÉ NO SE REUTILIZÓ `cargarAvisoParaCopiar`
 *
 * Hace algo parecido pero para lo contrario: **descarga** los archivos para
 * crear un aviso nuevo con copias. Aquí el aviso es el mismo y sus archivos ya
 * están en su sitio. Traérselos al navegador para volver a subirlos idénticos
 * son 46 MB de bajada y otros 46 de subida con tres vídeos — en datos móviles
 * eso se paga. Lo que se devuelven son referencias a lo ya subido.
 */
const respuesta = { data: null as unknown, error: null as unknown };

const consulta = {
  select: (_c: string) => consulta,
  eq: (_c: string, _v: unknown) => consulta,
  maybeSingle: () => Promise.resolve(respuesta),
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => consulta,
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  },
}));

import { cargarAvisoParaContinuar } from "@/lib/publish";

const AVISO = {
  status: "draft",
  title: "Toyota Corolla",
  description: "Full equipo",
  price: 45000,
  currency: "PEN",
  condition: "usado",
  category_id: "vehiculos",
  department: "La Libertad",
  location: "Trujillo",
  lat: -8.1,
  lng: -79.02,
  country: "PE",
  plan_duration_days: 30,
  plan_quantity: 1,
  plan_extras: { video20: 3, pdf500: 1 },
  document_url: "u1/L1/doc.pdf",
  listing_images: [
    { url: "https://x/2.webp", storage_path: "u1/L1/2.webp", sort_order: 2 },
    { url: "https://x/0.webp", storage_path: "u1/L1/0.webp", sort_order: 0 },
    { url: "https://x/1.webp", storage_path: "u1/L1/1.webp", sort_order: 1 },
  ],
  listing_videos: [
    { url: "https://x/v1.mp4", storage_path: "u1/L1/v1.mp4", sort_order: 1 },
    { url: "https://x/v0.mp4", storage_path: "u1/L1/v0.mp4", sort_order: 0 },
  ],
};

beforeEach(() => { respuesta.data = AVISO; respuesta.error = null; });

describe("trae el aviso tal como está", () => {
  it("los datos del formulario, con su categoría y su país", async () => {
    const b = await cargarAvisoParaContinuar("L1");
    expect(b.form.title).toBe("Toyota Corolla");
    expect(b.form.category).toBe("vehiculos");
    expect(b.form.price).toBe("45000");
    expect(b.form.country).toBe("PE");
    expect(b.lat).toBe(-8.1);
  });

  it("y LOS ADICIONALES CONTRATADOS, que es de lo que va todo esto", async () => {
    // Sin esto el formulario abriría sin los vídeos contratados, no pediría
    // subirlos, y al publicar volvería a saltar el mismo aviso.
    const b = await cargarAvisoParaContinuar("L1");
    expect(b.extras).toEqual({ video20: 3, pdf500: 1 });
    expect(b.duration).toBe(30);
  });
});

describe("los adjuntos vienen como referencias, no como archivos", () => {
  it("no se descarga nada: solo la ruta y la URL de cada uno", async () => {
    const b = await cargarAvisoParaContinuar("L1");
    expect(b.mainPhoto?.subido.path).toBe("u1/L1/0.webp");
    expect(b.extraPhotos.map((f) => f.subido.path)).toEqual(["u1/L1/1.webp", "u1/L1/2.webp"]);
  });

  it("respeta el orden guardado, no el que devuelva la base", async () => {
    // La consulta las trae desordenadas a propósito en este caso: si no se
    // ordenara por `sort_order`, la portada del aviso cambiaría sola al
    // retomarlo.
    const b = await cargarAvisoParaContinuar("L1");
    expect(b.mainPhoto?.subido.url).toBe("https://x/0.webp");
    expect(b.videos.map((v) => v.subido.path)).toEqual(["u1/L1/v0.mp4", "u1/L1/v1.mp4"]);
  });

  it("trae los VÍDEOS, que es lo que no hacía la carga para copiar", async () => {
    const b = await cargarAvisoParaContinuar("L1");
    expect(b.videos).toHaveLength(2);
  });

  it("el PDF llega como ruta, sin URL: su bucket es privado", async () => {
    // `document_url` guarda la RUTA, no una URL. Enseñarlo exige firmar un
    // enlace temporal aparte; darlo por bueno como URL da un enlace roto.
    const b = await cargarAvisoParaContinuar("L1");
    expect(b.pdf?.subido.path).toBe("u1/L1/doc.pdf");
    expect(b.pdf?.subido.url).toBe("");
  });
});

describe("casos que no pueden romper la pantalla", () => {
  it("un aviso sin adjuntos: todo vacío, nada de nulos sueltos", async () => {
    respuesta.data = { ...AVISO, listing_images: [], listing_videos: [], document_url: null };
    const b = await cargarAvisoParaContinuar("L1");
    expect(b.mainPhoto).toBeNull();
    expect(b.extraPhotos).toEqual([]);
    expect(b.videos).toEqual([]);
    expect(b.pdf).toBeNull();
  });

  it("filas sin ruta se descartan en vez de colarse a medias", async () => {
    respuesta.data = {
      ...AVISO,
      listing_images: [{ url: "https://x/rota.webp", sort_order: 0 }],
      listing_videos: [],
    };
    const b = await cargarAvisoParaContinuar("L1");
    expect(b.mainPhoto).toBeNull();
  });

  it("un aviso YA PUBLICADO se rechaza al abrirlo, no al final", async () => {
    // La base ya impide cobrarlo dos veces (publish_listing solo actúa sobre
    // draft/pending y el cobro va en su transacción). Lo que evita este corte
    // son dos cosas desconcertantes para quien escriba la URL a mano: que al
    // publicar se le diga «se descontó tu saldo» siendo falso, y que al guardar
    // los cambios se pierdan en silencio porque el update filtra por draft.
    respuesta.data = { ...AVISO, status: "active" };
    await expect(cargarAvisoParaContinuar("L1")).rejects.toThrow(/ya no es un borrador/i);
  });

  it("y un vencido tampoco: ese se republica, no se continúa", async () => {
    respuesta.data = { ...AVISO, status: "expired" };
    await expect(cargarAvisoParaContinuar("L1")).rejects.toThrow(/ya no es un borrador/i);
  });

  it("un aviso que no existe da un error que se entiende", async () => {
    respuesta.data = null;
    await expect(cargarAvisoParaContinuar("L1")).rejects.toThrow(/no se pudo cargar/i);
  });

  it("sin plan guardado cae a valores usables, no a NaN", async () => {
    respuesta.data = { ...AVISO, plan_duration_days: null, plan_quantity: null, plan_extras: null };
    const b = await cargarAvisoParaContinuar("L1");
    expect(b.duration).toBe(7);
    expect(b.quantity).toBe(1);
    expect(b.extras).toEqual({});
  });
});
