import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

/**
 * Enterarse de que la página está obsoleta.
 *
 * LO QUE REPORTÓ EL CLIENTE: se arregló el formulario de «Trabaje con nosotros»,
 * se desplegó, y horas después seguía viendo el mismo error —
 * "se supone que ya lo habías solucionado". Y tenía razón en quejarse: su
 * pestaña llevaba abierta desde antes y seguía ejecutando el JavaScript viejo
 * contra una base de datos que ya había cambiado.
 *
 * Había dos mecanismos y ninguno cubría esto:
 *
 *   · `cargaDiferida` solo reacciona cuando un trozo del build NO SE PUEDE
 *     DESCARGAR. Vercel conserva los ficheros de despliegues anteriores, así que
 *     no falla nada y el código viejo sigue vivo indefinidamente.
 *   · `UpdateGate` sale sin hacer nada si no está en la app nativa.
 */

const nativa = { valor: false };
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => nativa.valor },
}));

const recargar = vi.fn();
vi.mock("@/lib/cargaDiferida", () => ({
  recargarSaltandoCache: () => recargar(),
}));

import { AvisoActualizar } from "@/components/AvisoActualizar";

/** Lo que responde el servidor al preguntar por `version.json`. */
const servidor = { respuesta: null as unknown, ok: true };

/** El build que la página cree estar ejecutando (lo inyecta Vite en el bundle). */
const BUILD_EN_CURSO = "1788469992911";

const verVersionNueva = async () => {
  // El aviso se comprueba al VOLVER a la pestaña, no al abrirla: una pestaña
  // recién abierta acaba de traerse el HTML.
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
  });
};

beforeEach(() => {
  nativa.valor = false;
  recargar.mockReset();
  servidor.ok = true;
  servidor.respuesta = { version: "17.2", buildId: "9999999999999" };
  vi.stubGlobal("__BUILD_ID__", BUILD_EN_CURSO);
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  global.fetch = vi.fn(async () => ({
    ok: servidor.ok,
    json: async () => servidor.respuesta,
  })) as unknown as typeof fetch;
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("cuando hay un despliegue nuevo", () => {
  it("lo avisa al volver a la pestaña", async () => {
    render(<AvisoActualizar />);
    await verVersionNueva();
    expect(screen.getByText(/Hay una versión nueva/i)).toBeInTheDocument();
  });

  it("pregunta SIN caché, que es lo único que sirve para enterarse", async () => {
    // Una respuesta servida desde la caché del navegador diría siempre que todo
    // sigue igual, y el aviso no saltaría nunca.
    render(<AvisoActualizar />);
    await verVersionNueva();
    expect(global.fetch).toHaveBeenCalledWith("/version.json", { cache: "no-store" });
  });

  it("al pulsar Actualizar recarga saltándose la caché", async () => {
    // No un `location.reload()` a secas: Chrome en Android puede devolver el
    // HTML de su caché y dejarnos con la misma copia vieja.
    render(<AvisoActualizar />);
    await verVersionNueva();
    fireEvent.click(screen.getByRole("button", { name: /actualizar/i }));
    expect(recargar).toHaveBeenCalled();
  });

  it("NO recarga solo", async () => {
    // Recargar por sorpresa a quien está a medio rellenar el formulario de
    // publicar un aviso le borra lo escrito.
    render(<AvisoActualizar />);
    await verVersionNueva();
    expect(recargar).not.toHaveBeenCalled();
  });

  it("y no se puede cerrar: seguir en la copia vieja es toparse con errores ya arreglados", async () => {
    render(<AvisoActualizar />);
    await verVersionNueva();
    expect(screen.queryByRole("button", { name: /ahora no|cerrar/i })).toBeNull();
  });
});

describe("cuándo NO se avisa", () => {
  it("si el build desplegado es el mismo", async () => {
    servidor.respuesta = { version: "17.1", buildId: BUILD_EN_CURSO };
    render(<AvisoActualizar />);
    await verVersionNueva();
    expect(screen.queryByText(/Hay una versión nueva/i)).toBeNull();
  });

  it("si no se puede saber, ante la duda callado", async () => {
    // Sin cobertura un momento, o un 404 en un despliegue antiguo. Decirle "hay
    // una versión nueva" a quien ya está en la última es peor que no decir nada.
    servidor.ok = false;
    render(<AvisoActualizar />);
    await verVersionNueva();
    expect(screen.queryByText(/Hay una versión nueva/i)).toBeNull();
  });

  it("si la respuesta no es la esperada", async () => {
    // Pasaría si `version.json` cayera en la reescritura a index.html: llegaría
    // el HTML de la app y `res.json()` fallaría. Se calla, no revienta.
    servidor.respuesta = { hola: "mundo" };
    render(<AvisoActualizar />);
    await verVersionNueva();
    expect(screen.queryByText(/Hay una versión nueva/i)).toBeNull();
  });

  it("sin conexión no se pregunta siquiera", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    render(<AvisoActualizar />);
    await verVersionNueva();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("y NUNCA en el APK ni en el iPhone", async () => {
    // Allí actualizar es bajarse otro paquete, no recargar: lo gobierna
    // `UpdateGate` contra la base de datos.
    nativa.valor = true;
    render(<AvisoActualizar />);
    await verVersionNueva();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/Hay una versión nueva/i)).toBeNull();
  });

  it("no molesta nada más abrir la pestaña", async () => {
    // Acaba de traerse el HTML: preguntar es gastar una petición para oír que sí.
    render(<AvisoActualizar />);
    await act(async () => { await Promise.resolve(); });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("el fichero que hace posible la comprobación", () => {
  const leer = (p: string) =>
    fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

  it("el build lo escribe, con un identificador que cambia SIEMPRE", () => {
    // La marca de tiempo del build y no `APP_VERSION`: si alguien olvida subir
    // la versión, esto cambia igual. Un aviso que depende de que nadie se
    // despiste no es un aviso.
    const cfg = leer("vite.config.ts");
    expect(cfg).toContain("effe-version-json");
    expect(cfg).toContain("dist/version.json");
    expect(cfg).toContain("__BUILD_ID__");
  });

  it("y NO cae en la reescritura a index.html", () => {
    // Si cayera, la comprobación recibiría el HTML de la aplicación y diría
    // "todo al día" para siempre: el aviso no saltaría nunca y esto quedaría
    // roto sin que nadie lo notara.
    const vercel = JSON.parse(leer("vercel.json")) as {
      rewrites: { source: string }[];
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    const spa = vercel.rewrites.find((r) => r.source.includes("(?!"));
    expect(spa?.source).toContain("version\\.json");

    // Y se sirve sin caché, por el mismo motivo que el `no-store` del fetch.
    const cabeceras = vercel.headers.find((h) => h.source === "/version.json");
    expect(cabeceras?.headers[0].value).toMatch(/max-age=0/);
  });
});
