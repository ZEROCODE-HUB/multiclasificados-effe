import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, within, fireEvent } from "@testing-library/react";
import { useRef, useState } from "react";
import { prepararDom } from "./domPolyfills";

/**
 * Publicar tiene que ser marcar un punto en el mapa y nada más.
 *
 * Antes este formulario pedía el departamento en un desplegable, el distrito en
 * una caja de texto, y dejaba el mapa como un extra opcional: tres cosas que
 * rellenar para decir una sola, y encima la única exacta era la que no se pedía.
 */

beforeEach(prepararDom);

/**
 * El mapa de Google no se puede montar en jsdom (no hay medidas ni lienzo), así
 * que se sustituye por lo mínimo: un div, un enganche para simular el toque en
 * el mapa y unos marcadores de mentira. Que el mapa REAL se pinte y responda se
 * comprueba en Chromium (e2e/locationPicker.spec.ts).
 */
const mapa: {
  click?: (e: { latLng: { lat: () => number; lng: () => number } }) => void;
  dragend?: (e: { latLng: { lat: () => number; lng: () => number } }) => void;
} = {};

vi.mock("@/lib/googleMaps", async () => {
  const React = await import("react");
  const marcadorFalso = class {
    map: unknown = null;
    position: unknown;
    constructor(o: Record<string, unknown>) { Object.assign(this, o); }
    addListener(evento: string, cb: (e: unknown) => void) {
      if (evento === "dragend") mapa.dragend = cb as never;
      return { remove() {} };
    }
  };
  return {
    useMapaDeGoogle: (_o: unknown, alCrear?: (m: unknown, l: unknown) => void) => {
      const contenedor = React.useRef<HTMLDivElement | null>(null);
      const libs = { marker: { AdvancedMarkerElement: marcadorFalso } };
      const m = React.useMemo(() => ({
        addListener: (evento: string, cb: (e: unknown) => void) => {
          if (evento === "click") mapa.click = cb as never;
          return { remove() {} };
        },
        panTo: () => {},
        getZoom: () => 16,
        setZoom: () => {},
      }), []);
      React.useEffect(() => { alCrear?.(m, libs); }, []);
      return { contenedor, mapa: m, libs, estado: "listo" as const };
    },
    textoDeEstadoDelMapa: () => null,
    hayMapasDeGoogle: () => true,
  };
});

const ubicacionDeCoordenadas = vi.fn();
const sugerirDirecciones = vi.fn();
const detalleDeLugar = vi.fn();
vi.mock("@/lib/geocode", () => ({
  ubicacionDeCoordenadas: (...a: unknown[]) => ubicacionDeCoordenadas(...a),
  sugerirDirecciones: (...a: unknown[]) => sugerirDirecciones(...a),
  detalleDeLugar: (...a: unknown[]) => detalleDeLugar(...a),
  nuevaSesionDeBusqueda: () => "sesion-de-prueba",
}));

import { LocationPicker } from "@/components/LocationPicker";

/** Envoltorio con estado: el componente es controlado por su formulario. */
function Formulario() {
  const [department, setDepartment] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  return (
    <>
      {/* El <output> de abajo repite los valores para poder comprobarlos, así
          que las búsquedas de texto se acotan aquí dentro. */}
      <div data-testid="ficha">
      <LocationPicker
        department={department}
        onDepartmentChange={setDepartment}
        location={location}
        onLocationChange={setLocation}
        lat={coords?.lat ?? null}
        lng={coords?.lng ?? null}
        onCoordsChange={(la, ln) => setCoords(la != null && ln != null ? { lat: la, lng: ln } : null)}
        required
      />
      </div>
      <output data-testid="valores">{`${department ?? "—"}|${location || "—"}|${coords ? "con punto" : "sin punto"}`}</output>
    </>
  );
}

const valores = () => screen.getByTestId("valores").textContent;
const punto = (lat: number, lng: number) => ({ latLng: { lat: () => lat, lng: () => lng } });
const tocarElMapa = async () => {
  await act(async () => { mapa.click?.(punto(-12.1219, -77.0297)); });
};

beforeEach(() => {
  ubicacionDeCoordenadas.mockReset().mockResolvedValue({
    region: "Provincia de Lima", referencia: "Miraflores, Lima",
  });
  sugerirDirecciones.mockReset().mockResolvedValue([]);
  detalleDeLugar.mockReset().mockResolvedValue(null);
});

describe("Ubicación al publicar — el mapa manda", () => {
  it("de entrada NO pide departamento ni distrito: solo el mapa", () => {
    render(<Formulario />);
    expect(screen.getByTestId("mapa")).toBeInTheDocument();
    expect(screen.queryByLabelText(/departamento/i)).toBeNull();
    expect(screen.queryByLabelText(/distrito o referencia/i)).toBeNull();
  });

  it("el mapa está a la vista, no escondido tras un enlace", () => {
    render(<Formulario />);
    // Antes había que pulsar "Marcar el punto en el mapa (opcional)".
    expect(screen.queryByText(/opcional\)/i)).toBeNull();
    expect(screen.getByText(/Marca en el mapa dónde está tu aviso/i)).toBeInTheDocument();
  });

  it("al tocar el mapa se rellenan solos el departamento y la referencia", async () => {
    render(<Formulario />);
    expect(valores()).toBe("—|—|sin punto");

    await tocarElMapa();

    await waitFor(() => expect(valores()).toBe("15|Miraflores, Lima|con punto"));
  });

  it("arrastrar el pin vuelve a deducir la zona", async () => {
    render(<Formulario />);
    await tocarElMapa();
    await waitFor(() => expect(valores()).toBe("15|Miraflores, Lima|con punto"));

    ubicacionDeCoordenadas.mockResolvedValue({ region: "Arequipa", referencia: "Cayma, Arequipa" });
    await act(async () => { mapa.dragend?.(punto(-16.38, -71.53)); });

    await waitFor(() => expect(valores()).toBe("04|Cayma, Arequipa|con punto"));
  });

  it("lo deducido se enseña como una frase, no como campos que rellenar", async () => {
    render(<Formulario />);
    await tocarElMapa();

    const ficha = within(screen.getByTestId("ficha"));
    await waitFor(() => expect(ficha.getByText(/Miraflores, Lima/)).toBeInTheDocument());
    expect(ficha.getByText(/Lima y Callao/)).toBeInTheDocument();
    // Y sigue sin haber desplegable ni caja de texto que atender.
    expect(screen.queryByLabelText(/departamento/i)).toBeNull();
  });

  it("se puede corregir a mano si el anunciante quiere", async () => {
    render(<Formulario />);
    await tocarElMapa();
    const ficha = within(screen.getByTestId("ficha"));
    await waitFor(() => expect(ficha.getByText(/Miraflores, Lima/)).toBeInTheDocument());

    await act(async () => { screen.getByRole("button", { name: /corregir/i }).click(); });

    expect(screen.getByLabelText(/departamento/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/distrito o referencia/i)).toBeInTheDocument();
  });
});

/**
 * La caja de la dirección sugiere sola mientras se escribe.
 *
 * Antes había que escribir y pulsar un botón "Buscar" para que apareciera la
 * lista: un paso de más que no existe en ningún buscador de direcciones.
 */
describe("Ubicación al publicar — sugerencias al escribir", () => {
  const LARCO = { id: "place-larco", titulo: "Av. José Larco 1234", detalle: "Miraflores, Lima" };
  const AREQUIPA = { id: "place-arequipa", titulo: "Miraflores", detalle: "Arequipa" };

  const escribir = (texto: string) =>
    fireEvent.change(screen.getByPlaceholderText(/dirección o un distrito/i), { target: { value: texto } });

  it("ya no hay botón que pulsar", () => {
    render(<Formulario />);
    expect(screen.queryByRole("button", { name: /^buscar$/i })).toBeNull();
  });

  it("escribir basta: las sugerencias salen solas", async () => {
    sugerirDirecciones.mockResolvedValue([LARCO, AREQUIPA]);
    render(<Formulario />);
    escribir("av larco");

    expect(await screen.findByText("Av. José Larco 1234")).toBeInTheDocument();
    // Y con su contexto, que es lo que distingue dos sitios de igual nombre.
    expect(screen.getByText("Arequipa")).toBeInTheDocument();
  });

  it("con dos letras no consulta nada: no dice nada útil y gasta llamadas", async () => {
    render(<Formulario />);
    escribir("mi");
    await new Promise((r) => setTimeout(r, 500));
    expect(sugerirDirecciones).not.toHaveBeenCalled();
  });

  it("teclear seguido lanza UNA consulta, no una por letra", async () => {
    sugerirDirecciones.mockResolvedValue([LARCO]);
    render(<Formulario />);
    escribir("mira");
    escribir("miraf");
    escribir("miraflores");

    await waitFor(() => expect(sugerirDirecciones).toHaveBeenCalledTimes(1));
    expect(sugerirDirecciones.mock.calls[0][0]).toBe("miraflores");
  });

  it("todas las teclas de una búsqueda comparten sesión: se factura una, no diez", async () => {
    // Sin el identificador de sesión, Places cobra cada pulsación por separado.
    sugerirDirecciones.mockResolvedValue([LARCO]);
    detalleDeLugar.mockResolvedValue({
      lat: -12.12, lng: -77.03, region: "Provincia de Lima", referencia: "Miraflores, Lima",
    });
    render(<Formulario />);
    escribir("av larco");
    await waitFor(() => expect(sugerirDirecciones).toHaveBeenCalledTimes(1));

    const sesion = (sugerirDirecciones.mock.calls[0][1] as { sesion?: string }).sesion;
    expect(sesion).toBeTruthy();

    fireEvent.mouseDown(await screen.findByText("Av. José Larco 1234"));
    // Y la MISMA sesión cierra la búsqueda al pedir el detalle del lugar.
    await waitFor(() => expect(detalleDeLugar).toHaveBeenCalledWith(LARCO.id, sesion));
  });

  it("elegir una sugerencia marca el punto y rellena el departamento", async () => {
    sugerirDirecciones.mockResolvedValue([LARCO]);
    detalleDeLugar.mockResolvedValue({
      lat: -12.1215, lng: -77.0301, region: "Provincia de Lima", referencia: "Miraflores, Lima",
    });
    render(<Formulario />);
    escribir("av larco");

    fireEvent.mouseDown(await screen.findByText("Av. José Larco 1234"));

    await waitFor(() => expect(valores()).toBe("15|Miraflores, Lima|con punto"));
    // Una sola llamada: el punto y la zona vienen juntos, sin volver a preguntar.
    expect(ubicacionDeCoordenadas).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("si el lugar elegido no da punto, se piden los campos a mano", async () => {
    // Antes que dejar el aviso sin departamento —invisible en las búsquedas—
    // se pregunta.
    sugerirDirecciones.mockResolvedValue([LARCO]);
    detalleDeLugar.mockResolvedValue(null);
    render(<Formulario />);
    escribir("av larco");
    fireEvent.mouseDown(await screen.findByText("Av. José Larco 1234"));

    expect(await screen.findByLabelText(/departamento/i)).toBeInTheDocument();
  });

  it("al elegir no se dispara otra búsqueda por haber cambiado el texto", async () => {
    sugerirDirecciones.mockResolvedValue([LARCO]);
    detalleDeLugar.mockResolvedValue({ lat: -12.1, lng: -77, region: "Provincia de Lima", referencia: "Miraflores" });
    render(<Formulario />);
    escribir("av larco");
    fireEvent.mouseDown(await screen.findByText("Av. José Larco 1234"));

    await new Promise((r) => setTimeout(r, 600));
    expect(sugerirDirecciones).toHaveBeenCalledTimes(1);
  });

  it("se puede elegir con el teclado, sin tocar el ratón", async () => {
    sugerirDirecciones.mockResolvedValue([LARCO, AREQUIPA]);
    detalleDeLugar.mockResolvedValue({ lat: -16.38, lng: -71.5, region: "Arequipa", referencia: "Miraflores, Arequipa" });
    render(<Formulario />);
    escribir("mira");
    await screen.findByRole("listbox");

    const caja = screen.getByPlaceholderText(/dirección o un distrito/i);
    fireEvent.keyDown(caja, { key: "ArrowDown" });   // primera
    fireEvent.keyDown(caja, { key: "ArrowDown" });   // segunda: la de Arequipa
    fireEvent.keyDown(caja, { key: "Enter" });

    await waitFor(() => expect(detalleDeLugar).toHaveBeenCalledWith(AREQUIPA.id, expect.anything()));
  });

  it("una respuesta que llega tarde no pisa a la más reciente", async () => {
    // El caso real: se escribe "mira", la consulta se atasca, se sigue
    // escribiendo "miraflores", contesta la segunda y DESPUÉS la primera. Sin
    // control de turno, la lista acabaría enseñando lo que ya no se busca.
    let soltarLaLenta!: (v: unknown) => void;
    const lenta = new Promise((r) => { soltarLaLenta = r; });
    sugerirDirecciones
      .mockImplementationOnce(() => lenta)
      .mockResolvedValue([AREQUIPA]);

    render(<Formulario />);
    escribir("mira");
    await waitFor(() => expect(sugerirDirecciones).toHaveBeenCalledTimes(1));
    escribir("miraflores");
    await waitFor(() => expect(sugerirDirecciones).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Miraflores")).toBeInTheDocument();

    await act(async () => { soltarLaLenta([LARCO]); });

    // Sigue mandando la búsqueda buena.
    expect(screen.queryByText("Av. José Larco 1234")).toBeNull();
    expect(screen.getByText("Miraflores")).toBeInTheDocument();
  });

  it("si no hay ninguna dirección se dice, y el mapa sigue estando", async () => {
    sugerirDirecciones.mockResolvedValue([]);
    render(<Formulario />);
    escribir("asdfghjkl");

    expect(await screen.findByText(/No encontramos esa dirección/i)).toBeInTheDocument();
    expect(screen.getByTestId("mapa")).toBeInTheDocument();
  });

  it("si el servicio de direcciones falla, el mapa sigue sirviendo", async () => {
    // sugerirDirecciones ya devuelve [] ante cualquier fallo (nunca lanza), así
    // que lo que se comprueba aquí es que eso no deja el formulario inservible.
    sugerirDirecciones.mockResolvedValue([]);
    render(<Formulario />);
    escribir("av larco");
    await screen.findByText(/No encontramos esa dirección/i);

    await tocarElMapa();
    await waitFor(() => expect(valores()).toBe("15|Miraflores, Lima|con punto"));
  });
});

describe("Ubicación al publicar — cuando la deducción falla", () => {
  it("si Google no identifica la zona, se piden los campos a mano", async () => {
    // Sin esto el aviso se quedaría sin departamento y no saldría en ninguna
    // búsqueda por ubicación, sin que el anunciante se entere.
    ubicacionDeCoordenadas.mockResolvedValue({ region: null, referencia: null });
    render(<Formulario />);
    await tocarElMapa();

    expect(await screen.findByLabelText(/departamento/i)).toBeInTheDocument();
    expect(screen.getByText(/No pudimos identificar esa zona/i)).toBeInTheDocument();
  });

  it("aunque no sepa el departamento, el punto SÍ se guarda", async () => {
    ubicacionDeCoordenadas.mockResolvedValue({ region: null, referencia: null });
    render(<Formulario />);
    await tocarElMapa();
    await waitFor(() => expect(valores()).toBe("—|—|con punto"));
  });

  it("si la región no se reconoce, no se inventa un departamento", async () => {
    ubicacionDeCoordenadas.mockResolvedValue({ region: "Antártida Chilena", referencia: "Base O'Higgins" });
    render(<Formulario />);
    await tocarElMapa();
    await waitFor(() => expect(screen.getByLabelText(/departamento/i)).toBeInTheDocument());
    expect(valores()!.split("|")[0]).toBe("—");
  });
});
