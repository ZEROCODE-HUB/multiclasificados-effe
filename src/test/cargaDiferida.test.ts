import { describe, it, expect, vi, beforeEach } from "vitest";
import { cargaDiferida, vigilarPrecargas, olvidarRecarga } from "@/lib/cargaDiferida";

/**
 * Tras un despliegue, los archivos de código del build anterior desaparecen.
 * Quien tuviera la app ABIERTA se quedaba con la pantalla de error de arranque
 * al entrar en cualquier sección del panel:
 *
 *   TypeError: Failed to fetch dynamically imported module: .../SettingsPage-tBDPHwQP.js
 *
 * Le pasaba a todo el que tuviera la pestaña abierta, en cada despliegue.
 */

const reload = vi.fn();
// La recarga se hace con `replace(url)` y no con `reload()`: ver el bloque de
// abajo sobre la caché del navegador.
const replace = vi.fn();

/** Veces que se ha pedido recargar, por cualquiera de las dos vías. */
const recargas = () => reload.mock.calls.length + replace.mock.calls.length;

beforeEach(() => {
  sessionStorage.clear();
  reload.mockClear();
  replace.mockClear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, href: "https://www.coleffe.com/dashboard/superadmin", reload, replace },
  });
});

// Fuerza la promesa de `lazy` sin montar React: es una función que devuelve la
// promesa del módulo, que es justo lo que hay que probar.
const cargar = (comp: ReturnType<typeof cargaDiferida>) =>
  (comp as unknown as { _payload: { _result: () => Promise<unknown> } })._payload._result();

const falla = () => Promise.reject(new TypeError("Failed to fetch dynamically imported module"));
const ok = () => Promise.resolve({ default: (() => null) as never });

describe("cargaDiferida — sobrevivir a un despliegue", () => {
  it("si el módulo carga bien, lo devuelve sin recargar nada", async () => {
    const mod = await cargar(cargaDiferida(ok));
    expect(mod).toBeTruthy();
    expect(recargas()).toBe(0);
  });

  it("si el módulo no existe (build viejo), recarga la página", async () => {
    const promesa = cargar(cargaDiferida(falla));
    // No se resuelve nunca a propósito: la página se está yendo y React no debe
    // pintar ni el error ni un componente a medias.
    const carrera = await Promise.race([promesa.then(() => "resuelta"), Promise.resolve("pendiente")]);

    expect(recargas()).toBe(1);
    expect(carrera).toBe("pendiente");
  });

  it("NO entra en bucle: si tras recargar vuelve a fallar, propaga el error", async () => {
    await Promise.race([cargar(cargaDiferida(falla)), Promise.resolve()]);
    expect(recargas()).toBe(1);

    // Segundo intento, ya recargados: ahora el problema es otro (sin conexión,
    // archivo corrupto) y recargar en bucle sería peor que enseñar el error.
    await expect(cargar(cargaDiferida(falla))).rejects.toThrow(/dynamically imported/i);
    expect(recargas()).toBe(1);
  });

  it("una carga correcta borra la marca, para que un fallo futuro sí recargue", async () => {
    await Promise.race([cargar(cargaDiferida(falla)), Promise.resolve()]);
    expect(recargas()).toBe(1);

    await cargar(cargaDiferida(ok));           // el usuario navega y todo va bien
    await Promise.race([cargar(cargaDiferida(falla)), Promise.resolve()]);
    expect(recargas()).toBe(2);   // un despliegue posterior sí recarga
  });

  it("sin sessionStorage no recarga, antes que arriesgar un bucle", async () => {
    const set = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("modo privado");
    });
    try {
      await expect(cargar(cargaDiferida(falla))).rejects.toThrow();
      expect(recargas()).toBe(0);
    } finally {
      set.mockRestore();
    }
  });
});

describe("🔴 la recarga tiene que saltarse la caché del navegador", () => {
  // Caso REAL: un usuario con la pestaña abierta desde hacía días seguía viendo
  // la v4.5 después de recargar, con la v6.8 ya desplegada. `location.reload()`
  // deja que el navegador sirva el MISMO index.html de su caché, así que vuelve
  // a faltar el mismo trozo, la app vuelve a romperse y encima se ha gastado el
  // único reintento. Con un parámetro nuevo en la URL no hay copia que valga.
  it("navega a una URL nueva en vez de llamar a reload()", async () => {
    await Promise.race([cargar(cargaDiferida(falla)), Promise.resolve()]);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();

    const destino = new URL(replace.mock.calls[0][0] as string);
    expect(destino.pathname).toBe("/dashboard/superadmin");   // no se pierde dónde estaba
    expect(destino.searchParams.get("_r")).toBeTruthy();      // y lleva algo que rompe la caché
  });

  it("cada recarga usa un valor distinto", async () => {
    await Promise.race([cargar(cargaDiferida(falla)), Promise.resolve()]);
    const primera = new URL(replace.mock.calls[0][0] as string).searchParams.get("_r");

    // Se simula que pasó el tiempo y el usuario vuelve a tropezar.
    olvidarRecarga();
    vi.setSystemTime(new Date(Date.now() + 60_000));
    await Promise.race([cargar(cargaDiferida(falla)), Promise.resolve()]);
    vi.useRealTimers();

    const segunda = new URL(replace.mock.calls[1][0] as string).searchParams.get("_r");
    expect(segunda).not.toBe(primera);
  });
});

describe("vigilarPrecargas — el mismo fallo por la otra vía", () => {
  it("recarga cuando Vite avisa de que una precarga falló", () => {
    vigilarPrecargas();
    olvidarRecarga();

    const evento = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(evento);

    expect(recargas()).toBe(1);
    // Se cancela el evento: sin esto Vite relanza el error y la app cae igual.
    expect(evento.defaultPrevented).toBe(true);
  });

  it("tampoco aquí se entra en bucle", () => {
    vigilarPrecargas();
    olvidarRecarga();

    window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));

    expect(recargas()).toBe(1);
  });
});
