import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LocationPicker } from "@/components/LocationPicker";

// Antes, la ubicación del aviso era texto libre y marcar el punto en el mapa era
// OPCIONAL — y un aviso sin coordenadas no aparece en ninguna búsqueda por
// cercanía. Ahora se elige la zona de un catálogo y eso ya deja coordenadas
// puestas: es lo que garantiza que todo aviso nuevo sea localizable.

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  window.matchMedia ??= (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});

function montar(location = "", lat: number | null = null, lng: number | null = null) {
  const onLocationChange = vi.fn();
  const onCoordsChange = vi.fn();
  render(
    <LocationPicker
      location={location}
      onLocationChange={onLocationChange}
      lat={lat}
      lng={lng}
      onCoordsChange={onCoordsChange}
      required
    />,
  );
  return { onLocationChange, onCoordsChange };
}

const abrirSelector = () => fireEvent.click(screen.getByRole("combobox"));

describe("LocationPicker — elegir la zona", () => {
  it("elegir una zona deja el texto Y las coordenadas", async () => {
    const { onLocationChange, onCoordsChange } = montar();
    abrirSelector();

    fireEvent.change(await screen.findByPlaceholderText(/busca tu distrito/i), {
      target: { value: "miraflores" },
    });
    fireEvent.click(await screen.findByText("Miraflores, Lima"));

    expect(onLocationChange).toHaveBeenCalledWith("Miraflores, Lima");
    // Lo que de verdad importa: el aviso nace con coordenadas sin que el
    // anunciante tenga que tocar el mapa.
    const [lat, lng] = onCoordsChange.mock.calls[0];
    expect(lat).toBeCloseTo(-12.12167, 3);
    expect(lng).toBeCloseTo(-77.02917, 3);
  });

  it("se busca sin tildes y sin saberse el departamento", async () => {
    montar();
    abrirSelector();
    fireEvent.change(await screen.findByPlaceholderText(/busca tu distrito/i), {
      target: { value: "huanuco" },
    });
    expect(await screen.findByText("Huánuco")).toBeTruthy();
  });

  it("al reabrir un aviso ya guardado, su zona sale elegida", () => {
    montar("Miraflores, Lima", -12.12167, -77.02917);
    expect(screen.getByRole("combobox").textContent).toContain("Miraflores, Lima");
  });

  it("sin zona elegida invita a elegirla", () => {
    montar();
    expect(screen.getByRole("combobox").textContent).toMatch(/elige el distrito/i);
    expect(screen.getByText(/elige tu zona para que tu aviso salga/i)).toBeTruthy();
  });

  it("avisa cuando el anunciante marcó un punto propio, con su distancia", () => {
    // Un punto a ~1,5 km del centro de Miraflores.
    montar("Miraflores, Lima", -12.135, -77.028);
    expect(screen.getByText(/punto exacto marcado/i)).toBeTruthy();
  });

  it("no considera punto propio una diferencia de metros", () => {
    montar("Miraflores, Lima", -12.1217, -77.0292);
    expect(screen.queryByText(/punto exacto marcado/i)).toBeNull();
    expect(screen.getByText(/aparecerá en las búsquedas por cercanía/i)).toBeTruthy();
  });

  it("el mapa no se monta hasta que se pide (no estorba al publicar)", async () => {
    montar("Miraflores, Lima", -12.12167, -77.02917);
    expect(document.querySelector(".leaflet-container")).toBeNull();
    expect(screen.getByText(/marcar el punto exacto/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("combobox")).toBeTruthy());
  });
});
