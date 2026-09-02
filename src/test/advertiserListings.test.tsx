import { describe, it, expect, vi, beforeEach } from "vitest";
import { EnlaceFalso } from "./routerStubs";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

// --- Polyfills que Radix (Dialog/Select) necesita en jsdom ---
beforeEach(prepararDom);

// --- Mocks de la capa de datos y del entorno ---
const updateListing = vi.fn().mockResolvedValue(undefined);
const deleteListing = vi.fn().mockResolvedValue(undefined);
const setListingStatus = vi.fn().mockResolvedValue(undefined);
const replaceMainListingPhoto = vi.fn().mockResolvedValue("https://cdn/new-photo.png");
const listing = {
  id: "abc-123", title: "Original title", description: "desc", price: 100, currency: "PEN",
  category: "inmuebles", location: "Lima", imageUrl: "x", date: "2026-07-01", featured: false,
  // VENCIDO a propósito. Desde que "Editar" de un aviso activo abre el
  // formulario entero (para poder cambiar fotos, vídeos o el PDF, que el modal
  // no lleva), el modal solo se usa en los estados que no se editan ahí:
  // vencido, rechazado y vendido. Estas pruebas son las del modal.
  advertiser: "", views: 5, status: "expired" as const, expiresAt: null, condition: "nuevo" as const,
};

// Conserva los exports reales (expiryInfo, tipos) y solo sustituye la capa de red:
// ListingRow usa expiryInfo, así que no puede quedar sin definir.
vi.mock("@/lib/listings", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  fetchMyListings: () => Promise.resolve([listing]),
  updateListing: (...a: unknown[]) => updateListing(...a),
  deleteListing: (...a: unknown[]) => deleteListing(...a),
  setListingStatus: (...a: unknown[]) => setListingStatus(...a),
  replaceMainListingPhoto: (...a: unknown[]) => replaceMainListingPhoto(...a),
}));

vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// El menú ⋮ de Radix, aplanado. En jsdom no se despliega —ni con `click` ni con
// `pointerDown`: mide posiciones y captura el puntero, y nada de eso existe
// aquí—, así que sus opciones se pintan en línea. Es el mismo recurso que usa
// `notificationsBellModal.test.tsx`.
//
// Lo que este archivo prueba es que "Eliminar" pida confirmación y borre, no la
// mecánica del desplegable. Que "Eliminar" esté en el menú y NO entre los
// botones de la fila se comprueba en `avisosAccionesYPrecio.test.tsx`, sobre el
// componente y sin Radix de por medio.
vi.mock("@/components/ui/dropdown-menu", () => {
  const Div = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    DropdownMenu: Div,
    DropdownMenuTrigger: Div,
    DropdownMenuContent: Div,
    DropdownMenuSeparator: () => null,
    DropdownMenuItem: ({ children, onSelect }: { children?: React.ReactNode; onSelect?: () => void }) => (
      <button type="button" role="menuitem" onClick={() => onSelect?.()}>{children}</button>
    ),
  };
});

const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual,
    useNavigate: () => navigate,
    // `?aviso=` hace que la pantalla abra en la pestaña donde está ese aviso.
    // Se usa aquí para llegar al vencido sin pelearse con las pestañas de Radix,
    // que no cambian con un `fireEvent.click` en jsdom.
    useSearchParams: () => [new URLSearchParams({ aviso: "abc-123" }), vi.fn()],
    Link: EnlaceFalso,
  };
});

// La consulta de pagos en espera resolvia DESPUES de que la prueba terminara, y
// React intentaba actualizar un componente ya desmontado: la suite pasaba en
// verde pero dejaba un error suelto al final, y solo a veces —depende de si esa
// promesa gana o pierde la carrera con el desmontaje. Es la clase de rojo
// intermitente que acaba ensenando a ignorar los rojos. Aqui no se prueba eso.
vi.mock("@/lib/pagoManual", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  misPagosEnEspera: () => Promise.resolve([]),
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import AdvertiserListings from "@/pages/advertiser/AdvertiserListings";

beforeEach(() => { updateListing.mockClear(); deleteListing.mockClear(); navigate.mockClear(); replaceMainListingPhoto.mockClear(); toast.mockClear(); });

/** El aviso de prueba está vencido; `?aviso=` abre esa pestaña sola. */
const abrirVencidos = () => screen.findByText("Original title");

describe("AdvertiserListings — editar / eliminar / ver", () => {
  it("EDITAR: abre el formulario con los datos y guarda el patch correcto", async () => {
    render(<AdvertiserListings />);
    await abrirVencidos();

    // Click en "Editar" (botón inline)
    fireEvent.click(screen.getAllByRole("button", { name: /editar/i })[0]);

    // El diálogo se abre con el título actual precargado
    const titleInput = await screen.findByDisplayValue("Original title");
    fireEvent.change(titleInput, { target: { value: "Título editado" } });

    // Cambiar precio
    const priceInput = screen.getByDisplayValue("100");
    fireEvent.change(priceInput, { target: { value: "250" } });

    // Guardar
    fireEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => expect(updateListing).toHaveBeenCalledTimes(1));
    expect(updateListing).toHaveBeenCalledWith("abc-123", expect.objectContaining({
      title: "Título editado",
      price: 250,
      currency: "PEN",
      location: "Lima",
      category_id: "inmuebles",
      condition: "nuevo",
    }));
  });

  it("EDITAR: no guarda si falta el título (validación)", async () => {
    render(<AdvertiserListings />);
    await abrirVencidos();
    fireEvent.click(screen.getAllByRole("button", { name: /editar/i })[0]);
    const titleInput = await screen.findByDisplayValue("Original title");
    fireEvent.change(titleInput, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(updateListing).not.toHaveBeenCalled();
  });

  it("EDITAR: cambiar la foto llama a replaceMainListingPhoto con el archivo", async () => {
    render(<AdvertiserListings />);
    await abrirVencidos();
    fireEvent.click(screen.getAllByRole("button", { name: /editar/i })[0]);
    await screen.findByDisplayValue("Original title");

    const fileInput = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File(["imagen"], "portada.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => expect(replaceMainListingPhoto).toHaveBeenCalledTimes(1));
    expect(replaceMainListingPhoto).toHaveBeenCalledWith("abc-123", file);
  });

  it("EDITAR: rechaza un archivo que no es imagen", async () => {
    render(<AdvertiserListings />);
    await abrirVencidos();
    fireEvent.click(screen.getAllByRole("button", { name: /editar/i })[0]);
    await screen.findByDisplayValue("Original title");

    const fileInput = document.querySelector("input[type=file]") as HTMLInputElement;
    const bad = new File(["texto"], "archivo.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [bad], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(replaceMainListingPhoto).not.toHaveBeenCalled();
  });

  it("VER: navega al detalle del aviso", async () => {
    render(<AdvertiserListings />);
    await abrirVencidos();
    fireEvent.click(screen.getByRole("button", { name: /^ver$/i }));
    expect(navigate).toHaveBeenCalledWith("/aviso/abc-123");
  });

  it("ELIMINAR: pide confirmación y borra el aviso", async () => {
    // "Eliminar" vive ahora en el menú ⋮ y no entre los botones de la fila
    // (punto 05). Es destructiva y estaba pegada a "Editar", a un dedo de
    // distancia en el móvil; y además salía por duplicado, porque también
    // estaba en el menú.
    render(<AdvertiserListings />);
    await abrirVencidos();

    fireEvent.click(await screen.findByRole("menuitem", { name: /eliminar/i }));

    // Confirmación
    const confirmBtn = await screen.findByRole("button", { name: /^eliminar$/i });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(deleteListing).toHaveBeenCalledWith("abc-123"));
  });
});
