import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { prepararDom } from "./domPolyfills";

/**
 * La pantalla pública de «Trabaje con nosotros» (B-18).
 *
 * Dos comportamientos que el cliente pidió por su nombre en otro punto y que
 * aquí valen igual: que los campos que faltan se resalten y que **el cursor se
 * vaya al primero** (punto 9 de los temas pendientes). En un formulario de diez
 * campos, un aviso rojo sin cursor deja al candidato buscando.
 */

beforeEach(prepararDom);

const submitCareer = vi.fn();

// Solo se sustituye el envío. `YaPostulaste` y las listas de grados y estados
// se dejan las de verdad: declarar una clase aquí arriba rompe el hoisting de
// `vi.mock`, y además la prueba dejaría de comprobar la clase real.
vi.mock("@/lib/careers", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  submitCareer: (...a: unknown[]) => submitCareer(...a),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }));

import TrabajeConNosotros from "@/pages/TrabajeConNosotros";
import { YaPostulaste } from "@/lib/careers";

beforeEach(() => {
  submitCareer.mockReset();
  submitCareer.mockResolvedValue({ code: 7, createdAt: "2026-08-31T20:00:00Z" });
  toastError.mockReset();
});

const pintar = () =>
  render(<MemoryRouter><TrabajeConNosotros /></MemoryRouter>);

const escribir = (etiqueta: RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

/** Rellena todo menos el grado y el puesto, que van por desplegable/aparte. */
function rellenarTexto() {
  escribir(/apellido paterno/i, "Ramírez");
  escribir(/apellido materno/i, "Soto");
  escribir(/nombres/i, "Ana");
  escribir(/número de documento/i, "45678912");
  escribir(/correo electrónico/i, "ana@correo.com");
  escribir(/puesto al que postulas/i, "Asesora comercial");
  escribir(/habilidades y tu experiencia/i, "Cinco años en ventas.");
}

const enviar = () =>
  fireEvent.click(screen.getByRole("button", { name: /enviar postulación/i }));

/**
 * Elige el grado de instrucción.
 *
 * El desplegable es un Select de Radix, no un `<select>`: se abre con un clic
 * sobre su disparador (`role="combobox"`), no escribiendo en él. Los polyfills
 * de `prepararDom` son los que hacen que eso funcione en jsdom.
 */
async function elegirGrado(etiqueta: string) {
  fireEvent.click(screen.getByLabelText(/grado de instrucción/i));
  fireEvent.click(await screen.findByRole("option", { name: etiqueta }));
}

describe("no se envía a medias", () => {
  it("un formulario vacío no llega a la base", async () => {
    pintar();
    enviar();
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(submitCareer).not.toHaveBeenCalled();
  });

  it("el cursor se va al primer campo que falta", async () => {
    pintar();
    rellenarTexto();
    // Se borra el primero de todos: ahí tiene que acabar el cursor, y no en el
    // grado, que es lo que en realidad falta más abajo.
    escribir(/apellido paterno/i, "");
    enviar();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText(/apellido paterno/i)),
    );
  });

  it("los campos que faltan se marcan, y la marca se va al escribir", async () => {
    pintar();
    enviar();
    const paterno = await screen.findByLabelText(/apellido paterno/i);
    await waitFor(() => expect(paterno.className).toContain("border-destructive"));

    fireEvent.change(paterno, { target: { value: "Ramírez" } });
    await waitFor(() => expect(paterno.className).not.toContain("border-destructive"));
  });

  it("un correo mal escrito lo para aquí, no en la base", async () => {
    pintar();
    rellenarTexto();
    escribir(/correo electrónico/i, "ana@correo");
    enviar();
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(submitCareer).not.toHaveBeenCalled();
  });
});

describe("cuando sale bien", () => {
  it("enseña el número y la fecha del registro", async () => {
    pintar();
    rellenarTexto();
    await elegirGrado("Técnico");

    enviar();

    await waitFor(() => expect(submitCareer).toHaveBeenCalled());
    expect(await screen.findByText(/recibimos tu postulación/i)).toBeTruthy();
    // "Que se grabe en un registro con la fecha y hora que se registró": se le
    // enseña al candidato, que es su constancia.
    expect(screen.getByText(/31 ago\. 2026|31 ago 2026/)).toBeTruthy();
  });
});

describe("cuando ya postuló", () => {
  it("se lo dice con sus palabras, no como error inesperado", async () => {
    // El freno de la 0135 llega como violación de CHECK. Enseñar el 23514 crudo
    // haría pensar que la web está rota.
    submitCareer.mockRejectedValue(new YaPostulaste("Ya registramos tu postulación."));
    pintar();
    rellenarTexto();
    await elegirGrado("Técnico");
    enviar();

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(
      "Ya tenemos tu postulación",
      expect.objectContaining({ description: "Ya registramos tu postulación." }),
    ));
    expect(screen.queryByText(/recibimos tu postulación/i)).toBeNull();
  });
});
