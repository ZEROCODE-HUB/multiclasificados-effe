import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";
import { SelectorDePais } from "@/components/SelectorDePais";

/** Abre el desplegable y devuelve la lista de opciones. */
async function abrir() {
  fireEvent.click(screen.getByRole("combobox"));
  return waitFor(() => screen.getByRole("listbox"));
}

function escribir(texto: string) {
  fireEvent.change(screen.getByPlaceholderText(/busca un país/i), { target: { value: texto } });
}

/** Los países visibles, en el orden en que se pintan. */
function opciones(): string[] {
  return screen.getAllByRole("option").map((o) => o.textContent ?? "");
}

describe("elegir país entre 249", () => {
  // Radix Popover y cmdk miden el DOM al montarse: sin esto no arrancan.
  beforeEach(() => { prepararDom(); vi.clearAllMocks(); });

  it("enseña el país elegido, no su código", async () => {
    render(<SelectorDePais value="RO" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Rumanía");
  });

  it("sin país elegido dice «Todos los países»", () => {
    render(<SelectorDePais value="" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Todos los países");
  });

  describe("el buscador", () => {
    it("encuentra sin tildes: «peru» llega a Perú", async () => {
      render(<SelectorDePais value="" onChange={vi.fn()} />);
      await abrir();
      escribir("peru");
      await waitFor(() => expect(opciones().join("|")).toContain("Perú"));
    });

    it("«rumania» encuentra Rumanía", async () => {
      render(<SelectorDePais value="" onChange={vi.fn()} />);
      await abrir();
      escribir("rumania");
      await waitFor(() => expect(opciones().some((t) => t.includes("Rumanía"))).toBe(true));
    });

    it("también busca por código ISO", async () => {
      render(<SelectorDePais value="" onChange={vi.fn()} />);
      await abrir();
      escribir("JP");
      await waitFor(() => expect(opciones().some((t) => t.includes("Japón"))).toBe(true));
    });

    it("si no hay nada, lo dice", async () => {
      render(<SelectorDePais value="" onChange={vi.fn()} />);
      await abrir();
      escribir("noexisteestepais");
      await waitFor(() => expect(screen.getByText(/ningún país con ese nombre/i)).toBeInTheDocument());
    });

    it("el campo de búsqueda no baja de 16px: iOS haría zoom solo", async () => {
      render(<SelectorDePais value="" onChange={vi.fn()} />);
      await abrir();
      expect(screen.getByPlaceholderText(/busca un país/i).className).toContain("text-base");
    });
  });

  it("elegir devuelve el código", async () => {
    const onChange = vi.fn();
    render(<SelectorDePais value="" onChange={onChange} />);
    await abrir();
    escribir("Bolivia");
    await waitFor(() => expect(opciones().length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("option", { name: /Bolivia/i }));
    expect(onChange).toHaveBeenCalledWith("BO");
  });

  describe("con el contador de avisos (el filtro de búsqueda)", () => {
    // Perú manda, y detrás los que tienen algo que enseñar.
    const conteo = { PE: 216, RO: 3, US: 2, BO: 2, EC: 1 };

    it("Perú va primero aunque otro tuviera más", async () => {
      render(<SelectorDePais value="" onChange={vi.fn()} conteo={{ ...conteo, PE: 1, CL: 999 }} />);
      await abrir();
      const soloPaises = opciones().filter((t) => !t.includes("Todos los países"));
      expect(soloPaises[0]).toContain("Perú");
    });

    it("después van los que tienen avisos, de más a menos", async () => {
      render(<SelectorDePais value="" onChange={vi.fn()} conteo={conteo} />);
      await abrir();
      const lista = opciones();
      const pos = (n: string) => lista.findIndex((t) => t.includes(n));
      expect(pos("Perú")).toBeLessThan(pos("Rumanía"));
      expect(pos("Rumanía")).toBeLessThan(pos("Ecuador"));
    });

    it("cada país lleva su número al lado", async () => {
      render(<SelectorDePais value="" onChange={vi.fn()} conteo={conteo} />);
      await abrir();
      const peru = screen.getByRole("option", { name: /Perú/i });
      expect(within(peru).getByText("216 avisos")).toBeInTheDocument();
      const ecuador = screen.getByRole("option", { name: /Ecuador/i });
      expect(within(ecuador).getByText("1 aviso")).toBeInTheDocument();
    });

    it("los países sin avisos siguen estando, y lo dicen", async () => {
      // Decidido con el cliente: ver "0 avisos" es una respuesta; que el país
      // no aparezca deja pensando si es que no existe.
      render(<SelectorDePais value="" onChange={vi.fn()} conteo={conteo} />);
      await abrir();
      escribir("Japón");
      await waitFor(() => {
        const japon = screen.getByRole("option", { name: /Japón/i });
        expect(within(japon).getByText("0 avisos")).toBeInTheDocument();
      });
    });

    it("sin contador no se inventa ningún número", async () => {
      render(<SelectorDePais value="" onChange={vi.fn()} />);
      await abrir();
      expect(screen.queryByText(/\d+ avisos?$/)).not.toBeInTheDocument();
    });
  });

  describe("«todos los países»", () => {
    it("solo aparece donde se pide (el filtro)", async () => {
      const { unmount } = render(<SelectorDePais value="PE" onChange={vi.fn()} incluirTodos />);
      await abrir();
      expect(screen.getByRole("option", { name: /todos los países/i })).toBeInTheDocument();
      unmount();

      render(<SelectorDePais value="PE" onChange={vi.fn()} />);
      await abrir();
      expect(screen.queryByRole("option", { name: /todos los países/i })).not.toBeInTheDocument();
    });

    it("elegirlo devuelve vacío, que es como se guarda", async () => {
      const onChange = vi.fn();
      render(<SelectorDePais value="PE" onChange={onChange} incluirTodos />);
      await abrir();
      fireEvent.click(screen.getByRole("option", { name: /todos los países/i }));
      expect(onChange).toHaveBeenCalledWith("");
    });
  });
});
