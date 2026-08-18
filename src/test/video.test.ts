import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validarVideo, MAX_SEGUNDOS, MAX_VIDEOS, MAX_BYTES } from "@/lib/video";

// La duración de un vídeo solo se puede saber leyendo el archivo, y eso solo se
// puede hacer en el navegador. jsdom no implementa <video>, así que se simula lo
// que hace: avisar (o no) con una duración.

const archivo = (tipo: string, bytes: number, nombre = "clip.mp4") => {
  const f = new File(["x"], nombre, { type: tipo });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
};

/** Hace que el próximo <video> declare esta duración (o falle). */
function simularVideo(duracion: number | "error" | "silencio") {
  const original = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = original(tag);
    if (tag !== "video") return el;
    setTimeout(() => {
      if (duracion === "error") {
        (el as HTMLVideoElement).onerror?.(new Event("error"));
      } else if (duracion !== "silencio") {
        Object.defineProperty(el, "duration", { value: duracion, configurable: true });
        (el as HTMLVideoElement).onloadedmetadata?.(new Event("loadedmetadata"));
      }
    }, 0);
    return el;
  });
}

beforeEach(() => {
  // jsdom no trae createObjectURL.
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("límites de los vídeos", () => {
  it("son tres, de veinte segundos", () => {
    expect(MAX_VIDEOS).toBe(3);
    expect(MAX_SEGUNDOS).toBe(20);
  });
});

describe("validarVideo", () => {
  it("acepta un MP4 corto", async () => {
    simularVideo(12);
    const r = await validarVideo(archivo("video/mp4", 2_000_000));
    expect(r).toEqual({ ok: true, duracion: 12 });
  });

  it("tolera el redondeo del codificador (20,3 s pasa)", async () => {
    // Quien graba exactamente 20 s no entendería un rechazo por tres décimas.
    simularVideo(20.3);
    expect((await validarVideo(archivo("video/mp4", 1_000_000))).ok).toBe(true);
  });

  it("rechaza uno más largo del máximo, diciendo cuánto dura", async () => {
    simularVideo(35);
    const r = await validarVideo(archivo("video/mp4", 1_000_000));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/35 s.*20 s/);
  });

  it("rechaza lo que no es vídeo", async () => {
    const r = await validarVideo(archivo("application/pdf", 1000, "doc.pdf"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/MP4, MOV o WebM/);
  });

  it("rechaza por tamaño ANTES de mirar la duración", async () => {
    // Leer los metadatos de un archivo enorme cuesta; y el bucket lo rechazaría
    // igual, así que mejor decirlo aquí.
    const r = await validarVideo(archivo("video/mp4", MAX_BYTES + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/supera los 15 MB/);
  });

  it("un WebM sin duración legible (Infinity) se rechaza con una salida", async () => {
    simularVideo(Infinity);
    const r = await validarVideo(archivo("video/webm", 1_000_000, "clip.webm"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/MP4/);
  });

  it("si el archivo no se puede abrir, no revienta", async () => {
    simularVideo("error");
    const r = await validarVideo(archivo("video/mp4", 1000));
    expect(r.ok).toBe(false);
  });
});
