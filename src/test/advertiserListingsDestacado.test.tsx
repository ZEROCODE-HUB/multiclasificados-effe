import { describe, it, expect, vi, beforeEach } from "vitest";
import { EnlaceFalso } from "./routerStubs";
import { render, screen, waitFor } from "@testing-library/react";
import { prepararDom } from "./domPolyfills";

/**
 * Llegar a "Mis avisos" con `?aviso=<id>` señala ESE aviso.
 *
 * Lo pidió el cliente por dos caminos que acaban en el mismo sitio: la campana
 * de "tu aviso vence en X días" dejaba en la lista general —con veinte avisos, a
 * buscar cuál era, justo cuando quedan horas para renovar—, y al terminar de
 * renovar tampoco se veía el aviso renovado.
 *
 * El caso que más importa de todos es el de abajo: que **cambie de pestaña**. Si
 * el aviso está en "Vencidos" y la pantalla abre en "Activos", el usuario ve una
 * lista donde su aviso no está y da por hecho que lo perdió.
 */
beforeEach(prepararDom);

const activo = {
  id: "aaa-111", title: "Depa en Miraflores", description: "d", price: 100, currency: "PEN",
  category: "inmuebles", location: "Lima", imageUrl: "x", date: "2026-08-01", featured: false,
  advertiser: "", views: 5, status: "active" as const, expiresAt: null, condition: "nuevo" as const,
};
const vencido = { ...activo, id: "bbb-222", title: "Auto que ya vencio", status: "expired" as const };

vi.mock("@/lib/listings", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  fetchMyListings: () => Promise.resolve([activo, vencido]),
  updateListing: vi.fn().mockResolvedValue(undefined),
  deleteListing: vi.fn().mockResolvedValue(undefined),
  setListingStatus: vi.fn().mockResolvedValue(undefined),
  replaceMainListingPhoto: vi.fn().mockResolvedValue("x"),
}));

vi.mock("@/components/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// El id que viaja en la URL, controlado por cada prueba.
const params = { aviso: "" };
vi.mock("react-router-dom", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [
      new URLSearchParams(params.aviso ? { aviso: params.aviso } : {}),
      vi.fn(),
    ],
    Link: EnlaceFalso,
  };
});

// Sin esto, la consulta de pagos en espera resuelve DESPUES de que la prueba
// termine y React intenta actualizar un componente ya desmontado: la suite
// pasaba en verde pero dejaba un error suelto al final. Aqui no se prueba eso.
vi.mock("@/lib/pagoManual", async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  misPagosEnEspera: () => Promise.resolve([]),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import AdvertiserListings from "@/pages/advertiser/AdvertiserListings";

beforeEach(() => { params.aviso = ""; });

describe("llegar con ?aviso=", () => {
  it("resalta el aviso señalado", async () => {
    params.aviso = activo.id;
    render(<AdvertiserListings />);
    await screen.findByText("Depa en Miraflores");
    await waitFor(() => {
      const fila = screen.getByText("Depa en Miraflores").closest("[class*='ring-secondary']");
      expect(fila).toBeTruthy();
    });
  });

  it("y el resto de avisos NO se resaltan", async () => {
    params.aviso = activo.id;
    render(<AdvertiserListings />);
    await screen.findByText("Depa en Miraflores");
    await waitFor(() => expect(screen.getByText("Depa en Miraflores").closest("[class*='ring-secondary']")).toBeTruthy());
    // El vencido está en otra pestaña; lo que se comprueba es que el resaltado
    // no se aplica a todo por un fallo de comparación.
    const resaltados = document.querySelectorAll("[class*='ring-secondary']");
    expect(resaltados).toHaveLength(1);
  });

  it("CAMBIA DE PESTAÑA si el aviso está en otra", async () => {
    // Es el caso que hace útil todo lo demás. La pantalla abre en "Activos"; el
    // aviso está vencido. Sin este salto, el usuario ve una lista sin su aviso.
    params.aviso = vencido.id;
    render(<AdvertiserListings />);
    await waitFor(() => expect(screen.getByText("Auto que ya vencio")).toBeInTheDocument());
  });

  it("sin el parámetro no se resalta nada", async () => {
    render(<AdvertiserListings />);
    await screen.findByText("Depa en Miraflores");
    expect(document.querySelectorAll("[class*='ring-secondary']")).toHaveLength(0);
  });

  it("un id que no es suyo no rompe la pantalla", async () => {
    // Un enlace viejo, o de otra cuenta. La lista tiene que salir igual.
    params.aviso = "no-existe-este-aviso";
    render(<AdvertiserListings />);
    await screen.findByText("Depa en Miraflores");
    expect(document.querySelectorAll("[class*='ring-secondary']")).toHaveLength(0);
  });
});

describe("el marcado no se queda puesto", () => {
  it("se apaga solo pasados unos segundos", async () => {
    // Es para encontrar el aviso, no para dejarlo marcado: si se quedara, el
    // usuario creería que ese aviso tiene algo distinto de los demás.
    vi.useFakeTimers();
    try {
      params.aviso = activo.id;
      render(<AdvertiserListings />);
      await vi.advanceTimersByTimeAsync(50);
      expect(document.querySelectorAll("[class*='ring-secondary']").length).toBe(1);
      await vi.advanceTimersByTimeAsync(3000);
      expect(document.querySelectorAll("[class*='ring-secondary']").length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
