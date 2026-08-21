import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Plataforma controlable: por defecto web táctil (que es donde duele).
const isNative = vi.fn(() => false);
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => isNative() },
}));

const hide = vi.fn(() => Promise.resolve());
vi.mock("@capacitor/keyboard", () => ({ Keyboard: { hide: () => hide() } }));

import { cerrarTeclado, cerrarTecladoAlTocarFuera, esCampoDeTexto } from "@/lib/teclado";

/** Simula un dispositivo táctil (o de ratón) para `matchMedia`. */
function conPuntero(grueso: boolean) {
  Object.defineProperty(window, "matchMedia", {
    value: (q: string) => ({ matches: grueso && q.includes("coarse"), media: q,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    configurable: true, writable: true,
  });
}

/** Un toque: pointerdown y, si nadie lo impide, el click que viene detrás. */
function tocar(el: Element): { clicLlego: boolean } {
  let clicLlego = false;
  el.addEventListener("click", () => { clicLlego = true; }, { once: true });
  // jsdom no implementa PointerEvent; un MouseEvent con ese nombre despierta a
  // los mismos escuchas, que es lo único que este test necesita.
  el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  return { clicLlego };
}

let limpiar: (() => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  isNative.mockReturnValue(false);
  conPuntero(true);
  document.body.innerHTML = `
    <input id="campo" />
    <div id="aire">Resultados</div>
    <button id="boton">Buscar</button>
    <input id="casilla" type="checkbox" />
  `;
});

afterEach(() => {
  limpiar?.();
  limpiar = null;
  document.body.innerHTML = "";
});

describe("qué cuenta como campo de texto", () => {
  it("un input normal y un textarea sí", () => {
    expect(esCampoDeTexto(document.getElementById("campo"))).toBe(true);
    const ta = document.createElement("textarea");
    expect(esCampoDeTexto(ta)).toBe(true);
  });

  it("una casilla no: no abre ningún teclado", () => {
    expect(esCampoDeTexto(document.getElementById("casilla"))).toBe(false);
  });

  it("un botón ni nada no", () => {
    expect(esCampoDeTexto(document.getElementById("boton"))).toBe(false);
    expect(esCampoDeTexto(null)).toBe(false);
  });
});

describe("cerrarTeclado", () => {
  it("quita el foco del campo", () => {
    const campo = document.getElementById("campo") as HTMLInputElement;
    campo.focus();
    expect(document.activeElement).toBe(campo);
    cerrarTeclado();
    expect(document.activeElement).not.toBe(campo);
  });

  it("en web no llama al plugin nativo", () => {
    (document.getElementById("campo") as HTMLInputElement).focus();
    cerrarTeclado();
    expect(hide).not.toHaveBeenCalled();
  });

  it("en el APK sí se lo dice al plugin: el WebView lo deja abierto sin foco", async () => {
    isNative.mockReturnValue(true);
    (document.getElementById("campo") as HTMLInputElement).focus();
    cerrarTeclado();
    // El plugin se carga con un import dinámico, así que no está listo en la
    // microtarea siguiente.
    await vi.waitFor(() => expect(hide).toHaveBeenCalled());
  });
});

describe("un toque fuera cierra el teclado", () => {
  it("tocar al aire cierra el teclado", () => {
    limpiar = cerrarTecladoAlTocarFuera();
    const campo = document.getElementById("campo") as HTMLInputElement;
    campo.focus();

    tocar(document.getElementById("aire")!);

    expect(document.activeElement).not.toBe(campo);
  });

  it("y ese toque NO activa lo que hubiera debajo", () => {
    // Es el fallo que se veía: al cerrarse el teclado la página se recoloca y
    // el dedo acaba pulsando otra cosa. Ese toque era solo para quitarlo.
    limpiar = cerrarTecladoAlTocarFuera();
    (document.getElementById("campo") as HTMLInputElement).focus();

    const { clicLlego } = tocar(document.getElementById("aire")!);

    expect(clicLlego).toBe(false);
  });

  it("pero tocar un botón sí lo pulsa: dos toques para buscar sería peor", () => {
    limpiar = cerrarTecladoAlTocarFuera();
    (document.getElementById("campo") as HTMLInputElement).focus();

    const { clicLlego } = tocar(document.getElementById("boton")!);

    expect(clicLlego).toBe(true);
  });

  it("tocar el propio campo no lo cierra", () => {
    limpiar = cerrarTecladoAlTocarFuera();
    const campo = document.getElementById("campo") as HTMLInputElement;
    campo.focus();

    tocar(campo);

    expect(document.activeElement).toBe(campo);
  });

  it("sin nada escribiendo, un toque al aire no se traga", () => {
    limpiar = cerrarTecladoAlTocarFuera();
    const { clicLlego } = tocar(document.getElementById("aire")!);
    expect(clicLlego).toBe(true);
  });

  it("con ratón no se toca nada: en escritorio no hay teclado que cerrar", () => {
    conPuntero(false);
    limpiar = cerrarTecladoAlTocarFuera();
    const campo = document.getElementById("campo") as HTMLInputElement;
    campo.focus();

    const { clicLlego } = tocar(document.getElementById("aire")!);

    expect(document.activeElement).toBe(campo);
    expect(clicLlego).toBe(true);
  });

  it("al desmontar deja de escuchar", () => {
    const parar = cerrarTecladoAlTocarFuera();
    parar();
    const campo = document.getElementById("campo") as HTMLInputElement;
    campo.focus();

    tocar(document.getElementById("aire")!);

    expect(document.activeElement).toBe(campo);
  });
});
