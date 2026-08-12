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

beforeEach(() => {
  sessionStorage.clear();
  reload.mockClear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
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
    expect(reload).not.toHaveBeenCalled();
  });

  it("si el módulo no existe (build viejo), recarga la página", async () => {
    const promesa = cargar(cargaDiferida(falla));
    // No se resuelve nunca a propósito: la página se está yendo y React no debe
    // pintar ni el error ni un componente a medias.
    const carrera = await Promise.race([promesa.then(() => "resuelta"), Promise.resolve("pendiente")]);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(carrera).toBe("pendiente");
  });

  it("NO entra en bucle: si tras recargar vuelve a fallar, propaga el error", async () => {
    await Promise.race([cargar(cargaDiferida(falla)), Promise.resolve()]);
    expect(reload).toHaveBeenCalledTimes(1);

    // Segundo intento, ya recargados: ahora el problema es otro (sin conexión,
    // archivo corrupto) y recargar en bucle sería peor que enseñar el error.
    await expect(cargar(cargaDiferida(falla))).rejects.toThrow(/dynamically imported/i);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("una carga correcta borra la marca, para que un fallo futuro sí recargue", async () => {
    await Promise.race([cargar(cargaDiferida(falla)), Promise.resolve()]);
    expect(reload).toHaveBeenCalledTimes(1);

    await cargar(cargaDiferida(ok));           // el usuario navega y todo va bien
    await Promise.race([cargar(cargaDiferida(falla)), Promise.resolve()]);
    expect(reload).toHaveBeenCalledTimes(2);   // un despliegue posterior sí recarga
  });

  it("sin sessionStorage no recarga, antes que arriesgar un bucle", async () => {
    const set = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("modo privado");
    });
    try {
      await expect(cargar(cargaDiferida(falla))).rejects.toThrow();
      expect(reload).not.toHaveBeenCalled();
    } finally {
      set.mockRestore();
    }
  });
});

describe("vigilarPrecargas — el mismo fallo por la otra vía", () => {
  it("recarga cuando Vite avisa de que una precarga falló", () => {
    vigilarPrecargas();
    olvidarRecarga();

    const evento = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(evento);

    expect(reload).toHaveBeenCalledTimes(1);
    // Se cancela el evento: sin esto Vite relanza el error y la app cae igual.
    expect(evento.defaultPrevented).toBe(true);
  });

  it("tampoco aquí se entra en bucle", () => {
    vigilarPrecargas();
    olvidarRecarga();

    window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
