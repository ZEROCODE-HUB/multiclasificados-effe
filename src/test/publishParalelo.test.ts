import { describe, it, expect, vi, beforeEach } from "vitest";

// La publicación tardaba porque el cliente encadenaba viajes al servidor: dos
// por foto (subida + fila), uno detrás de otro, y tres `getUser()` que preguntan
// al servidor lo que ya está en el token. Estas pruebas fijan lo contrario.

const uploads: string[] = [];
const inserts: unknown[][] = [];
let enVuelo = 0;
let maxEnVuelo = 0;

const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } });
const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } } });

const upload = vi.fn(async (path: string, _file?: unknown, _opts?: unknown) => {
  enVuelo++;
  maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
  await new Promise((r) => setTimeout(r, 10));
  enVuelo--;
  uploads.push(path);
  return { error: null };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => getUser(...a), getSession: (...a: unknown[]) => getSession(...a) },
    storage: {
      from: () => ({
        upload: (path: string, file: unknown, opts: unknown) => upload(path, file, opts),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }),
      }),
    },
    from: (tabla: string) => ({
      insert: (filas: unknown) => {
        if (tabla === "listing_images") inserts.push(Array.isArray(filas) ? filas : [filas]);
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

// La compresión real usa canvas: en jsdom no existe, y aquí no es lo que se prueba.
vi.mock("@/lib/compressImage", () => ({ compressImage: async (f: File) => f }));

import { saveListingDraft, faltanteDelError } from "@/lib/publish";

const foto = (n: string) => ({ file: new File(["x"], n, { type: "image/webp" }), name: n, comprimida: true });

const draft = () => ({
  form: {
    category: "inmuebles", title: "Casa", description: "d", price: "1",
    currency: "PEN", department: "15", location: "Lima", condition: "nuevo",
  },
  quantity: 1, duration: 7, extras: {},
  mainPhoto: foto("portada.webp"),
  extraPhotos: [foto("a.webp"), foto("b.webp"), foto("c.webp")],
});

beforeEach(() => {
  uploads.length = 0; inserts.length = 0; enVuelo = 0; maxEnVuelo = 0;
  getUser.mockClear(); getSession.mockClear(); upload.mockClear();
});

describe("guardar el aviso no encadena viajes al servidor", () => {
  it("sube las 4 fotos a la vez, no una detrás de otra", async () => {
    await saveListingDraft(draft());
    expect(uploads).toHaveLength(4);
    expect(maxEnVuelo).toBeGreaterThan(1);
  });

  it("las filas de imágenes van en un solo insert", async () => {
    await saveListingDraft(draft());
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toHaveLength(4);
  });

  it("no pregunta al servidor quién es el usuario: lee la sesión local", async () => {
    await saveListingDraft(draft());
    expect(getSession).toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("avisa del progreso para poder decir 'subiendo 2 de 4'", async () => {
    const pasos: number[] = [];
    await saveListingDraft(draft(), (hechas) => pasos.push(hechas));
    expect(pasos.sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("faltanteDelError", () => {
  it("saca del error de la base cuánto falta, para poder decirlo", () => {
    expect(faltanteDelError("Saldo insuficiente: se necesitan 16.14 créditos y hay 10")).toEqual({
      costo: 16.14, faltan: 6.14,
    });
  });

  it("si el mensaje no trae cifras, no inventa ninguna", () => {
    expect(faltanteDelError("otra cosa")).toBeNull();
  });
});
