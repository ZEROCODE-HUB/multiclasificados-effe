import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";
import { FichaDelPin } from "@/components/ListingsMap";

/**
 * La tarjetita que sale al pulsar un pin del mapa.
 *
 * EL FALLO QUE ESTO FIJA
 *
 * Esta ficha NO se pinta dentro del árbol de la aplicación: se monta con
 * `createRoot` sobre un nodo suelto que crea Google para su InfoWindow. Esa raíz
 * no hereda ningún contexto, tampoco el del Router.
 *
 * Llevaba un `<Link>` de react-router, que ahí lanza "useHref() may be used only
 * in the context of a <Router>". React abortaba el render y el nodo se quedaba
 * VACÍO: en producción la ventanita salía en blanco, con su X y nada más — se
 * veían los pines pero ningún aviso.
 *
 * Por eso estas pruebas montan la ficha **sin Router a propósito**. Es su
 * condición real de uso, y es justo lo que nadie estaba comprobando.
 */
const AVISO = {
  id: "a1", title: "Locales en ventas", description: "d",
  price: 500, currency: "PEN", category: "inmuebles", location: "Trujillo",
  imageUrl: "/foto.webp", date: "2026-08-01", featured: false,
  advertiser: "", views: 3, condition: "usado" as const,
  lat: -8.1, lng: -79.0,
} as never;

describe("se pinta SIN Router, que es como se usa", () => {
  it("no revienta y enseña el aviso", () => {
    prepararDom();
    render(<FichaDelPin l={AVISO} href="/aviso/a1" ir={vi.fn()} />);
    expect(screen.getByText("Locales en ventas")).toBeInTheDocument();
    expect(screen.getByText("Trujillo")).toBeInTheDocument();
  });

  it("con su precio y su categoría", () => {
    prepararDom();
    render(<FichaDelPin l={AVISO} href="/aviso/a1" ir={vi.fn()} />);
    expect(screen.getByText(/500/)).toBeInTheDocument();
    expect(screen.getByText("inmuebles")).toBeInTheDocument();
  });

  it("y con su imagen: la ficha sin foto no dice nada de un aviso", () => {
    prepararDom();
    render(<FichaDelPin l={AVISO} href="/aviso/a1" ir={vi.fn()} />);
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Locales en ventas");
  });
});

describe("el enlace", () => {
  it("tiene href de verdad: así funciona «abrir en pestaña nueva»", () => {
    prepararDom();
    render(<FichaDelPin l={AVISO} href="/aviso/a1" ir={vi.fn()} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/aviso/a1");
  });

  it("el clic normal navega dentro de la app, sin recargarla", () => {
    prepararDom();
    const ir = vi.fn();
    render(<FichaDelPin l={AVISO} href="/aviso/a1" ir={ir} />);
    fireEvent.click(screen.getByRole("link"), { button: 0 });
    expect(ir).toHaveBeenCalledWith("/aviso/a1");
  });

  it("pero con Ctrl se le deja al navegador abrir su pestaña", () => {
    prepararDom();
    const ir = vi.fn();
    render(<FichaDelPin l={AVISO} href="/aviso/a1" ir={ir} />);
    fireEvent.click(screen.getByRole("link"), { ctrlKey: true, button: 0 });
    expect(ir).not.toHaveBeenCalled();
  });
});
