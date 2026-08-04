import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
// CategoryGrid navega con <Link> (y no <a href>) para no recargar la app dentro
// del WebView, así que necesita un router alrededor.
import { MemoryRouter } from "react-router-dom";

// La foto de cada categoría dejó de estar hardcodeada en CategoryGrid: ahora la
// sube el staff y vive en `categories.image_url`. Estos tests fijan el contrato:
// la portada nunca se queda sin imagen, la URL del bucket se pide recortada (y
// sin romperse), y reemplazar una foto borra la anterior.

const SUPA_URL = "https://proj.supabase.co/storage/v1/object/public/category-images/inmuebles/cover-1.webp";

let selectResult: { data: unknown; error: unknown } = { data: [], error: null };
let uploadError: unknown = null;
const uploadCalls: Array<{ path: string; options: Record<string, unknown> }> = [];
const removeCalls: string[][] = [];

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => {
        const chain: Record<string, unknown> = {};
        chain.eq = () => chain;
        chain.order = () => chain;
        chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(selectResult).then(resolve, reject);
        return chain;
      },
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    storage: {
      from: () => ({
        upload: (path: string, _file: File, options: Record<string, unknown>) => {
          uploadCalls.push({ path, options });
          return Promise.resolve({ error: uploadError });
        },
        remove: (paths: string[]) => {
          removeCalls.push(paths);
          return Promise.resolve({ error: null });
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/category-images/${path}` },
        }),
      }),
    },
  },
}));

// jsdom no tiene createImageBitmap: sin este mock compressImage devolvería el
// original y la extensión del archivo dependería del test, no del contrato.
vi.mock("@/lib/compressImage", () => ({
  compressImage: (f: File) => Promise.resolve(new File([f], "x.webp", { type: "image/webp" })),
}));

vi.mock("@/lib/stats", () => ({ fetchCategoryCounts: () => Promise.resolve({}) }));

import { CategoryGrid } from "@/components/CategoryGrid";
import { uploadCategoryImage } from "@/lib/admin";
import { loadCategories, resetCategoriesCache } from "@/lib/categories";

beforeEach(() => {
  resetCategoriesCache();
  localStorage.clear();
  uploadCalls.length = 0;
  removeCalls.length = 0;
  uploadError = null;
});

describe("lib/categories — imagen de portada", () => {
  it("mapea image_url de la BD a imageUrl", async () => {
    selectResult = { data: [{ id: "inmuebles", name: "Inmuebles", icon: "Home", image_url: SUPA_URL }], error: null };
    const cats = await loadCategories();
    expect(cats[0].imageUrl).toBe(SUPA_URL);
  });

  it("una fila sin imagen queda con imageUrl null (la portada pone una de reserva)", async () => {
    selectResult = { data: [{ id: "nueva", name: "Nueva", icon: "Tag" }], error: null };
    const cats = await loadCategories();
    expect(cats[0].imageUrl).toBeNull();
  });
});

describe("CategoryGrid — ninguna tarjeta se queda sin foto", () => {
  it("pinta una imagen por categoría aunque ninguna tenga imagen propia", async () => {
    selectResult = {
      data: [
        { id: "nueva-a", name: "Nueva A", icon: "Tag" },
        { id: "nueva-b", name: "Nueva B", icon: "Tag" },
      ],
      error: null,
    };
    render(<MemoryRouter><CategoryGrid /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getAllByRole("img")).toHaveLength(2);
    });
    screen.getAllByRole("img").forEach((img) => {
      expect(img.getAttribute("src")).toMatch(/^https:\/\//);
    });
    // El número de orden ("01", "02"…) se quitó: era ruido para el visitante (IT3-011).
    expect(screen.queryByText("01")).toBeNull();
  });

  it("una imagen del bucket se pide recortada y sin doble '?'", async () => {
    selectResult = { data: [{ id: "inmuebles", name: "Inmuebles", icon: "Home", image_url: SUPA_URL }], error: null };
    render(<MemoryRouter><CategoryGrid /></MemoryRouter>);
    const img = await screen.findByAltText("Inmuebles");
    const src = img.getAttribute("src")!;
    expect(src).toContain("/storage/v1/render/image/public/");
    expect(src).toContain("resize=cover");
    expect(src.match(/\?/g)).toHaveLength(1);
    // Cinco escalones afinados para el LCP; el de 200 es para densidad 1 (IT3-006).
    const escalones = img.getAttribute("srcset")!.split(",");
    expect(escalones).toHaveLength(5);
    expect(img.getAttribute("srcset")).toContain("width=200");
    // La compresión de estas tarjetas es más agresiva que la de un aviso.
    escalones.forEach((e) => expect(e).toContain("quality=65"));
  });
});

describe("uploadCategoryImage", () => {
  it("sube con nombre único bajo la carpeta de la categoría", async () => {
    const url = await uploadCategoryImage("inmuebles", new File(["x"], "foto.jpg", { type: "image/jpeg" }));
    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0].path).toMatch(/^inmuebles\/cover-\d+\.webp$/);
    expect(uploadCalls[0].options).toMatchObject({ upsert: true });
    expect(url).toContain("/category-images/inmuebles/cover-");
    expect(url).not.toContain("?");
  });

  it("borra la imagen anterior si era del bucket", async () => {
    await uploadCategoryImage("inmuebles", new File(["x"], "foto.jpg", { type: "image/jpeg" }), SUPA_URL);
    expect(removeCalls).toEqual([["inmuebles/cover-1.webp"]]);
  });

  it("no intenta borrar nada si la anterior era una URL externa", async () => {
    await uploadCategoryImage("inmuebles", new File(["x"], "foto.jpg", { type: "image/jpeg" }),
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800");
    expect(removeCalls).toHaveLength(0);
  });

  it("propaga el error si Storage rechaza la subida (RLS)", async () => {
    uploadError = { message: "new row violates row-level security policy" };
    await expect(
      uploadCategoryImage("inmuebles", new File(["x"], "foto.jpg", { type: "image/jpeg" })),
    ).rejects.toMatchObject({ message: "new row violates row-level security policy" });
  });
});
