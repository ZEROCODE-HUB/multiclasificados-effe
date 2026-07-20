// El selector de categoría del hero es un `role="combobox"` de Radix. Ese rol no
// toma su nombre accesible del contenido (ARIA: "name from author only"), así que
// el texto visible "Categoría" NO alcanza: hace falta un aria-label explícito o
// los lectores de pantalla anuncian solo "button".
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HeroSearch } from "@/components/HeroSearch";

vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => [{ id: "autos", name: "Autos" }],
}));

describe("HeroSearch · accesibilidad", () => {
  it("el selector de categoría tiene nombre accesible", () => {
    render(<MemoryRouter><HeroSearch /></MemoryRouter>);
    expect(screen.getByRole("combobox")).toHaveAccessibleName("Categoría");
  });

  it("el campo de búsqueda y el botón también son alcanzables por nombre", () => {
    render(<MemoryRouter><HeroSearch /></MemoryRouter>);
    expect(screen.getByPlaceholderText("¿Qué estás buscando?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buscar" })).toBeInTheDocument();
  });
});
