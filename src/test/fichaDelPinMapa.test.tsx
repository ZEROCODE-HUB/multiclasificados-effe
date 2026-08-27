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
    render(<FichaDelPin l={AVISO} href="/aviso/a1" ir={vi.fn()} mostrarPrecio />);
    expect(screen.getByText("Locales en ventas")).toBeInTheDocument();
    expect(screen.getByText("Trujillo")).toBeInTheDocument();
  });

  it("con su precio y su categoría", () => {
    prepararDom();
    render(<FichaDelPin l={AVISO} href="/aviso/a1" ir={vi.fn()} mostrarPrecio />);
    expect(screen.getByText(/500/)).toBeInTheDocument();
    expect(screen.getByText("inmuebles")).toBeInTheDocument();
  });

  it("y con su imagen: la ficha sin foto no dice nada de un aviso", () => {
    prepararDom();
    render(<FichaDelPin l={AVISO} href="/aviso/a1" ir={vi.fn()} mostrarPrecio />);
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Locales en ventas");
  });
});

describe("el enlace", () => {
  it("tiene href de verdad: así funciona «abrir en pestaña nueva»", () => {
    prepararDom();
    render(<FichaDelPin l={AVISO} href="/aviso/a1" ir={vi.fn()} mostrarPrecio />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/aviso/a1");
  });

  it("el clic normal navega dentro de la app, sin recargarla", () => {
    prepararDom();
    const ir = vi.fn();
    render(<FichaDelPin l={AVISO} href="/aviso/a1" ir={ir} mostrarPrecio />);
    fireEvent.click(screen.getByRole("link"), { button: 0 });
    expect(ir).toHaveBeenCalledWith("/aviso/a1");
  });

  it("pero con Ctrl se le deja al navegador abrir su pestaña", () => {
    prepararDom();
    const ir = vi.fn();
    render(<FichaDelPin l={AVISO} href="/aviso/a1" ir={ir} mostrarPrecio />);
    fireEvent.click(screen.getByRole("link"), { ctrlKey: true, button: 0 });
    expect(ir).not.toHaveBeenCalled();
  });
});

/**
 * Desde que la ficha usa `CuerpoDeAviso` —el mismo que la tarjeta del buscador—
 * ya no puede volver a divergir. Antes se pintaba a mano y le faltaba todo esto.
 */
describe("la ficha enseña lo mismo que la tarjeta del buscador", () => {
  const con = (extra: Record<string, unknown>) =>
    ({ ...(AVISO as object), ...extra }) as never;

  it("el marco dorado del destacado", () => {
    prepararDom();
    const { container } = render(
      <FichaDelPin l={con({ featured: true })} href="/a" ir={vi.fn()} mostrarPrecio />);
    expect((container.firstChild as HTMLElement).className).toContain("amber");
  });

  it("los distintivos de urgente y confidencial", () => {
    prepararDom();
    render(<FichaDelPin l={con({ urgent: true, confidential: true })} href="/a" ir={vi.fn()} mostrarPrecio />);
    expect(screen.getByRole("img", { name: /urgente/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /confidencial/i })).toBeInTheDocument();
  });

  it("el sello del anunciante verificado", () => {
    prepararDom();
    render(<FichaDelPin l={con({ advertiserVerified: true })} href="/a" ir={vi.fn()} mostrarPrecio />);
    expect(screen.getByRole("img", { name: /anunciante verificado/i })).toBeInTheDocument();
  });

  it("el aviso de que trae video", () => {
    prepararDom();
    render(<FichaDelPin l={con({ videoCount: 3 })} href="/a" ir={vi.fn()} mostrarPrecio />);
    expect(screen.getByRole("img", { name: /incluye video/i })).toBeInTheDocument();
  });

  it("el precio ENTERO, no el abreviado del pin", () => {
    // El pin abrevia por falta de sitio: "S/ 250K". La ficha tiene 208 px de
    // ancho y ensenaba lo mismo, asi que un aviso valia distinto segun donde se
    // mirase.
    prepararDom();
    render(<FichaDelPin l={con({ price: 250000 })} href="/a" ir={vi.fn()} mostrarPrecio />);
    expect(screen.getByText("S/ 250,000.00")).toBeInTheDocument();
    expect(screen.queryByText(/250K/)).toBeNull();
  });
});

describe("los precios no se cuelan por el mapa", () => {
  it("sin sesion no se ensena el precio, igual que en el buscador", () => {
    // Si la ficha los mostrase, seria la puerta de atras para ver precios sin
    // cuenta: basta con pulsar pines.
    prepararDom();
    render(<FichaDelPin l={AVISO} href="/a" ir={vi.fn()} mostrarPrecio={false} />);
    expect(screen.queryByText(/500/)).toBeNull();
    // Pero el aviso sigue siendo visible: es un escaparate, no una puerta.
    expect(screen.getByText("Locales en ventas")).toBeInTheDocument();
    expect(screen.getByText("Trujillo")).toBeInTheDocument();
  });
});
