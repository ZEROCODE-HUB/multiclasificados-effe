import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * REPUBLICAR TIENE QUE TRAERSE LOS VÍDEOS.
 *
 * LO QUE REPORTÓ EL CLIENTE: al republicar, "me pidió poner una imagen adicional
 * o video, y creo que no lo trajo".
 *
 * Y era verdad: `cargarAvisoParaCopiar` leía `listing_images` y el PDF, pero NO
 * `listing_videos`. La copia llegaba con el paquete contratado —"3 videos", que
 * es lo que ya se pagó— y ningún vídeo detrás, así que al publicar saltaba
 * "Contrataste 3 videos y subiste 0. Sube 3 videos más o baja la cantidad".
 *
 * CÓMO SE COPIAN, que es la otra mitad. No bajándolos al navegador para volver a
 * subirlos: tres vídeos son 45 MB de bajada más otros 45 de subida, y en datos
 * móviles eso se paga. Storage los duplica en el servidor.
 *
 * Y CADA AVISO CON SU ARCHIVO. No se apunta la fila nueva al fichero del
 * original —que es lo que hace `subido`—, porque el día que se borre el aviso
 * original `limpiar-adjuntos` se lleva el fichero y la copia se queda sin vídeo.
 */

const uploads: string[] = [];
const copias: Array<{ de: string; a: string }> = [];
const videosInsertados: Record<string, unknown>[][] = [];
let fallaLaCopia = false;

const upload = vi.fn(async (path: string, _file?: unknown, _opts?: unknown) => {
  uploads.push(path);
  return { error: null };
});
const copy = vi.fn(async (de: string, a: string) => {
  if (fallaLaCopia) return { error: { message: "no se pudo copiar" } };
  copias.push({ de, a });
  return { error: null };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } } }),
    },
    storage: {
      from: () => ({
        upload: (path: string, file: unknown, opts: unknown) => upload(path, file, opts),
        copy: (de: string, a: string) => copy(de, a),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }),
      }),
    },
    from: (tabla: string) => ({
      insert: (filas: unknown) => {
        if (tabla === "listing_videos") videosInsertados.push(filas as Record<string, unknown>[]);
        return {
          select: () => ({ single: async () => ({ data: { id: "L1" }, error: null }) }),
          then: (res: (v: unknown) => unknown) => res({ error: null }),
        };
      },
      update: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }), then: (r: (v: unknown) => unknown) => r({ error: null }) }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    rpc: async () => ({ error: null }),
  },
}));

vi.mock("@/lib/compressImage", () => ({ compressImage: async (f: File) => f }));

import { saveListingDraft } from "@/lib/publish";

/** Un vídeo tal como lo devuelve la copia: sin archivo, con ruta de origen. */
const videoCopiado = (i: number) => ({
  file: new File([], `video-${i}.mp4`),
  name: `video-${i}.mp4`,
  copiarDe: `u1/AVISO-ORIGINAL/${i - 1}-video.mp4`,
  urlOrigen: `https://cdn/u1/AVISO-ORIGINAL/${i - 1}-video.mp4`,
});

const guardar = (videos: ReturnType<typeof videoCopiado>[]) =>
  saveListingDraft({
    form: {
      category: "inmuebles", title: "Casa", description: "d",
      price: "100", currency: "PEN", department: "15", location: "Lima", condition: "usado",
    },
    quantity: 1, duration: 7, extras: { video20: videos.length },
    mainPhoto: null, extraPhotos: [], videos,
  });

beforeEach(() => {
  uploads.length = 0;
  copias.length = 0;
  videosInsertados.length = 0;
  fallaLaCopia = false;
  upload.mockClear();
  copy.mockClear();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true, blob: async () => new Blob(["video"], { type: "video/mp4" }),
  }) as unknown as typeof fetch;
});

describe("el vídeo se copia en el servidor", () => {
  it("no se sube ningún archivo: se copia de la ruta original", async () => {
    await guardar([videoCopiado(1), videoCopiado(2)]);

    expect(copias).toHaveLength(2);
    expect(copias[0].de).toBe("u1/AVISO-ORIGINAL/0-video.mp4");
    // NADA de subir: es lo que evita los 45 MB de ida y otros 45 de vuelta.
    expect(uploads).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("el destino es una ruta NUEVA, bajo el aviso nuevo", async () => {
    // Y no la del original: si se compartiera el fichero, borrar el aviso
    // original dejaría la copia sin vídeo (`limpiar-adjuntos` lo borra en
    // cuanto su aviso deja de existir).
    await guardar([videoCopiado(1)]);
    expect(copias[0].a).toContain("u1/L1/");
    expect(copias[0].a).not.toContain("AVISO-ORIGINAL");
  });

  it("la fila apunta al archivo nuevo, no al del original", async () => {
    await guardar([videoCopiado(1)]);
    const fila = videosInsertados[0][0] as { storage_path: string; sort_order: number };
    expect(fila.storage_path).toContain("u1/L1/");
    expect(fila.storage_path).not.toContain("AVISO-ORIGINAL");
    expect(fila.sort_order).toBe(0);
  });

  it("se conserva el orden de los vídeos", async () => {
    await guardar([videoCopiado(1), videoCopiado(2), videoCopiado(3)]);
    const filas = videosInsertados[0] as Array<{ sort_order: number }>;
    expect(filas.map((f) => f.sort_order)).toEqual([0, 1, 2]);
  });
});

describe("si la copia en el servidor falla", () => {
  it("lo baja y lo sube, en vez de perder el vídeo en silencio", async () => {
    // Perderlo devolvería al usuario exactamente al fallo que esto arregla:
    // "contrataste 3 videos y subiste 0" al pulsar publicar.
    fallaLaCopia = true;
    await guardar([videoCopiado(1)]);

    expect(global.fetch).toHaveBeenCalledWith("https://cdn/u1/AVISO-ORIGINAL/0-video.mp4");
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toContain("u1/L1/");
    expect(videosInsertados[0]).toHaveLength(1);
  });

  it("y si tampoco se puede bajar, no inserta una fila rota", async () => {
    fallaLaCopia = true;
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    await guardar([videoCopiado(1)]);
    // Sin filas válidas no se inserta nada: una fila apuntando a un archivo que
    // no existe deja el aviso con un reproductor roto.
    expect(videosInsertados).toHaveLength(0);
  });
});

describe("lo que ya funcionaba sigue igual", () => {
  it("un vídeo subido mientras se rellenaba el formulario NO se copia ni se sube", async () => {
    // Es la subida anticipada: el archivo ya está en su sitio definitivo.
    await saveListingDraft({
      form: {
        category: "inmuebles", title: "Casa", description: "d",
        price: "100", currency: "PEN", department: "15", location: "Lima", condition: "usado",
      },
      quantity: 1, duration: 7, extras: { video20: 1 },
      mainPhoto: null, extraPhotos: [],
      videos: [{
        file: new File([], "v.mp4"), name: "v.mp4",
        subido: { path: "u1/L1/0-v.mp4", url: "https://cdn/u1/L1/0-v.mp4" },
      }],
    });
    expect(copias).toHaveLength(0);
    expect(uploads).toHaveLength(0);
    const fila = videosInsertados[0][0] as { storage_path: string };
    expect(fila.storage_path).toBe("u1/L1/0-v.mp4");
  });

  it("un vídeo recién elegido se sube normal", async () => {
    await saveListingDraft({
      form: {
        category: "inmuebles", title: "Casa", description: "d",
        price: "100", currency: "PEN", department: "15", location: "Lima", condition: "usado",
      },
      quantity: 1, duration: 7, extras: { video20: 1 },
      mainPhoto: null, extraPhotos: [],
      videos: [{ file: new File(["x"], "nuevo.mp4", { type: "video/mp4" }), name: "nuevo.mp4" }],
    });
    expect(copias).toHaveLength(0);
    expect(uploads).toHaveLength(1);
  });

  it("sin vídeos no se toca nada", async () => {
    await guardar([]);
    expect(copias).toHaveLength(0);
    expect(uploads).toHaveLength(0);
    expect(videosInsertados).toHaveLength(0);
  });
});
