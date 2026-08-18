import { describe, it, expect, vi, beforeEach } from "vitest";
import { primerFallo, fallos, enfocarCampo } from "@/lib/validacion";

describe("primerFallo / fallos", () => {
  const reglas = [
    { campo: "a", ok: true, mensaje: "falta a" },
    { campo: "b", ok: false, mensaje: "falta b" },
    { campo: "c", ok: false, mensaje: "falta c" },
  ];

  it("devuelve el primero en orden visual, no uno cualquiera", () => {
    // El orden importa: hacer scroll al último campo que falla dejaría al
    // usuario más abajo de donde tiene que corregir.
    expect(primerFallo(reglas)?.campo).toBe("b");
  });

  it("sin fallos devuelve null", () => {
    expect(primerFallo([{ campo: "a", ok: true, mensaje: "" }])).toBeNull();
  });

  it("marca todos los campos malos a la vez", () => {
    expect(fallos(reglas)).toEqual({ b: "falta b", c: "falta c" });
  });
});

describe("enfocarCampo", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("baja hasta el campo, centrado, y le da el foco al control de dentro", () => {
    document.body.innerHTML = `<div data-campo="titulo"><input id="i" /></div>`;
    const caja = document.querySelector<HTMLElement>('[data-campo="titulo"]')!;
    const input = document.getElementById("i") as HTMLInputElement;
    caja.scrollIntoView = vi.fn();
    const focus = vi.spyOn(input, "focus");

    enfocarCampo("titulo");

    // "center" no es cosmético: con "nearest" el teclado del móvil tapa el campo.
    expect(caja.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    expect(focus).toHaveBeenCalled();
  });

  it("si el propio elemento es el control, lo enfoca a él", () => {
    document.body.innerHTML = `<input data-campo="precio" />`;
    const input = document.querySelector<HTMLInputElement>('[data-campo="precio"]')!;
    input.scrollIntoView = vi.fn();
    const focus = vi.spyOn(input, "focus");
    enfocarCampo("precio");
    expect(focus).toHaveBeenCalled();
  });

  it("un campo que no existe no revienta", () => {
    expect(() => enfocarCampo("no-existe")).not.toThrow();
  });
});
