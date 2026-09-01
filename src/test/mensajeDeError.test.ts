import { describe, it, expect } from "vitest";
import { mensajeDeError } from "@/lib/errores";

/**
 * El helper existía sin pruebas, y se descubrió por un fallo concreto el
 * 1-sep-2026: la ficha del aviso no lo usaba y hacía `e instanceof Error`.
 *
 * Eso es FALSO para los errores de Supabase —son objetos planos con `message`,
 * no instancias de Error—, así que el mensaje del freno de reportes de la 0136
 * ("Has enviado varios reportes en poco tiempo. Espera unos minutos") no llegaba
 * nunca: el usuario leía "Intenta de nuevo" y volvía a intentarlo, contra un
 * tope que no baja hasta pasada una hora.
 *
 * De ahí estas pruebas: lo que se rompió no fue el helper, fue no usarlo.
 */
describe("los errores de Supabase, que no heredan de Error", () => {
  it("un PostgrestError entrega su mensaje", () => {
    const e = {
      code: "P0001",
      message: "Has enviado varios reportes en poco tiempo. Espera unos minutos y vuelve a intentarlo.",
      details: null,
      hint: "limite_de_tasa",
    };
    expect(mensajeDeError(e, "Intenta de nuevo.")).toBe(
      "Has enviado varios reportes en poco tiempo. Espera unos minutos y vuelve a intentarlo.",
    );
    // Y la comprobación que estaba mal, escrita para que se vea por qué.
    expect(e instanceof Error).toBe(false);
  });

  it("un objeto con `message` vacío cae al texto por defecto", () => {
    expect(mensajeDeError({ message: "" }, "Intenta de nuevo.")).toBe("Intenta de nuevo.");
  });

  it("un `message` que no es texto no se cuela", () => {
    expect(mensajeDeError({ message: { es: "hola" } }, "Error")).toBe("Error");
  });
});

describe("el resto de formas que llegan a un catch", () => {
  it("un Error de toda la vida", () => {
    expect(mensajeDeError(new Error("Debes iniciar sesión para reportar."), "x"))
      .toBe("Debes iniciar sesión para reportar.");
  });

  it("una cadena suelta", () => {
    expect(mensajeDeError("no autorizado", "x")).toBe("no autorizado");
  });

  it("nada útil: null, undefined, un número", () => {
    expect(mensajeDeError(null, "Error")).toBe("Error");
    expect(mensajeDeError(undefined, "Error")).toBe("Error");
    expect(mensajeDeError(42, "Error")).toBe("Error");
    expect(mensajeDeError({}, "Error")).toBe("Error");
  });

  it("sin texto por defecto, dice 'Error'", () => {
    expect(mensajeDeError(null)).toBe("Error");
  });
});
