// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FALLBACK_IMG } from "@/lib/listings";

/**
 * La imagen que lleva un aviso publicado sin foto.
 *
 * Subir foto es opcional, así que esto no es un caso raro que se vea una vez al
 * año: es lo que verá cualquiera que publique deprisa. Y el archivo tiene una
 * trampa: los huecos de imagen de la app usan `object-cover`, que RECORTA. El
 * original del logo viene pegado a los bordes, así que si alguien lo copia tal
 * cual a public/ el recorte se come la "E" y el globo, y nadie se entera hasta
 * que lo ve en producción. De ahí que se compruebe la geometría del archivo.
 */

const RAIZ = path.resolve(__dirname, "../..");
const ARCHIVO = path.join(RAIZ, "public/aviso-sin-imagen.jpg");

/** Ancho y alto de un JPEG, leídos de su cabecera (sin librerías). */
function medirJpeg(buf: Buffer): { ancho: number; alto: number } {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marcador = buf[i + 1];
    // SOF0..SOF15, menos los que no describen la imagen (DHT, JPG, DAC).
    if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
      return { alto: buf.readUInt16BE(i + 5), ancho: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("No parece un JPEG");
}

describe("la imagen por defecto", () => {
  it("se sirve desde el propio dominio, no desde un tercero", () => {
    // Antes era una foto de archivo de Unsplash: un servidor ajeno del que
    // dependía cada tarjeta, y que además no dice nada de la marca.
    expect(FALLBACK_IMG.startsWith("/")).toBe(true);
    expect(FALLBACK_IMG).not.toMatch(/^https?:/);
  });

  it("el archivo existe donde dice la constante", () => {
    expect(fs.existsSync(path.join(RAIZ, "public", FALLBACK_IMG))).toBe(true);
  });

  it("tiene la proporción de los huecos de la app (4:3)", () => {
    const { ancho, alto } = medirJpeg(fs.readFileSync(ARCHIVO));
    expect(ancho / alto).toBeCloseTo(4 / 3, 2);
  });

  it("NO es el original sin márgenes", () => {
    // El original mide 924x495. Si alguien lo copia tal cual, esta prueba salta.
    const { ancho, alto } = medirJpeg(fs.readFileSync(ARCHIVO));
    expect({ ancho, alto }).not.toEqual({ ancho: 924, alto: 495 });
    expect(ancho).toBeGreaterThanOrEqual(1200);
  });

  it("no pesa tanto como para lastrar una página llena de tarjetas", () => {
    // Se repite en cada aviso sin foto, aunque el navegador la cachee.
    expect(fs.statSync(ARCHIVO).size).toBeLessThan(150 * 1024);
  });

  it("conserva el original, para poder regenerarla", () => {
    expect(fs.existsSync(path.join(RAIZ, "scripts/fuente-aviso-sin-imagen.jpg"))).toBe(true);
    expect(fs.existsSync(path.join(RAIZ, "scripts/generar-imagen-por-defecto.mjs"))).toBe(true);
  });
});
