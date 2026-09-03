import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TextoConFormato } from "@/components/TextoConFormato";

/**
 * Lo que ve el visitante.
 *
 * Este componente lo ejecuta TODO el que abre un aviso, así que lo que se fija
 * aquí es sobre todo lo que NO puede pasar: que un anunciante consiga meter una
 * etiqueta en la página de todos los demás.
 *
 * Por eso el modelo guarda estructura y no HTML, y por eso aquí no hay ni habrá
 * `dangerouslySetInnerHTML`.
 */

describe("seguridad: un anunciante no puede inyectar nada", () => {
  it("una descripción con etiquetas se ve como TEXTO", () => {
    const { container } = render(
      <TextoConFormato texto="" formato={[{ t: '<img src=x onerror="alert(1)">' }]} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it("y un <script> tampoco llega a ser un elemento", () => {
    const { container } = render(
      <TextoConFormato texto="" formato={[{ t: "<script>robar()</script>", b: true }]} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("robar()");
  });

  it("el texto plano tampoco se interpreta", () => {
    // La rama sin formato es la que usan los 436 avisos que ya existen.
    const { container } = render(<TextoConFormato texto="<b>no soy negrita</b>" />);
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<b>no soy negrita</b>")).toBeInTheDocument();
  });

  it("un color inventado NO acaba en el atributo de estilo", () => {
    // Aunque la base y `validar` lo rechazan antes, el renderizador es la última
    // barrera: traduce por tabla, nunca copia lo que venga en el dato.
    const { container } = render(
      <TextoConFormato texto="" formato={[{ t: "x", c: "red; background: url(javascript:1)" as never }]} />,
    );
    expect(container.innerHTML).not.toContain("javascript");
    expect(container.innerHTML).not.toContain("background");
  });
});

describe("lo que sí se ve", () => {
  it("la negrita sale en negrita", () => {
    const { container } = render(
      <TextoConFormato texto="" formato={[{ t: "Depa " }, { t: "amoblado", b: true }]} />,
    );
    expect(container.querySelector(".font-bold")?.textContent).toBe("amoblado");
  });

  it("cada color usa su clase", () => {
    const { container } = render(
      <TextoConFormato texto="" formato={[{ t: "Urgente", c: "rojo" }]} />,
    );
    expect(container.querySelector(".text-red-600")?.textContent).toBe("Urgente");
  });

  it("negrita y color a la vez", () => {
    const { container } = render(
      <TextoConFormato texto="" formato={[{ t: "Ya", b: true, c: "verde" }]} />,
    );
    const span = container.querySelector(".font-bold");
    expect(span?.className).toContain("text-emerald-600");
  });

  it("el texto se conserva entero, con sus saltos de línea", () => {
    const { container } = render(
      <TextoConFormato texto="" formato={[{ t: "Uno\n" }, { t: "Dos", b: true }]} />,
    );
    expect(container.textContent).toBe("Uno\nDos");
  });

  it("un trozo sin marcas no se envuelve en clases de más", () => {
    const { container } = render(<TextoConFormato texto="" formato={[{ t: "simple" }]} />);
    expect(container.querySelector(".font-bold")).toBeNull();
    expect(container.textContent).toBe("simple");
  });
});

describe("los avisos de siempre", () => {
  it("sin formato, pinta el texto plano", () => {
    // Un solo componente para los dos casos: la ficha no tiene que decidir.
    render(<TextoConFormato texto="Descripción de toda la vida" formato={null} />);
    expect(screen.getByText("Descripción de toda la vida")).toBeInTheDocument();
  });

  it("una lista vacía cuenta como sin formato", () => {
    render(<TextoConFormato texto="Texto" formato={[]} />);
    expect(screen.getByText("Texto")).toBeInTheDocument();
  });
});
