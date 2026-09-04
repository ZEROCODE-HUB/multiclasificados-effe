import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditorDeTexto } from "@/components/EditorDeTexto";
import { COLORES } from "@/lib/textoConFormato";

/**
 * La barra de formato de la descripción.
 *
 * Aquí no se prueba que dar formato funcione —eso vive en `editorDom` y en
 * `textoConFormato`, sin DOM de por medio— sino DÓNDE ESTÁ CADA COSA, que es lo
 * que se rompió en el móvil y lo que nadie recordará dentro de tres meses.
 */

const montar = () =>
  render(<EditorDeTexto valor={[]} onChange={() => {}} placeholder="Describe…" />);

describe("la barra va DEBAJO del campo", () => {
  it("y no encima", () => {
    // EL MOTIVO, que es lo único que importa de esta prueba: al seleccionar una
    // palabra, Android e iOS sacan su menú de «Cortar / Copiar / Pegar» JUSTO
    // ENCIMA de lo seleccionado. Con la barra arriba, ese menú la tapaba entera
    // —y precisamente con algo seleccionado, que es cuando hace falta—.
    //
    // Si alguien la devuelve arriba porque «es donde va normalmente», esta
    // prueba falla y el comentario del componente explica por qué no.
    const { container } = montar();
    const raiz = container.firstElementChild!;
    const campo = screen.getByRole("textbox", { name: /descripción/i });
    const barra = screen.getByRole("toolbar", { name: /formato/i });

    const posicion = (el: Element) => {
      let n: Element | null = el;
      while (n && n.parentElement !== raiz) n = n.parentElement;
      return Array.from(raiz.children).indexOf(n!);
    };

    expect(posicion(campo)).toBeLessThan(posicion(barra));
  });

  it("y las dos piezas se ven como una sola caja", () => {
    // El campo redondea arriba y la barra abajo, sin borde entre medias. Si se
    // invirtieran los bordes al mover la barra, quedarían dos cajas sueltas.
    const { container } = montar();
    const campo = screen.getByRole("textbox", { name: /descripción/i });
    const barra = container.querySelector('[role="toolbar"]')!;

    expect(campo.className).toContain("rounded-t-md");
    expect(barra.className).toContain("rounded-b-md");
    expect(barra.className).toContain("border-t-0");
  });
});

describe("lo que ofrece la barra", () => {
  it("negrita, quitar el color, los atajos y el selector libre", () => {
    montar();
    expect(screen.getByRole("button", { name: "Negrita" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /quitar el color/i })).toBeInTheDocument();
    for (const c of COLORES) {
      expect(screen.getByRole("button", { name: `Color ${c.nombre}` })).toBeInTheDocument();
    }
    // El selector libre es lo que pidió el cliente: cualquier color, no cuatro.
    expect(screen.getByLabelText(/elegir cualquier color/i)).toBeInTheDocument();
  });

  it("el selector libre es un `input` de color de verdad", () => {
    // Y no una rueda propia: en el móvil abre el selector del sistema, con su
    // cuentagotas y sus colores recientes.
    montar();
    const suelto = screen.getByLabelText(/elegir cualquier color/i) as HTMLInputElement;
    expect(suelto.type).toBe("color");
  });

  it("el campo va a 16px, o iOS hace zoom solo al enfocarlo", () => {
    // Corregido en la v8.7 y fácil de volver a romper con un `text-sm`.
    montar();
    expect(screen.getByRole("textbox", { name: /descripción/i }).className)
      .toContain("text-base");
  });
});
