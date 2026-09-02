import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { normalizarAcercaDe, ACERCA_DE_POR_DEFECTO } from "@/lib/acercaDe";

/**
 * La sección «Acerca de Nosotros» (punto 03).
 *
 * Dos cosas importan aquí, y ninguna es que se pinte el texto:
 *
 *  1. QUE NUNCA SE VEA UN HUECO. Va en la portada, que es lo primero que ve
 *     cualquiera. Si la consulta falla, si tarda, o si el administrador vacía un
 *     campo, tiene que salir el texto de fábrica y no un bloque en blanco, que
 *     se lee como una página rota.
 *
 *  2. QUE EL TEXTO SE PINTE COMO TEXTO. Lo escribe una persona en un campo del
 *     panel y lo lee todo el visitante. El atajo evidente para que se respeten
 *     los saltos de línea es `dangerouslySetInnerHTML`, y eso convierte a un
 *     administrador que pega algo que le pasaron en un <script> en la portada.
 */

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { AcercaDeNosotros } from "@/components/AcercaDeNosotros";

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe("normalizar lo que llega de la base", () => {
  it("usa lo que escribió el administrador", () => {
    const r = normalizarAcercaDe({
      titulo: "Quiénes somos", texto: "Somos eFFe.", mision: "M", vision: "V",
    });
    expect(r.titulo).toBe("Quiénes somos");
    expect(r.texto).toBe("Somos eFFe.");
  });

  it("rellena CAMPO A CAMPO lo que esté vacío, no todo o nada", () => {
    // Si el administrador borra la misión, se recupera esa sola: lo que sí
    // escribió tiene que respetarse.
    const r = normalizarAcercaDe({ titulo: "Quiénes somos", texto: "", mision: "   ", vision: "V" });
    expect(r.titulo).toBe("Quiénes somos");
    expect(r.texto).toBe(ACERCA_DE_POR_DEFECTO.texto);
    expect(r.mision).toBe(ACERCA_DE_POR_DEFECTO.mision);
    expect(r.vision).toBe("V");
  });

  it("una respuesta que no es un objeto cae entera al texto de fábrica", () => {
    expect(normalizarAcercaDe(null)).toEqual(ACERCA_DE_POR_DEFECTO);
    expect(normalizarAcercaDe("vaya")).toEqual(ACERCA_DE_POR_DEFECTO);
  });

  it("un valor que no es texto tampoco se cuela", () => {
    // Un jsonb puede traer un número o un objeto si alguien lo escribió a mano
    // en la tabla. Pintar "[object Object]" en la portada sería peor que el
    // texto de fábrica.
    const r = normalizarAcercaDe({ titulo: 42, texto: { a: 1 } });
    expect(r.titulo).toBe(ACERCA_DE_POR_DEFECTO.titulo);
    expect(r.texto).toBe(ACERCA_DE_POR_DEFECTO.texto);
  });
});

describe("la sección en pantalla", () => {
  it("arranca con el texto de fábrica, antes de que responda la base", () => {
    // Sin esto habría medio segundo de bloque en blanco en la portada.
    render(<AcercaDeNosotros />);
    expect(screen.getByText("Acerca de Nosotros")).toBeInTheDocument();
    expect(screen.getByText("Misión")).toBeInTheDocument();
    expect(screen.getByText("Visión")).toBeInTheDocument();
  });

  it("y enseña lo que el administrador escribió cuando llega", async () => {
    rpc.mockResolvedValue({
      data: { titulo: "Nuestra empresa", texto: "Hola", mision: "M", vision: "V" },
      error: null,
    });
    render(<AcercaDeNosotros />);
    await waitFor(() => expect(screen.getByText("Nuestra empresa")).toBeInTheDocument());
    expect(screen.getByText("Hola")).toBeInTheDocument();
  });

  it("si la base falla, sigue habiendo sección", async () => {
    // `fetchAcercaDe` traga el error a propósito, igual que `fetchRedesSociales`
    // y `configYapePlin`: la portada no puede quedarse coja porque la base tarde.
    rpc.mockRejectedValue(new Error("42501"));
    render(<AcercaDeNosotros />);
    await waitFor(() => expect(screen.getByText("Acerca de Nosotros")).toBeInTheDocument());
  });

  it("el texto va como TEXTO: una etiqueta HTML se ve, no se ejecuta", async () => {
    rpc.mockResolvedValue({
      data: { titulo: "T", texto: "<img src=x onerror=alert(1)>", mision: "M", vision: "V" },
      error: null,
    });
    const { container } = render(<AcercaDeNosotros />);
    await waitFor(() => expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument());
    // Lo que importa: no hay ninguna etiqueta de verdad en el DOM.
    expect(container.querySelector("img")).toBeNull();
  });

  it("los saltos de línea se respetan sin permitir HTML", async () => {
    // `whitespace-pre-line` hace el trabajo que uno estaría tentado de darle a
    // `dangerouslySetInnerHTML`.
    rpc.mockResolvedValue({
      data: { titulo: "T", texto: "Uno\n\nDos", mision: "M", vision: "V" },
      error: null,
    });
    const { container } = render(<AcercaDeNosotros />);
    await waitFor(() => expect(container.textContent).toContain("Uno"));
    expect(container.innerHTML).not.toContain("dangerously");
    expect(container.querySelector(".whitespace-pre-line")).not.toBeNull();
  });

  it("en la página propia el título es un h1; en la portada, un h2", () => {
    // Saltarse el h1 deja la página sin título para un lector de pantalla y
    // para Google; ponerlo dos veces en la portada es el problema contrario.
    const { unmount } = render(<AcercaDeNosotros comoH1 />);
    expect(screen.getByRole("heading", { level: 1, name: "Acerca de Nosotros" })).toBeInTheDocument();
    unmount();
    render(<AcercaDeNosotros />);
    expect(screen.getByRole("heading", { level: 2, name: "Acerca de Nosotros" })).toBeInTheDocument();
  });
});
