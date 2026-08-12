// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * La vista previa del enlace de un aviso (WhatsApp, Facebook, Telegram…).
 *
 * WhatsApp NO ejecuta JavaScript: solo lee las etiquetas <meta> del HTML que le
 * devuelve el servidor. Como la app es una SPA, ese HTML era el mismo para todo,
 * así que cualquier aviso compartido enseñaba la misma tarjeta genérica — y
 * encima con una captura heredada de Lovable en un bucket ajeno.
 */

process.env.VITE_SUPABASE_URL = "https://proyecto.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY = "anon-de-prueba";

const { default: handler } = await import("../../api/og-aviso.ts");

const INDEX = fs.readFileSync(path.resolve(__dirname, "../../index.html"), "utf8");

const ID = "01e6d187-aa3f-448d-802f-a69c17900d0c";
const AVISO = {
  title: "Rodillo Cat de 11 TN",
  description: "Máquina en buen estado, mantenimiento al día.   Con papeles en regla.",
  price: 45000,
  currency: "PEN",
  location: "Guadalupe",
  image_url: "https://cdn.effe.pe/fotos/rodillo.webp",
  status: "active",
};

let aviso: unknown[] = [AVISO];
let supabaseFalla = false;

beforeEach(() => {
  aviso = [AVISO];
  supabaseFalla = false;
  vi.stubGlobal("fetch", async (entrada: URL | string) => {
    const url = String(entrada);
    if (url.includes("/index.html")) return new Response(INDEX, { status: 200 });
    if (supabaseFalla) throw new Error("sin red");
    return new Response(JSON.stringify(aviso), { status: 200 });
  });
});

const pedir = async (id = ID) => {
  const res = await handler(new Request(`https://www.coleffe.com/api/og-aviso?id=${id}`));
  return { res, html: await res.text() };
};

const meta = (html: string, atributo: string, clave: string) =>
  html.match(new RegExp(`<meta\\s+${atributo}=["']${clave}["']\\s+content=["']([^"']*)["']`, "i"))?.[1];

describe("vista previa del aviso compartido", () => {
  it("pone la FOTO del aviso, que es lo que se ve en WhatsApp", async () => {
    const { html } = await pedir();
    expect(meta(html, "property", "og:image")).toBe(AVISO.image_url);
    expect(meta(html, "name", "twitter:image")).toBe(AVISO.image_url);
  });

  it("pone el título con su precio y su ubicación", async () => {
    const { html } = await pedir();
    expect(meta(html, "property", "og:title")).toBe("Rodillo Cat de 11 TN — S/ 45,000 · Guadalupe");
  });

  it("los dólares se muestran como US$", async () => {
    aviso = [{ ...AVISO, currency: "USD" }];
    const { html } = await pedir();
    expect(meta(html, "property", "og:title")).toContain("US$ 45,000");
  });

  it("la descripción se resume y se le quitan los espacios de más", async () => {
    const { html } = await pedir();
    const d = meta(html, "property", "og:description")!;
    expect(d).toBe("Máquina en buen estado, mantenimiento al día. Con papeles en regla.");
  });

  it("una descripción larga se corta sin partir una palabra", async () => {
    aviso = [{ ...AVISO, description: "palabra ".repeat(60) }];
    const { html } = await pedir();
    const d = meta(html, "property", "og:description")!;
    expect(d.length).toBeLessThanOrEqual(201);
    expect(d.endsWith("…")).toBe(true);
    expect(d).not.toMatch(/palab…$/);
  });

  it("el enlace apunta a este aviso", async () => {
    const { html } = await pedir();
    expect(meta(html, "property", "og:url")).toBe(`https://www.coleffe.com/aviso/${ID}`);
  });

  it("REEMPLAZA las etiquetas, no las añade: los lectores usan la primera", async () => {
    const { html } = await pedir();
    expect((html.match(/property=["']og:image["']/g) ?? []).length).toBe(1);
    expect((html.match(/property=["']og:title["']/g) ?? []).length).toBe(1);
  });

  it("un título con comillas no rompe la etiqueta", async () => {
    aviso = [{ ...AVISO, title: 'Vendo "casa" <barata> & bonita' }];
    const { html } = await pedir();
    expect(meta(html, "property", "og:title")).toContain("&quot;casa&quot;");
    expect(html).not.toContain('<barata>');
  });

  it("un aviso en borrador o vencido NO se anuncia con su ficha", async () => {
    aviso = [{ ...AVISO, status: "draft" }];
    const { html } = await pedir();
    expect(meta(html, "property", "og:title")).toBe("eFFe Multiclasificados | Avisos Clasificados en Perú");
  });

  it("un aviso que no existe devuelve la app con las etiquetas del sitio", async () => {
    aviso = [];
    const { res, html } = await pedir();
    expect(res.status).toBe(200);
    expect(meta(html, "property", "og:image")).toContain("coleffe.com");
  });

  it("un id que no es un uuid ni llega a consultarse", async () => {
    const { res, html } = await pedir("../../etc/passwd");
    expect(res.status).toBe(200);
    expect(meta(html, "property", "og:title")).toBe("eFFe Multiclasificados | Avisos Clasificados en Perú");
  });

  it("si la base de datos falla, se sirve la app igual: nunca un enlace roto", async () => {
    supabaseFalla = true;
    const { res, html } = await pedir();
    expect(res.status).toBe(200);
    expect(html).toContain("<div id=\"root\">");
  });

  it("sin foto, se queda la imagen del sitio en vez de un hueco roto", async () => {
    aviso = [{ ...AVISO, image_url: null }];
    const { html } = await pedir();
    expect(meta(html, "property", "og:image")).toContain("coleffe.com");
  });

  it("devuelve la app entera, no solo la cabecera", async () => {
    const { html } = await pedir();
    expect(html).toContain("<div id=\"root\">");
    expect(html).toContain("<!doctype html>");
  });

  it("se cachea en el CDN para no golpear la base de datos en cada compartido", async () => {
    const { res } = await pedir();
    expect(res.headers.get("cache-control")).toContain("s-maxage");
  });
});

describe("index.html — las etiquetas por defecto", () => {
  it("ya no apunta a la captura ni a la cuenta de Lovable", () => {
    expect(INDEX.toLowerCase()).not.toContain("lovable");
  });

  it("la imagen por defecto es del propio sitio", () => {
    expect(meta(INDEX, "property", "og:image")).toContain("coleffe.com");
  });
});
