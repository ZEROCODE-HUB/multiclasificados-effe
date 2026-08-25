import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import { IrArriba } from "@/components/IrArriba";

/**
 * Que cada pantalla nueva empiece por arriba.
 *
 * Lo reportó el cliente: desde el pie de la portada —al final de una página
 * larguísima— el enlace "Publicar aviso" dejaba al usuario a media altura del
 * formulario, sobre el bloque "05 Duración y adicionales", como si la app se
 * hubiera saltado los cuatro primeros pasos. El navegador conserva el
 * desplazamiento entre rutas de una SPA y nadie lo devolvía a cero.
 */
const Larga = ({ children }: { children?: React.ReactNode }) => (
  <div style={{ height: 4000 }}>{children}</div>
);

let scrollTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
});
afterEach(() => vi.unstubAllGlobals());

describe("volver arriba al cambiar de pantalla", () => {
  it("al ir a otra ruta, la página arranca en el principio", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <IrArriba />
        <Routes>
          <Route path="/" element={<Larga><Link to="/publicar">Publicar aviso</Link></Larga>} />
          <Route path="/publicar" element={<Larga>Formulario</Larga>} />
        </Routes>
      </MemoryRouter>,
    );
    scrollTo.mockClear(); // el montaje inicial no cuenta

    fireEvent.click(screen.getByText("Publicar aviso"));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });

  it("cambiar solo los filtros del buscador NO mueve la página", () => {
    // Los filtros y la paginación viajan en la query (?cat=, ?page=). Saltar
    // arriba en cada tecleo sería peor que el problema que se arregla.
    const Buscador = () => {
      const navigate = useNavigate();
      return <button onClick={() => navigate("/buscar?cat=autos")}>Filtrar</button>;
    };
    render(
      <MemoryRouter initialEntries={["/buscar"]}>
        <IrArriba />
        <Routes><Route path="/buscar" element={<Buscador />} /></Routes>
      </MemoryRouter>,
    );
    scrollTo.mockClear();

    fireEvent.click(screen.getByText("Filtrar"));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("con el botón «atrás» se respeta dónde estaba el usuario", () => {
    // Ahí el navegador restaura la posición, y eso es justo lo que se espera:
    // volver de un aviso a los resultados y encontrarlos donde se dejaron.
    const Ida = () => {
      const navigate = useNavigate();
      return (
        <>
          <button onClick={() => navigate("/aviso/1")}>Ver aviso</button>
          <button onClick={() => navigate(-1)}>Atrás</button>
        </>
      );
    };
    render(
      <MemoryRouter initialEntries={["/buscar"]}>
        <IrArriba />
        <Routes>
          <Route path="/buscar" element={<Ida />} />
          <Route path="/aviso/1" element={<button onClick={() => history.back()}>x</button>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Ver aviso"));
    scrollTo.mockClear();

    fireEvent.click(screen.getByText("x"));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
