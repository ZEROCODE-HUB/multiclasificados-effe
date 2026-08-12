import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * La imagen que ven los avisos SIN FOTO.
 *
 * Lo que se prueba aquí no es la subida, sino la regla que decide qué se pinta:
 * la lee `mapCard()`, que es síncrona y por la que pasa casi toda la app. Si
 * devolviera vacío en algún caso, las tarjetas saldrían con el hueco roto.
 */

const rpc = vi.fn<(nombre: string) => Promise<{ data: unknown; error: unknown }>>();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: [string]) => rpc(...a) } }));

import {
  FALLBACK_IMG,
  imagenPorDefecto,
  cargarImagenPorDefecto,
  invalidarImagenPorDefecto,
  reiniciarImagenPorDefecto,
  suscribirImagenPorDefecto,
} from "@/lib/imagenPorDefecto";

const CONFIGURADA = "https://cdn.effe.pe/site-assets/aviso-sin-imagen/123.webp";

beforeEach(() => {
  localStorage.clear();
  reiniciarImagenPorDefecto();
  rpc.mockReset().mockResolvedValue({ data: null, error: null });
});

describe("qué imagen se pinta", () => {
  it("sin nada cargado devuelve la del bundle, no vacío", () => {
    // Es el primer render de la primera visita: no puede quedar sin imagen.
    expect(imagenPorDefecto()).toBe(FALLBACK_IMG);
  });

  it("tras cargar una configurada, devuelve esa", async () => {
    rpc.mockResolvedValue({ data: CONFIGURADA, error: null });
    await cargarImagenPorDefecto();
    expect(imagenPorDefecto()).toBe(CONFIGURADA);
  });

  it("si no hay ninguna configurada, se queda la del bundle", async () => {
    await cargarImagenPorDefecto();
    expect(imagenPorDefecto()).toBe(FALLBACK_IMG);
  });

  it("si la consulta falla, tampoco se queda sin imagen", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "sin red" } });
    await cargarImagenPorDefecto();
    expect(imagenPorDefecto()).toBe(FALLBACK_IMG);
  });

  it("una respuesta en blanco cuenta como 'no hay'", async () => {
    rpc.mockResolvedValue({ data: "   ", error: null });
    await cargarImagenPorDefecto();
    expect(imagenPorDefecto()).toBe(FALLBACK_IMG);
  });
});

describe("la copia en el navegador", () => {
  it("en la siguiente visita está disponible desde el primer render", async () => {
    rpc.mockResolvedValue({ data: CONFIGURADA, error: null });
    await cargarImagenPorDefecto();

    // Nueva visita: memoria a cero, pero el navegador conserva la copia.
    reiniciarImagenPorDefecto();
    expect(imagenPorDefecto()).toBe(CONFIGURADA);
  });

  it("una copia corrupta no deja la portada con imágenes rotas", () => {
    localStorage.setItem("effe:imagen-por-defecto", "javascript:alert(1)");
    reiniciarImagenPorDefecto();
    expect(imagenPorDefecto()).toBe(FALLBACK_IMG);
  });

  it("al quitarla en el panel, la copia también se borra", async () => {
    rpc.mockResolvedValue({ data: CONFIGURADA, error: null });
    await cargarImagenPorDefecto();

    rpc.mockResolvedValue({ data: null, error: null });
    await invalidarImagenPorDefecto();

    reiniciarImagenPorDefecto();
    expect(imagenPorDefecto()).toBe(FALLBACK_IMG);
  });
});

describe("no se consulta más de lo necesario", () => {
  it("varias llamadas seguidas hacen UNA sola consulta", async () => {
    rpc.mockResolvedValue({ data: CONFIGURADA, error: null });
    await Promise.all([cargarImagenPorDefecto(), cargarImagenPorDefecto(), cargarImagenPorDefecto()]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("una vez cargada no se vuelve a pedir…", async () => {
    await cargarImagenPorDefecto();
    await cargarImagenPorDefecto();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("…salvo que el panel la invalide", async () => {
    await cargarImagenPorDefecto();
    await invalidarImagenPorDefecto();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("avisa a quien esté suscrito cuando cambia", async () => {
    const oyente = vi.fn();
    suscribirImagenPorDefecto(oyente);
    rpc.mockResolvedValue({ data: CONFIGURADA, error: null });
    await cargarImagenPorDefecto();
    expect(oyente).toHaveBeenCalledTimes(1);
  });
});
